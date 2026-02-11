// ══════════════════════════════════════════════════════════════
// TRANSFER TESTS — fileStore.js, webrtc.js, fileTransfer.js
// ══════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PeerManager } from "../src/sync/webrtc.js";
import { FileTransferManager } from "../src/sync/fileTransfer.js";

// Mock signaling functions for PeerManager tests
vi.mock("../src/sync/signaling.js", () => ({
  sendOffer: vi.fn().mockResolvedValue(undefined),
  sendAnswer: vi.fn().mockResolvedValue(undefined),
  sendIceCandidate: vi.fn().mockResolvedValue(undefined),
}));

// Mock fileStore for FileTransferManager tests
vi.mock("../src/sync/fileStore.js", () => ({
  openFileDB: vi.fn(),
  storeFile: vi.fn().mockResolvedValue(undefined),
  getFile: vi.fn().mockResolvedValue(null),
  hasFile: vi.fn().mockResolvedValue(false),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  deleteFilesForFish: vi.fn().mockResolvedValue(undefined),
  deleteFilesForTank: vi.fn().mockResolvedValue(undefined),
  computeChecksum: vi.fn().mockResolvedValue("abc123checksum"),
}));

// ══════════════════════════════════════════════════════════════
// fileStore.js — use REAL implementations via importActual
// ══════════════════════════════════════════════════════════════
describe("fileStore.js", () => {
  let realFS;

  beforeEach(async () => {
    realFS = await vi.importActual("../src/sync/fileStore.js");
    // Reset the cached _dbPromise by deleting old DBs
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
    } catch {}
    // Force module to re-create DB connection by clearing its cache
    // We achieve this by directly setting the module-level variable
    // Since we can't, we just work with what we have — fake-indexeddb creates fresh state per DB name
  });

  it("storeFile + getFile roundtrip", async () => {
    const blob = new Blob(["hello world"], { type: "text/plain" });
    await realFS.storeFile("f1", "hello.txt", "text/plain", 11, "abc123", blob, "tank1", "fish1");
    const record = await realFS.getFile("f1");
    expect(record).toBeTruthy();
    expect(record.fileId).toBe("f1");
    expect(record.name).toBe("hello.txt");
    expect(record.mimeType).toBe("text/plain");
    expect(record.size).toBe(11);
    expect(record.checksum).toBe("abc123");
    expect(record.tankId).toBe("tank1");
    expect(record.fishId).toBe("fish1");
    expect(record.createdAt).toBeTruthy();
  });

  it("hasFile returns true for existing file", async () => {
    const blob = new Blob(["data"]);
    await realFS.storeFile("f2", "test.bin", "application/octet-stream", 4, "xyz", blob, "t1", "fi1");
    expect(await realFS.hasFile("f2")).toBe(true);
  });

  it("hasFile returns false for missing file", async () => {
    expect(await realFS.hasFile("nonexistent")).toBe(false);
  });

  it("deleteFile removes record", async () => {
    const blob = new Blob(["x"]);
    await realFS.storeFile("f3", "x.txt", "text/plain", 1, "c", blob, "t1", "fi1");
    expect(await realFS.hasFile("f3")).toBe(true);
    await realFS.deleteFile("f3");
    expect(await realFS.hasFile("f3")).toBe(false);
  });

  it("deleteFilesForFish deletes by index, leaves others", async () => {
    const blob = new Blob(["x"]);
    await realFS.storeFile("fa", "a.txt", "text/plain", 1, "ca", blob, "t1", "fish-A");
    await realFS.storeFile("fb", "b.txt", "text/plain", 1, "cb", blob, "t1", "fish-A");
    await realFS.storeFile("fc", "c.txt", "text/plain", 1, "cc", blob, "t1", "fish-B");
    await realFS.deleteFilesForFish("fish-A");
    expect(await realFS.hasFile("fa")).toBe(false);
    expect(await realFS.hasFile("fb")).toBe(false);
    expect(await realFS.hasFile("fc")).toBe(true);
  });

  it("deleteFilesForTank deletes by index, leaves others", async () => {
    const blob = new Blob(["x"]);
    await realFS.storeFile("fx", "x.txt", "text/plain", 1, "cx", blob, "tank-X", "f1");
    await realFS.storeFile("fy", "y.txt", "text/plain", 1, "cy", blob, "tank-X", "f2");
    await realFS.storeFile("fz", "z.txt", "text/plain", 1, "cz", blob, "tank-Y", "f3");
    await realFS.deleteFilesForTank("tank-X");
    expect(await realFS.hasFile("fx")).toBe(false);
    expect(await realFS.hasFile("fy")).toBe(false);
    expect(await realFS.hasFile("fz")).toBe(true);
  });

  it("computeChecksum produces 64-char hex", async () => {
    const blob = new Blob(["test data"]);
    const hash = await realFS.computeChecksum(blob);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("computeChecksum is deterministic", async () => {
    const blob1 = new Blob(["same content"]);
    const blob2 = new Blob(["same content"]);
    expect(await realFS.computeChecksum(blob1)).toBe(await realFS.computeChecksum(blob2));
  });

  it("computeChecksum differs for different data", async () => {
    const blob1 = new Blob(["data A"]);
    const blob2 = new Blob(["data B"]);
    expect(await realFS.computeChecksum(blob1)).not.toBe(await realFS.computeChecksum(blob2));
  });
});

// ══════════════════════════════════════════════════════════════
// webrtc.js — PeerManager
// ══════════════════════════════════════════════════════════════
describe("webrtc.js — PeerManager", () => {
  let pm;

  beforeEach(() => {
    pm = new PeerManager();
  });

  afterEach(() => {
    pm.destroy();
  });

  it("getOrCreateConnection creates new connection", () => {
    const pc = pm.getOrCreateConnection("remote-1", "key", ["wss://relay"]);
    expect(pc).toBeTruthy();
    expect(pc.connectionState).toBe("new");
  });

  it("getOrCreateConnection reuses connected connection", () => {
    const pc1 = pm.getOrCreateConnection("remote-1", "key", ["wss://relay"]);
    pc1.connectionState = "connected";
    const pc2 = pm.getOrCreateConnection("remote-1", "key", ["wss://relay"]);
    expect(pc2).toBe(pc1);
  });

  it("getOrCreateConnection replaces failed connection", () => {
    const pc1 = pm.getOrCreateConnection("remote-1", "key", ["wss://relay"]);
    pc1.connectionState = "failed";
    const pc2 = pm.getOrCreateConnection("remote-1", "key", ["wss://relay"]);
    expect(pc2).not.toBe(pc1);
    expect(pc2.connectionState).toBe("new");
  });

  it("createOffer creates DataChannel and calls sendOffer", async () => {
    const { sendOffer } = await import("../src/sync/signaling.js");
    pm.getOrCreateConnection("remote-1", "enc-key", ["wss://relay"]);
    await pm.createOffer("remote-1");
    expect(sendOffer).toHaveBeenCalled();
  });

  it("handleOffer sets remote description and creates answer", async () => {
    const { sendAnswer } = await import("../src/sync/signaling.js");
    await pm.handleOffer("remote-2", { type: "offer", sdp: "remote-offer" }, "enc-key", ["wss://relay"]);
    const entry = pm._conns["remote-2"];
    expect(entry.remoteDescSet).toBe(true);
    expect(entry.pc.remoteDescription).toBeTruthy();
    expect(sendAnswer).toHaveBeenCalled();
  });

  it("handleOffer flushes ICE queue", async () => {
    pm.getOrCreateConnection("remote-3", "key", ["wss://relay"]);
    await pm.addIceCandidate("remote-3", { candidate: "candidate:1" });
    await pm.addIceCandidate("remote-3", { candidate: "candidate:2" });
    expect(pm._conns["remote-3"].iceQueue.length).toBe(2);
    await pm.handleOffer("remote-3", { type: "offer", sdp: "sdp" }, "key", ["wss://relay"]);
    expect(pm._conns["remote-3"].iceQueue.length).toBe(0);
  });

  it("handleAnswer sets remote description and flushes ICE queue", async () => {
    pm.getOrCreateConnection("remote-4", "key", ["wss://relay"]);
    await pm.addIceCandidate("remote-4", { candidate: "c1" });
    await pm.handleAnswer("remote-4", { type: "answer", sdp: "answer-sdp" });
    expect(pm._conns["remote-4"].remoteDescSet).toBe(true);
    expect(pm._conns["remote-4"].iceQueue.length).toBe(0);
  });

  it("addIceCandidate queues when remoteDescSet is false", async () => {
    pm.getOrCreateConnection("remote-5", "key", ["wss://relay"]);
    await pm.addIceCandidate("remote-5", { candidate: "c1" });
    expect(pm._conns["remote-5"].iceQueue.length).toBe(1);
  });

  it("addIceCandidate applies when remoteDescSet is true", async () => {
    pm.getOrCreateConnection("remote-6", "key", ["wss://relay"]);
    pm._conns["remote-6"].remoteDescSet = true;
    await pm.addIceCandidate("remote-6", { candidate: "c1" });
    expect(pm._conns["remote-6"].iceQueue.length).toBe(0);
    expect(pm._conns["remote-6"].pc._iceQueue.length).toBe(1);
  });

  it("sendMessage returns false if no DC", () => {
    pm.getOrCreateConnection("remote-7", "key", ["wss://relay"]);
    expect(pm.sendMessage("remote-7", "tank1", { type: "sync" })).toBe(false);
  });

  it("sendMessage sends JSON with tankId and deviceId when DC open", () => {
    pm.getOrCreateConnection("remote-8", "key", ["wss://relay"]);
    const dc = pm._conns["remote-8"].pc.createDataChannel("test");
    dc.readyState = "open";
    pm._conns["remote-8"].dc = dc;
    const result = pm.sendMessage("remote-8", "tank1", { type: "sync", data: "hello" });
    expect(result).toBe(true);
    expect(dc._sent.length).toBe(1);
    const parsed = JSON.parse(dc._sent[0]);
    expect(parsed.tankId).toBe("tank1");
    expect(parsed.deviceId).toBe("test-device-id");
    expect(parsed.type).toBe("sync");
  });

  it("sendRaw sends without wrapping", () => {
    pm.getOrCreateConnection("remote-9", "key", ["wss://relay"]);
    const dc = pm._conns["remote-9"].pc.createDataChannel("test");
    dc.readyState = "open";
    pm._conns["remote-9"].dc = dc;
    pm.sendRaw("remote-9", { raw: true });
    const parsed = JSON.parse(dc._sent[0]);
    expect(parsed).toEqual({ raw: true });
    expect(parsed.tankId).toBeUndefined();
  });

  it("isConnected checks both DC readyState and PC connectionState", () => {
    pm.getOrCreateConnection("remote-10", "key", ["wss://relay"]);
    expect(pm.isConnected("remote-10")).toBe(false);
    const dc = pm._conns["remote-10"].pc.createDataChannel("test");
    dc.readyState = "open";
    pm._conns["remote-10"].dc = dc;
    pm._conns["remote-10"].pc.connectionState = "connected";
    expect(pm.isConnected("remote-10")).toBe(true);
    dc.readyState = "closed";
    expect(pm.isConnected("remote-10")).toBe(false);
  });

  it("getConnectedPeers returns only fully connected peers", () => {
    pm.getOrCreateConnection("conn-1", "key", ["wss://relay"]);
    const dc1 = pm._conns["conn-1"].pc.createDataChannel("test");
    dc1.readyState = "open";
    pm._conns["conn-1"].dc = dc1;
    pm._conns["conn-1"].pc.connectionState = "connected";
    pm.getOrCreateConnection("conn-2", "key", ["wss://relay"]);
    const peers = pm.getConnectedPeers();
    expect(Object.keys(peers)).toEqual(["conn-1"]);
    expect(peers["conn-1"].status).toBe("connected");
  });

  it("getConnectedPeers includes isLAN flag", () => {
    pm.getOrCreateConnection("lan-1", "key", ["wss://relay"]);
    const dc = pm._conns["lan-1"].pc.createDataChannel("test");
    dc.readyState = "open";
    pm._conns["lan-1"].dc = dc;
    pm._conns["lan-1"].pc.connectionState = "connected";
    pm._conns["lan-1"].metadata.isLAN = true;
    const peers = pm.getConnectedPeers();
    expect(peers["lan-1"].isLAN).toBe(true);
  });

  it("DC message routing: file.* → onFileMessage", () => {
    const onMsg = vi.fn();
    const onFile = vi.fn();
    pm.onMessage = onMsg;
    pm.onFileMessage = onFile;
    pm.getOrCreateConnection("route-1", "key", ["wss://relay"]);
    const dc = pm._conns["route-1"].pc.createDataChannel("test");
    pm._setupDC("route-1", dc);
    dc.onmessage({ data: JSON.stringify({ type: "file.offer", fileId: "f1" }) });
    expect(onFile).toHaveBeenCalledWith("route-1", { type: "file.offer", fileId: "f1" });
    expect(onMsg).not.toHaveBeenCalled();
    dc.onmessage({ data: JSON.stringify({ type: "sync", data: "hi" }) });
    expect(onMsg).toHaveBeenCalledWith("route-1", { type: "sync", data: "hi" });
  });

  it("closeConnection cleans up and fires onConnectionChange", () => {
    const changeFn = vi.fn();
    pm.onConnectionChange = changeFn;
    pm.getOrCreateConnection("close-1", "key", ["wss://relay"]);
    pm.closeConnection("close-1");
    expect(pm._conns["close-1"]).toBeUndefined();
    expect(changeFn).toHaveBeenCalledWith("close-1", "closed");
  });

  it("closeAll/destroy cleanup", () => {
    pm.getOrCreateConnection("d1", "key", ["wss://r"]);
    pm.getOrCreateConnection("d2", "key", ["wss://r"]);
    pm.destroy();
    expect(Object.keys(pm._conns).length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// fileTransfer.js — FileTransferManager (uses mocked fileStore)
// ══════════════════════════════════════════════════════════════
describe("fileTransfer.js — FileTransferManager", () => {
  let ftm;
  let sendFn;
  let mockPM;

  beforeEach(async () => {
    sendFn = vi.fn();
    mockPM = {
      getBufferedAmount: vi.fn().mockReturnValue(0),
      onBufferedAmountLow: vi.fn(),
    };
    ftm = new FileTransferManager(sendFn, mockPM);

    // Reset mocked fileStore functions
    const fs = await import("../src/sync/fileStore.js");
    fs.getFile.mockReset().mockResolvedValue(null);
    fs.storeFile.mockReset().mockResolvedValue(undefined);
    fs.hasFile.mockReset().mockResolvedValue(false);
    fs.computeChecksum.mockReset().mockResolvedValue("abc123checksum");
  });

  it("offerFiles sends file.offer for each local attachment", async () => {
    const attachments = [
      { fileId: "f1", hasLocalBlob: true, name: "a.txt", size: 100, mimeType: "text/plain", checksum: "c1", fishId: "fi1", tankId: "t1" },
      { fileId: "f2", hasLocalBlob: true, name: "b.txt", size: 200, mimeType: "text/plain", checksum: "c2", fishId: "fi1", tankId: "t1" },
    ];
    await ftm.offerFiles("remote-1", attachments);
    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(sendFn.mock.calls[0][1].type).toBe("file.offer");
    expect(sendFn.mock.calls[0][1].fileId).toBe("f1");
  });

  it("offerFiles skips non-local attachments", async () => {
    const attachments = [
      { fileId: "f1", hasLocalBlob: false, name: "a.txt" },
      { fileId: "f2", hasLocalBlob: true, name: "b.txt", size: 50, mimeType: "text/plain", checksum: "c2", fishId: "fi1", tankId: "t1" },
    ];
    await ftm.offerFiles("remote-1", attachments);
    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(sendFn.mock.calls[0][1].fileId).toBe("f2");
  });

  it("requestFile sends file.request with transferId", () => {
    const tid = ftm.requestFile("remote-1", "f1");
    expect(tid).toBeTruthy();
    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(sendFn.mock.calls[0][1].type).toBe("file.request");
    expect(sendFn.mock.calls[0][1].fileId).toBe("f1");
    expect(sendFn.mock.calls[0][1].transferId).toBe(tid);
  });

  it("_handleOffer auto-requests if file not local", async () => {
    const fs = await import("../src/sync/fileStore.js");
    fs.hasFile.mockResolvedValue(false);
    await ftm._handleOffer("remote-1", {
      type: "file.offer", fileId: "f1", name: "test.txt", size: 100,
      mimeType: "text/plain", checksum: "c1", fishId: "fi1", tankId: "t1",
    });
    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(sendFn.mock.calls[0][1].type).toBe("file.request");
  });

  it("_handleOffer skips if file already exists", async () => {
    const fs = await import("../src/sync/fileStore.js");
    fs.hasFile.mockResolvedValue(true);
    await ftm._handleOffer("remote-1", {
      type: "file.offer", fileId: "f1", name: "test.txt", size: 100,
    });
    expect(sendFn).not.toHaveBeenCalled();
  });

  it("_handleRequest sends error if file not found", async () => {
    const fs = await import("../src/sync/fileStore.js");
    fs.getFile.mockResolvedValue(null);
    await ftm._handleRequest("remote-1", { fileId: "f-missing", transferId: "t1" });
    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(sendFn.mock.calls[0][1].type).toBe("file.error");
  });

  it("_handleRequest sends chunks for existing file", async () => {
    const fs = await import("../src/sync/fileStore.js");
    const blob = new Blob(["hello world test data"]);
    fs.getFile.mockResolvedValue({ blob, name: "test.txt", mimeType: "text/plain" });
    await ftm._handleRequest("remote-1", { fileId: "f1", transferId: "t1" });
    await new Promise(r => setTimeout(r, 100));
    const types = sendFn.mock.calls.map(c => c[1].type);
    expect(types).toContain("file.chunk");
    expect(types).toContain("file.complete");
  });

  it("_handleChunk updates incoming transfer progress", () => {
    const progressFn = vi.fn();
    ftm.onProgress = progressFn;
    ftm._incoming.set("t1", {
      fileId: "f1", chunks: [], received: 0, size: 1000,
    });
    ftm._handleChunk("remote-1", {
      transferId: "t1", index: 0, total: 2,
      data: btoa("chunk-data"),
    });
    expect(ftm._incoming.get("t1").received).toBe(1);
    expect(progressFn).toHaveBeenCalledWith("f1", 0.5);
  });

  it("_handleComplete stores file and fires onFileReceived", async () => {
    const fs = await import("../src/sync/fileStore.js");
    fs.computeChecksum.mockResolvedValue("matching-checksum");
    fs.storeFile.mockResolvedValue(undefined);

    const receivedFn = vi.fn();
    ftm.onFileReceived = receivedFn;

    const chunkData = new Uint8Array([1, 2, 3, 4]);
    ftm._incoming.set("t1", {
      fileId: "f1", fishId: "fi1", tankId: "tk1",
      name: "test.txt", mimeType: "text/plain", size: 4, checksum: "matching-checksum",
      remoteDeviceId: "remote-1",
      chunks: [chunkData.buffer], received: 1,
    });

    await ftm._handleComplete("remote-1", { transferId: "t1", fileId: "f1" });
    expect(fs.storeFile).toHaveBeenCalled();
    expect(receivedFn).toHaveBeenCalledWith("f1", "fi1", "tk1");
    expect(sendFn.mock.calls.some(c => c[1].type === "file.ack" && c[1].success === true)).toBe(true);
  });

  it("_handleComplete rejects on checksum mismatch", async () => {
    const fs = await import("../src/sync/fileStore.js");
    fs.computeChecksum.mockResolvedValue("wrong-checksum");

    ftm._incoming.set("t1", {
      fileId: "f1", fishId: "fi1", tankId: "tk1",
      name: "test.txt", mimeType: "text/plain", size: 4, checksum: "expected-checksum",
      remoteDeviceId: "remote-1",
      chunks: [new Uint8Array([1, 2, 3, 4]).buffer], received: 1,
    });

    await ftm._handleComplete("remote-1", { transferId: "t1", fileId: "f1" });
    expect(sendFn.mock.calls.some(c => c[1].type === "file.ack" && c[1].success === false)).toBe(true);
    expect(ftm._incoming.has("t1")).toBe(false);
  });

  it("_handleError cancels corresponding transfers", () => {
    ftm._incoming.set("t1", {
      fileId: "f1", chunks: [], received: 0,
      onError: vi.fn(),
    });
    ftm._outgoing.set("t2", {
      remoteDeviceId: "remote-1", cancelled: false,
    });

    ftm._handleError("remote-1", { transferId: "t1", error: "test error" });
    expect(ftm._incoming.has("t1")).toBe(false);

    ftm._handleError("remote-1", { transferId: "t2", error: "send error" });
    expect(ftm._outgoing.has("t2")).toBe(false);
  });

  it("cleanup cancels outgoing and errors incoming for peer", () => {
    const errorFn = vi.fn();
    ftm._outgoing.set("t1", { remoteDeviceId: "remote-1", cancelled: false });
    ftm._incoming.set("t2", { remoteDeviceId: "remote-1", onError: errorFn });
    ftm._incoming.set("t3", { remoteDeviceId: "remote-2", onError: vi.fn() });
    ftm.cleanup("remote-1");
    expect(ftm._outgoing.has("t1")).toBe(false);
    expect(ftm._incoming.has("t2")).toBe(false);
    expect(ftm._incoming.has("t3")).toBe(true);
    expect(errorFn).toHaveBeenCalledWith("Peer disconnected");
  });

  it("getTransferProgress returns both directions", () => {
    ftm._incoming.set("t1", { fileId: "f1", size: 128 * 1024, received: 1 });
    ftm._outgoing.set("t2", { fileId: "f2", index: 3, total: 10 });
    const progress = ftm.getTransferProgress();
    expect(progress.f1.direction).toBe("down");
    expect(progress.f2.direction).toBe("up");
    expect(progress.f2.progress).toBeCloseTo(0.3);
  });
});
