// ══════════════════════════════════════════════════════════════
// WEBRTC — PeerManager for device-to-device DataChannels
// ══════════════════════════════════════════════════════════════
import { RTC_CONFIG, DEVICE_ID, FILE_CHUNK_SIZE } from "../constants.js";
import { sendOffer, sendAnswer, sendIceCandidate } from "./signaling.js";

const DC_LABEL = "tasktank";
const DC_CONFIG = { ordered: true, maxRetransmits: 3 };
const MAX_BACKOFF = 60000;

export class PeerManager {
  constructor() {
    this._conns = {};       // remoteDeviceId -> { pc, dc, metadata, iceQueue, backoff, reconnectTimer, remoteDescSet }
    this.onMessage = null;  // (remoteDeviceId, msg) => void
    this.onFileMessage = null; // (remoteDeviceId, msg) => void
    this.onConnectionChange = null; // (remoteDeviceId, state) => void
    this._visHandler = this._onVisibilityChange.bind(this);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this._visHandler);
    }
  }

  // ── Connection lifecycle ──

  getOrCreateConnection(remoteDeviceId, encKey, relays, metadata) {
    if (this._conns[remoteDeviceId]?.pc) {
      const state = this._conns[remoteDeviceId].pc.connectionState;
      if (state === "connected" || state === "connecting" || state === "new") {
        return this._conns[remoteDeviceId].pc;
      }
    }
    return this._createPC(remoteDeviceId, encKey, relays, metadata);
  }

  _createPC(remoteDeviceId, encKey, relays, metadata) {
    // Clean up old connection
    if (this._conns[remoteDeviceId]) {
      this._cleanupConn(remoteDeviceId, false);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const entry = {
      pc,
      dc: null,
      metadata: { encKey, relays, ...metadata },
      iceQueue: [],
      backoff: 2000,
      reconnectTimer: null,
      remoteDescSet: false,
    };
    this._conns[remoteDeviceId] = entry;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const c = e.candidate.candidate;
        if (c.includes(".local") || e.candidate.type === "host") {
          entry.metadata.isLAN = true;
        }
        sendIceCandidate(encKey, remoteDeviceId, e.candidate, relays).catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.onConnectionChange?.(remoteDeviceId, state);

      if (state === "connected") {
        entry.backoff = 2000; // reset backoff on success
      } else if (state === "failed" || state === "disconnected") {
        this._scheduleReconnect(remoteDeviceId);
      }
    };

    pc.ondatachannel = (e) => {
      this._setupDC(remoteDeviceId, e.channel);
    };

    return pc;
  }

  _setupDC(remoteDeviceId, dc) {
    const entry = this._conns[remoteDeviceId];
    if (!entry) return;
    entry.dc = dc;

    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type?.startsWith("file.")) this.onFileMessage?.(remoteDeviceId, msg);
        else this.onMessage?.(remoteDeviceId, msg);
      } catch {}
    };

    dc.onclose = () => {
      if (entry.dc === dc) entry.dc = null;
    };
  }

  async createOffer(remoteDeviceId) {
    const entry = this._conns[remoteDeviceId];
    if (!entry) return;
    const { pc, metadata } = entry;

    // Create DataChannel (initiator creates it)
    const dc = pc.createDataChannel(DC_LABEL, DC_CONFIG);
    this._setupDC(remoteDeviceId, dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendOffer(metadata.encKey, remoteDeviceId, offer, metadata.relays);
  }

  async handleOffer(remoteDeviceId, offer, encKey, relays, metadata) {
    const pc = this.getOrCreateConnection(remoteDeviceId, encKey, relays, metadata);
    const entry = this._conns[remoteDeviceId];

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    entry.remoteDescSet = true;

    // Flush queued ICE candidates
    for (const c of entry.iceQueue) {
      await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    entry.iceQueue = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendAnswer(encKey, remoteDeviceId, answer, relays);
  }

  async handleAnswer(remoteDeviceId, answer) {
    const entry = this._conns[remoteDeviceId];
    if (!entry) return;
    await entry.pc.setRemoteDescription(new RTCSessionDescription(answer));
    entry.remoteDescSet = true;

    // Flush queued ICE candidates
    for (const c of entry.iceQueue) {
      await entry.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    entry.iceQueue = [];
  }

  async addIceCandidate(remoteDeviceId, candidate) {
    const entry = this._conns[remoteDeviceId];
    if (!entry) return;
    if (!entry.remoteDescSet) {
      entry.iceQueue.push(candidate);
    } else {
      await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  }

  // ── DataChannel messaging ──

  sendMessage(remoteDeviceId, tankId, payload) {
    const entry = this._conns[remoteDeviceId];
    if (!entry?.dc || entry.dc.readyState !== "open") return false;
    try {
      entry.dc.send(JSON.stringify({ tankId, ...payload, ts: Date.now(), deviceId: DEVICE_ID }));
      return true;
    } catch {
      return false;
    }
  }

  sendRaw(remoteDeviceId, payload) {
    const entry = this._conns[remoteDeviceId];
    if (!entry?.dc || entry.dc.readyState !== "open") return false;
    try {
      entry.dc.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  getBufferedAmount(remoteDeviceId) {
    const entry = this._conns[remoteDeviceId];
    return entry?.dc?.bufferedAmount ?? 0;
  }

  onBufferedAmountLow(remoteDeviceId, cb) {
    const entry = this._conns[remoteDeviceId];
    if (!entry?.dc) return;
    entry.dc.bufferedAmountLowThreshold = FILE_CHUNK_SIZE;
    entry.dc.onbufferedamountlow = cb;
  }

  // ── State queries ──

  isConnected(remoteDeviceId) {
    const entry = this._conns[remoteDeviceId];
    return entry?.dc?.readyState === "open" && entry.pc?.connectionState === "connected";
  }

  getConnectionState(remoteDeviceId) {
    return this._conns[remoteDeviceId]?.pc?.connectionState || "closed";
  }

  getConnectedPeers() {
    const result = {};
    for (const [id, entry] of Object.entries(this._conns)) {
      if (entry.dc?.readyState === "open" && entry.pc?.connectionState === "connected") {
        result[id] = { status: "connected", isLAN: !!entry.metadata.isLAN };
      }
    }
    return result;
  }

  // ── Reconnection ──

  _scheduleReconnect(remoteDeviceId) {
    const entry = this._conns[remoteDeviceId];
    if (!entry || entry.reconnectTimer) return;

    // Only initiator reconnects (deterministic: lower deviceId initiates)
    if (DEVICE_ID > remoteDeviceId) return;

    const delay = entry.backoff;
    entry.backoff = Math.min(entry.backoff * 2, MAX_BACKOFF);

    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      const { encKey, relays } = entry.metadata;
      this._createPC(remoteDeviceId, encKey, relays, entry.metadata);
      this.createOffer(remoteDeviceId).catch(() => {});
    }, delay);
  }

  _onVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    for (const [id, entry] of Object.entries(this._conns)) {
      const state = entry.pc?.connectionState;
      if (state === "failed" || state === "disconnected" || state === "closed") {
        if (DEVICE_ID < id) {
          // We're the initiator, attempt reconnect
          if (entry.reconnectTimer) {
            clearTimeout(entry.reconnectTimer);
            entry.reconnectTimer = null;
          }
          const { encKey, relays } = entry.metadata;
          this._createPC(id, encKey, relays, entry.metadata);
          this.createOffer(id).catch(() => {});
        }
      }
    }
  }

  // ── Cleanup ──

  _cleanupConn(remoteDeviceId, remove = true) {
    const entry = this._conns[remoteDeviceId];
    if (!entry) return;
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }
    try { entry.dc?.close(); } catch {}
    try { entry.pc?.close(); } catch {}
    if (remove) delete this._conns[remoteDeviceId];
  }

  closeConnection(remoteDeviceId) {
    this._cleanupConn(remoteDeviceId, true);
    this.onConnectionChange?.(remoteDeviceId, "closed");
  }

  closeAll() {
    for (const id of Object.keys(this._conns)) {
      this._cleanupConn(id, true);
    }
  }

  destroy() {
    this.closeAll();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this._visHandler);
    }
  }
}
