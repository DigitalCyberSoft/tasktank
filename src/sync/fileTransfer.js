// ══════════════════════════════════════════════════════════════
// fileTransfer — chunked file transfer over WebRTC DataChannel
// ══════════════════════════════════════════════════════════════
import { FILE_CHUNK_SIZE } from "../constants.js";
import { getFile, storeFile, hasFile, computeChecksum } from "./fileStore.js";

let _transferCounter = 0;
const genTransferId = () => `ft-${Date.now().toString(36)}-${(++_transferCounter).toString(36)}`;

export class FileTransferManager {
  constructor(sendFn, peerManager) {
    this._send = sendFn;       // (remoteDeviceId, payload) => void
    this._pm = peerManager;    // PeerManager for backpressure
    this._outgoing = new Map(); // transferId -> { remoteDeviceId, fileId, blob, index, total, cancelled }
    this._incoming = new Map(); // transferId -> { fileId, fishId, tankId, name, mimeType, size, checksum, chunks[], received, onProgress, onComplete, onError }
    this.onFileReceived = null; // (fileId, fishId, tankId) => void — called after successful store
    this.onProgress = null;    // (fileId, progress) => void — 0-1
  }

  handleMessage(remoteDeviceId, msg) {
    switch (msg.type) {
      case "file.offer": return this._handleOffer(remoteDeviceId, msg);
      case "file.request": return this._handleRequest(remoteDeviceId, msg);
      case "file.chunk": return this._handleChunk(remoteDeviceId, msg);
      case "file.complete": return this._handleComplete(remoteDeviceId, msg);
      case "file.ack": return this._handleAck(remoteDeviceId, msg);
      case "file.error": return this._handleError(remoteDeviceId, msg);
    }
  }

  // Offer files we have locally to a peer
  async offerFiles(remoteDeviceId, attachments) {
    if (!attachments?.length) return;
    for (const att of attachments) {
      if (!att.fileId || !att.hasLocalBlob) continue;
      this._send(remoteDeviceId, {
        type: "file.offer",
        fileId: att.fileId,
        name: att.name,
        size: att.size,
        mimeType: att.mimeType,
        checksum: att.checksum,
        fishId: att.fishId,
        tankId: att.tankId,
      });
    }
  }

  // Request a file from a peer
  requestFile(remoteDeviceId, fileId, callbacks = {}) {
    const transferId = genTransferId();
    this._send(remoteDeviceId, { type: "file.request", fileId, transferId });
    // We don't store incoming state here since the sender drives chunks
    // The incoming state is created when chunks arrive
    this._incoming.set(transferId, {
      fileId,
      ...callbacks,
      chunks: [],
      received: 0,
    });
    return transferId;
  }

  // Cancel all transfers for a disconnected peer
  cleanup(remoteDeviceId) {
    for (const [tid, tr] of this._outgoing) {
      if (tr.remoteDeviceId === remoteDeviceId) {
        tr.cancelled = true;
        this._outgoing.delete(tid);
      }
    }
    for (const [tid, tr] of this._incoming) {
      if (tr.remoteDeviceId === remoteDeviceId) {
        tr.onError?.("Peer disconnected");
        this._incoming.delete(tid);
      }
    }
  }

  // ── Handlers ──

  async _handleOffer(remoteDeviceId, msg) {
    const { fileId, fishId, tankId } = msg;
    // Check if we already have this file
    const exists = await hasFile(fileId).catch(() => false);
    if (exists) return;
    // Auto-request: generate a transferId and ask for the file
    const transferId = genTransferId();
    this._incoming.set(transferId, {
      fileId, fishId, tankId,
      name: msg.name, mimeType: msg.mimeType, size: msg.size, checksum: msg.checksum,
      remoteDeviceId,
      chunks: [], received: 0,
    });
    this._send(remoteDeviceId, { type: "file.request", fileId, transferId });
  }

  async _handleRequest(remoteDeviceId, msg) {
    const { fileId, transferId } = msg;
    const record = await getFile(fileId).catch(() => null);
    if (!record || !record.blob) {
      this._send(remoteDeviceId, { type: "file.error", transferId, error: "File not found" });
      return;
    }
    await this._sendFile(remoteDeviceId, fileId, transferId, record.blob);
  }

  async _sendFile(remoteDeviceId, fileId, transferId, blob) {
    const total = Math.ceil(blob.size / FILE_CHUNK_SIZE);
    const tr = { remoteDeviceId, fileId, blob, index: 0, total, cancelled: false };
    this._outgoing.set(transferId, tr);

    const sendNext = async () => {
      while (tr.index < tr.total && !tr.cancelled) {
        const start = tr.index * FILE_CHUNK_SIZE;
        const end = Math.min(start + FILE_CHUNK_SIZE, blob.size);
        const slice = blob.slice(start, end);
        const buf = await slice.arrayBuffer();
        const data = _arrayBufToBase64(buf);

        this._send(remoteDeviceId, {
          type: "file.chunk",
          transferId,
          index: tr.index,
          total,
          data,
        });
        tr.index++;

        // Backpressure: if buffer is getting full, wait for drain
        if (this._pm) {
          const buffered = this._pm.getBufferedAmount(remoteDeviceId);
          if (buffered > FILE_CHUNK_SIZE * 4) {
            await new Promise(resolve => {
              this._pm.onBufferedAmountLow(remoteDeviceId, () => {
                this._pm.onBufferedAmountLow(remoteDeviceId, null);
                resolve();
              });
              // Safety timeout
              setTimeout(resolve, 2000);
            });
          }
        }
      }

      if (!tr.cancelled) {
        this._send(remoteDeviceId, { type: "file.complete", transferId, fileId });
      }
      this._outgoing.delete(transferId);
    };

    sendNext().catch(() => {
      this._send(remoteDeviceId, { type: "file.error", transferId, error: "Send failed" });
      this._outgoing.delete(transferId);
    });
  }

  _handleChunk(remoteDeviceId, msg) {
    const { transferId, index, total, data } = msg;
    let tr = this._incoming.get(transferId);
    if (!tr) return;
    tr.chunks[index] = _base64ToArrayBuf(data);
    tr.received++;
    const progress = tr.received / total;
    this.onProgress?.(tr.fileId, progress);
    tr.onProgress?.(progress);
  }

  async _handleComplete(remoteDeviceId, msg) {
    const { transferId, fileId } = msg;
    const tr = this._incoming.get(transferId);
    if (!tr) return;

    // Reassemble blob
    const blob = new Blob(tr.chunks, { type: tr.mimeType || "application/octet-stream" });
    tr.chunks = []; // free memory

    // Verify checksum if available
    if (tr.checksum) {
      const actual = await computeChecksum(blob).catch(() => null);
      if (actual && actual !== tr.checksum) {
        this._send(remoteDeviceId, { type: "file.ack", transferId, fileId, success: false });
        tr.onError?.("Checksum mismatch");
        this._incoming.delete(transferId);
        return;
      }
    }

    // Store in IndexedDB
    try {
      await storeFile(fileId, tr.name, tr.mimeType, tr.size, tr.checksum, blob, tr.tankId, tr.fishId);
      this._send(remoteDeviceId, { type: "file.ack", transferId, fileId, success: true });
      this.onFileReceived?.(fileId, tr.fishId, tr.tankId);
      tr.onComplete?.(fileId);
    } catch (err) {
      this._send(remoteDeviceId, { type: "file.ack", transferId, fileId, success: false });
      tr.onError?.(err?.name === "QuotaExceededError" ? "Storage full" : "Store failed");
    }

    this._incoming.delete(transferId);
  }

  _handleAck(remoteDeviceId, msg) {
    // Transfer complete from sender side — nothing to do, outgoing already cleaned up
  }

  _handleError(remoteDeviceId, msg) {
    const tr = this._incoming.get(msg.transferId);
    if (tr) {
      tr.onError?.(msg.error);
      this._incoming.delete(msg.transferId);
    }
    const otr = this._outgoing.get(msg.transferId);
    if (otr) {
      otr.cancelled = true;
      this._outgoing.delete(msg.transferId);
    }
  }

  // Get active transfer progress for UI
  getTransferProgress() {
    const progress = {};
    for (const [, tr] of this._incoming) {
      if (tr.fileId && tr.size) {
        progress[tr.fileId] = { direction: "down", progress: tr.received / Math.ceil(tr.size / FILE_CHUNK_SIZE) };
      }
    }
    for (const [, tr] of this._outgoing) {
      if (tr.fileId && tr.total) {
        progress[tr.fileId] = { direction: "up", progress: tr.index / tr.total };
      }
    }
    return progress;
  }
}

// ── Helpers ──

function _arrayBufToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function _base64ToArrayBuf(str) {
  const binary = atob(str);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}
