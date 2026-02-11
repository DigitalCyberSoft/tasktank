// ══════════════════════════════════════════════════════════════
// SYNC TESTS — sync.js, signaling.js, deviceGroup.js
// ══════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  encrypt, decrypt, deriveKeypair, generateSyncKey, generateSyncId,
  loadSyncKeys, saveSyncKeys, loadCachedRelays,
  pushTankMeta, pushFish, tombstoneFish, pushPeerInfo, pushFullTank,
  subscribeTank, initPool,
} from "../src/sync/sync.js";
import {
  sendOffer, sendAnswer, sendIceCandidate, sendHeartbeat,
  subscribeSignaling, startHeartbeatInterval,
} from "../src/sync/signaling.js";
import {
  loadDeviceGroup, saveDeviceGroup, clearDeviceGroup,
  generateDevicePairCode, parseDevicePairCode, checkDeviceLimit,
} from "../src/sync/deviceGroup.js";

// ══════════════════════════════════════════════════════════════
// sync.js — Crypto & Keys
// ══════════════════════════════════════════════════════════════
describe("sync.js — Crypto", () => {
  it("encrypt → decrypt roundtrip", async () => {
    const key = await generateSyncKey();
    const data = { name: "Test Tank", fishes: [1, 2, 3] };
    const ct = await encrypt(data, key);
    const pt = await decrypt(ct, key);
    expect(pt).toEqual(data);
  });

  it("decrypt with wrong key returns null", async () => {
    const key1 = await generateSyncKey();
    const key2 = await generateSyncKey();
    const ct = await encrypt({ secret: true }, key1);
    const pt = await decrypt(ct, key2);
    expect(pt).toBeNull();
  });

  it("decrypt with corrupted ciphertext returns null", async () => {
    const key = await generateSyncKey();
    const pt = await decrypt("not-valid-base64!@#$", key);
    expect(pt).toBeNull();
  });

  it("deriveKeypair consistency (same input → same output)", async () => {
    const key = await generateSyncKey();
    const kp1 = await deriveKeypair(key);
    const kp2 = await deriveKeypair(key);
    expect(kp1.pubkey).toBe(kp2.pubkey);
    expect(Buffer.from(kp1.skBytes).toString("hex")).toBe(Buffer.from(kp2.skBytes).toString("hex"));
  });

  it("deriveKeypair uniqueness (different inputs → different outputs)", async () => {
    const key1 = await generateSyncKey();
    const key2 = await generateSyncKey();
    const kp1 = await deriveKeypair(key1);
    const kp2 = await deriveKeypair(key2);
    expect(kp1.pubkey).not.toBe(kp2.pubkey);
  });

  it("generateSyncKey produces valid base64 (32 bytes decoded)", async () => {
    const key = await generateSyncKey();
    const raw = Uint8Array.from(atob(key), c => c.charCodeAt(0));
    expect(raw.length).toBe(32);
  });

  it("generateSyncId matches xxxx-xxxx-xxxx format", () => {
    const id = generateSyncId();
    expect(id).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
  });
});

describe("sync.js — Key Storage", () => {
  it("loadSyncKeys/saveSyncKeys roundtrip", () => {
    const keys = { tank1: { syncId: "abc", encKey: "xyz" }, tank2: { syncId: "def", encKey: "uvw" } };
    saveSyncKeys(keys);
    expect(loadSyncKeys()).toEqual(keys);
  });

  it("loadSyncKeys with empty storage returns {}", () => {
    expect(loadSyncKeys()).toEqual({});
  });

  it("loadSyncKeys with corrupted storage returns {}", () => {
    localStorage.setItem("tt-sync-keys", "{bad json");
    expect(loadSyncKeys()).toEqual({});
  });

  it("loadCachedRelays returns null when fresh", () => {
    expect(loadCachedRelays()).toBeNull();
  });

  it("loadCachedRelays returns cached relays within TTL", () => {
    const relays = ["wss://relay1.test", "wss://relay2.test"];
    localStorage.setItem("tt-preferred-relays", JSON.stringify({ ts: Date.now(), relays }));
    expect(loadCachedRelays()).toEqual(relays);
  });

  it("loadCachedRelays returns null when expired", () => {
    const relays = ["wss://relay1.test"];
    localStorage.setItem("tt-preferred-relays", JSON.stringify({ ts: Date.now() - 25 * 60 * 60 * 1000, relays }));
    expect(loadCachedRelays()).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// sync.js — Publish & Subscribe
// ══════════════════════════════════════════════════════════════
describe("sync.js — Publish", () => {
  const testRelays = ["wss://test.relay"];

  beforeEach(() => {
    initPool(testRelays);
  });

  it("pushTankMeta publishes kind 30078 with correct d-tag", async () => {
    const key = await generateSyncKey();
    await pushTankMeta("sync-id", key, { name: "Test" }, testRelays);
    const pub = globalThis._mockPool._published;
    expect(pub.length).toBe(1);
    const event = pub[0].event;
    expect(event.kind).toBe(30078);
    expect(event.tags).toEqual([["d", "sync-id:m"]]);
    // Content should be encrypted (base64)
    expect(typeof event.content).toBe("string");
    const decrypted = await decrypt(event.content, key);
    expect(decrypted).toEqual({ name: "Test" });
  });

  it("pushFish publishes with d-tag {syncId}:f:{fishId}", async () => {
    const key = await generateSyncKey();
    await pushFish("sync-id", key, "fish-123", { task: "Buy milk" }, testRelays);
    const event = globalThis._mockPool._published[0].event;
    expect(event.tags).toEqual([["d", "sync-id:f:fish-123"]]);
    const decrypted = await decrypt(event.content, key);
    expect(decrypted).toEqual({ task: "Buy milk" });
  });

  it("tombstoneFish publishes {_del: true}", async () => {
    const key = await generateSyncKey();
    await tombstoneFish("sync-id", key, "fish-456", testRelays);
    const event = globalThis._mockPool._published[0].event;
    expect(event.tags).toEqual([["d", "sync-id:f:fish-456"]]);
    const decrypted = await decrypt(event.content, key);
    expect(decrypted).toEqual({ _del: true });
  });

  it("pushPeerInfo publishes with d-tag {syncId}:p:{deviceId}", async () => {
    const key = await generateSyncKey();
    await pushPeerInfo("sync-id", key, "dev-1", { name: "Phone" }, testRelays);
    const event = globalThis._mockPool._published[0].event;
    expect(event.tags).toEqual([["d", "sync-id:p:dev-1"]]);
  });

  it("pushFullTank publishes meta + N fish events", async () => {
    const key = await generateSyncKey();
    const tank = {
      name: "Work",
      speedIdx: 2,
      ownerId: "test-device-id",
      fishes: [
        { id: "f1", task: "Task 1" },
        { id: "f2", task: "Task 2" },
        { id: "f3", task: "Task 3" },
      ],
    };
    await pushFullTank("sync-id", key, tank, testRelays);
    const pub = globalThis._mockPool._published;
    expect(pub.length).toBe(4); // 1 meta + 3 fish
    expect(pub[0].event.tags).toEqual([["d", "sync-id:m"]]);
    expect(pub[1].event.tags).toEqual([["d", "sync-id:f:f1"]]);
    expect(pub[2].event.tags).toEqual([["d", "sync-id:f:f2"]]);
    expect(pub[3].event.tags).toEqual([["d", "sync-id:f:f3"]]);
  });
});

describe("sync.js — Subscribe", () => {
  const testRelays = ["wss://test.relay"];

  beforeEach(() => {
    initPool(testRelays);
  });

  it("subscribeTank dispatches meta events correctly", async () => {
    const key = await generateSyncKey();
    const changes = [];
    await subscribeTank("sync-id", key, (c) => changes.push(c), testRelays);

    // Inject event through mock subscription
    const sub = globalThis._mockPool._subs[globalThis._mockPool._subs.length - 1];
    const ct = await encrypt({ name: "Updated Tank" }, key);
    await sub.opts.onevent({ tags: [["d", "sync-id:m"]], content: ct });

    expect(changes.length).toBe(1);
    expect(changes[0].type).toBe("meta");
    expect(changes[0].data).toEqual({ name: "Updated Tank" });
  });

  it("subscribeTank dispatches fish.upsert events", async () => {
    const key = await generateSyncKey();
    const changes = [];
    await subscribeTank("sync-id", key, (c) => changes.push(c), testRelays);

    const sub = globalThis._mockPool._subs[globalThis._mockPool._subs.length - 1];
    const ct = await encrypt({ task: "New fish", importance: "critical" }, key);
    await sub.opts.onevent({ tags: [["d", "sync-id:f:fish-99"]], content: ct });

    expect(changes[0].type).toBe("fish.upsert");
    expect(changes[0].fishId).toBe("fish-99");
    expect(changes[0].data.task).toBe("New fish");
  });

  it("subscribeTank dispatches fish.delete events", async () => {
    const key = await generateSyncKey();
    const changes = [];
    await subscribeTank("sync-id", key, (c) => changes.push(c), testRelays);

    const sub = globalThis._mockPool._subs[globalThis._mockPool._subs.length - 1];
    const ct = await encrypt({ _del: true }, key);
    await sub.opts.onevent({ tags: [["d", "sync-id:f:fish-del"]], content: ct });

    expect(changes[0].type).toBe("fish.delete");
    expect(changes[0].fishId).toBe("fish-del");
  });

  it("subscribeTank dispatches peer events", async () => {
    const key = await generateSyncKey();
    const changes = [];
    await subscribeTank("sync-id", key, (c) => changes.push(c), testRelays);

    const sub = globalThis._mockPool._subs[globalThis._mockPool._subs.length - 1];
    const ct = await encrypt({ name: "Phone", status: "online" }, key);
    await sub.opts.onevent({ tags: [["d", "sync-id:p:dev-phone"]], content: ct });

    expect(changes[0].type).toBe("peer");
    expect(changes[0].peerId).toBe("dev-phone");
  });

  it("subscribeTank ignores events for other syncIds", async () => {
    const key = await generateSyncKey();
    const changes = [];
    await subscribeTank("sync-id", key, (c) => changes.push(c), testRelays);

    const sub = globalThis._mockPool._subs[globalThis._mockPool._subs.length - 1];
    const ct = await encrypt({ name: "Other" }, key);
    await sub.opts.onevent({ tags: [["d", "other-sync:m"]], content: ct });

    expect(changes.length).toBe(0);
  });

  it("subscribeTank returns working unsubscribe function", async () => {
    const key = await generateSyncKey();
    const unsub = await subscribeTank("sync-id", key, () => {}, testRelays);
    const sub = globalThis._mockPool._subs[globalThis._mockPool._subs.length - 1];
    expect(sub.closed).toBe(false);
    unsub();
    expect(sub.closed).toBe(true);
  });

  it("full roundtrip: publish → subscribe → verify", async () => {
    const key = await generateSyncKey();
    const changes = [];
    await subscribeTank("rt-sync", key, (c) => changes.push(c), testRelays);

    // Publish a fish
    await pushFish("rt-sync", key, "rt-fish", { task: "Roundtrip" }, testRelays);

    // The mock doesn't auto-deliver, so inject the published event into subscription
    const pub = globalThis._mockPool._published[0].event;
    const sub = globalThis._mockPool._subs[globalThis._mockPool._subs.length - 1];
    await sub.opts.onevent(pub);

    expect(changes.length).toBe(1);
    expect(changes[0].type).toBe("fish.upsert");
    expect(changes[0].data.task).toBe("Roundtrip");
  });
});

// ══════════════════════════════════════════════════════════════
// signaling.js
// ══════════════════════════════════════════════════════════════
describe("signaling.js", () => {
  const testRelays = ["wss://test.relay"];

  beforeEach(() => {
    initPool(testRelays);
  });

  it("sendOffer publishes correct ephemeral shape", async () => {
    const key = await generateSyncKey();
    await sendOffer(key, "remote-dev", { type: "offer", sdp: "test-sdp" }, testRelays);
    const pub = globalThis._mockPool._published[0].event;
    expect(pub.kind).toBe(20078);
    const decrypted = await decrypt(pub.content, key);
    expect(decrypted.type).toBe("offer");
    expect(decrypted.from).toBe("test-device-id");
    expect(decrypted.to).toBe("remote-dev");
    expect(decrypted.sdp).toBe("test-sdp");
  });

  it("sendAnswer publishes correct ephemeral shape", async () => {
    const key = await generateSyncKey();
    await sendAnswer(key, "remote-dev", { type: "answer", sdp: "answer-sdp" }, testRelays);
    const decrypted = await decrypt(globalThis._mockPool._published[0].event.content, key);
    expect(decrypted.type).toBe("answer");
    expect(decrypted.sdp).toBe("answer-sdp");
  });

  it("sendIceCandidate publishes correct shape", async () => {
    const key = await generateSyncKey();
    await sendIceCandidate(key, "remote-dev", {
      candidate: "candidate:123", sdpMid: "0", sdpMLineIndex: 0,
    }, testRelays);
    const decrypted = await decrypt(globalThis._mockPool._published[0].event.content, key);
    expect(decrypted.type).toBe("ice");
    expect(decrypted.candidate).toBe("candidate:123");
  });

  it("sendHeartbeat includes tank IDs", async () => {
    const key = await generateSyncKey();
    await sendHeartbeat(key, ["tank-1", "tank-2"], testRelays);
    const decrypted = await decrypt(globalThis._mockPool._published[0].event.content, key);
    expect(decrypted.type).toBe("heartbeat");
    expect(decrypted.tanks).toEqual(["tank-1", "tank-2"]);
  });

  it("subscribeSignaling routes offer to onOffer handler", async () => {
    const key = await generateSyncKey();
    const handlers = { onOffer: vi.fn(), onAnswer: vi.fn(), onIce: vi.fn(), onHeartbeat: vi.fn() };
    await subscribeSignaling(key, handlers, testRelays);

    const sub = globalThis._mockPool._subs[globalThis._mockPool._subs.length - 1];
    const ct = await encrypt({
      type: "offer", from: "remote-dev", to: "test-device-id", sdp: "offer-sdp", ts: Date.now(),
    }, key);
    await sub.opts.onevent({ kind: 20078, content: ct, tags: [] });

    expect(handlers.onOffer).toHaveBeenCalledWith("remote-dev", { type: "offer", sdp: "offer-sdp" });
  });

  it("subscribeSignaling ignores messages from self", async () => {
    const key = await generateSyncKey();
    const handlers = { onOffer: vi.fn() };
    await subscribeSignaling(key, handlers, testRelays);

    const sub = globalThis._mockPool._subs[globalThis._mockPool._subs.length - 1];
    const ct = await encrypt({
      type: "offer", from: "test-device-id", to: "remote-dev", sdp: "self-offer",
    }, key);
    await sub.opts.onevent({ kind: 20078, content: ct, tags: [] });

    expect(handlers.onOffer).not.toHaveBeenCalled();
  });

  it("startHeartbeatInterval fires immediately", async () => {
    // Use real timers since publishEphemeral uses crypto.subtle (real async)
    const key = await generateSyncKey();
    const getTankIds = () => ["tank-1"];

    const intervalId = startHeartbeatInterval(key, getTankIds, testRelays);

    // Wait for the immediate send to complete (involves async crypto operations)
    await new Promise(r => setTimeout(r, 200));

    expect(globalThis._mockPool._published.length).toBeGreaterThanOrEqual(1);
    const decrypted = await decrypt(globalThis._mockPool._published[0].event.content, key);
    expect(decrypted.type).toBe("heartbeat");
    expect(decrypted.tanks).toEqual(["tank-1"]);

    clearInterval(intervalId);
  });
});

// ══════════════════════════════════════════════════════════════
// deviceGroup.js
// ══════════════════════════════════════════════════════════════
describe("deviceGroup.js", () => {
  it("loadDeviceGroup/saveDeviceGroup roundtrip", () => {
    const dg = { groupId: "g1", groupKey: "k1", devices: [{ id: "d1", name: "Phone" }] };
    saveDeviceGroup(dg);
    expect(loadDeviceGroup()).toEqual(dg);
  });

  it("loadDeviceGroup returns null when empty", () => {
    expect(loadDeviceGroup()).toBeNull();
  });

  it("clearDeviceGroup removes stored data", () => {
    saveDeviceGroup({ groupId: "g1" });
    clearDeviceGroup();
    expect(loadDeviceGroup()).toBeNull();
  });

  it("generateDevicePairCode produces base64url with _dg: true", () => {
    const code = generateDevicePairCode("group-1", "key-1", "My Phone", ["wss://relay.test"]);
    expect(code).toBeTruthy();
    expect(code).not.toContain("+");
    expect(code).not.toContain("/");
    expect(code).not.toContain("=");
    // Decode and check
    const raw = code.replace(/-/g, "+").replace(/_/g, "/");
    const d = JSON.parse(atob(raw));
    expect(d._dg).toBe(true);
    expect(d.g).toBe("group-1");
    expect(d.k).toBe("key-1");
  });

  it("parseDevicePairCode roundtrip from different device", () => {
    // generateDevicePairCode embeds DEVICE_ID as `d`, parseDevicePairCode rejects if `d === DEVICE_ID`
    // So we manually construct a code from a "different" device
    const payload = {
      _dg: true, g: "group-1", k: "key-1", y: ["wss://relay.test"],
      d: "other-device-id", n: "My Phone",
      x: Math.floor((Date.now() + 600000) / 1000), v: 1,
    };
    const code = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const result = parseDevicePairCode(code);
    expect(result.error).toBeUndefined();
    expect(result.data.groupId).toBe("group-1");
    expect(result.data.groupKey).toBe("key-1");
    expect(result.data.relays).toEqual(["wss://relay.test"]);
  });

  it("parseDevicePairCode rejects expired code", () => {
    // Create a code with past expiry
    const payload = {
      _dg: true, g: "g1", k: "k1", y: [], d: "other-device",
      x: Math.floor((Date.now() - 60000) / 1000), v: 1,
    };
    const code = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const result = parseDevicePairCode(code);
    expect(result.error).toBe("Pairing code expired");
  });

  it("parseDevicePairCode rejects self-pairing", () => {
    const payload = {
      _dg: true, g: "g1", k: "k1", y: [], d: "test-device-id",
      x: Math.floor((Date.now() + 600000) / 1000), v: 1,
    };
    const code = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const result = parseDevicePairCode(code);
    expect(result.error).toBe("Can't pair with yourself");
  });

  it("checkDeviceLimit within limit", () => {
    const r = checkDeviceLimit([{ id: "d1" }, { id: "d2" }]);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
  });

  it("checkDeviceLimit at limit", () => {
    const devices = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}` }));
    const r = checkDeviceLimit(devices);
    expect(r.ok).toBe(false);
    expect(r.count).toBe(20);
    expect(r.max).toBe(20);
  });
});
