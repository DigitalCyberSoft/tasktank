// ══════════════════════════════════════════════════════════════
// TEST MOCKS — shared setup for all test files
// ══════════════════════════════════════════════════════════════
import { vi } from "vitest";
import "fake-indexeddb/auto";

// ── 1. Web Crypto polyfill ──
import { webcrypto } from "node:crypto";
if (!globalThis.crypto?.subtle) {
  globalThis.crypto = webcrypto;
}

// ── 2. DEVICE_ID seeding ──
localStorage.setItem("tt-did", "test-device-id");

// ── 3. RTCPeerConnection mock ──
class MockDataChannel {
  constructor(label, config) {
    this.label = label;
    this.config = config;
    this.readyState = "open";
    this.bufferedAmount = 0;
    this.bufferedAmountLowThreshold = 0;
    this.onmessage = null;
    this.onopen = null;
    this.onclose = null;
    this.onbufferedamountlow = null;
    this._sent = [];
  }
  send(data) { this._sent.push(data); }
  close() { this.readyState = "closed"; this.onclose?.(); }
}

class MockRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.connectionState = "new";
    this.localDescription = null;
    this.remoteDescription = null;
    this.onicecandidate = null;
    this.ondatachannel = null;
    this.onconnectionstatechange = null;
    this._iceQueue = [];
  }
  createDataChannel(label, config) {
    return new MockDataChannel(label, config);
  }
  async createOffer() {
    return { type: "offer", sdp: "mock-offer-sdp-" + Math.random().toString(36).slice(2, 8) };
  }
  async createAnswer() {
    return { type: "answer", sdp: "mock-answer-sdp-" + Math.random().toString(36).slice(2, 8) };
  }
  async setLocalDescription(desc) {
    this.localDescription = desc;
  }
  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
  }
  async addIceCandidate(candidate) {
    this._iceQueue.push(candidate);
  }
  close() {
    this.connectionState = "closed";
    this.onconnectionstatechange?.();
  }
}

class MockRTCSessionDescription {
  constructor(init) {
    this.type = init?.type;
    this.sdp = init?.sdp;
  }
}

class MockRTCIceCandidate {
  constructor(init) {
    this.candidate = init?.candidate;
    this.sdpMid = init?.sdpMid;
    this.sdpMLineIndex = init?.sdpMLineIndex;
  }
}

globalThis.RTCPeerConnection = MockRTCPeerConnection;
globalThis.RTCSessionDescription = MockRTCSessionDescription;
globalThis.RTCIceCandidate = MockRTCIceCandidate;

// Expose for test assertions
globalThis.MockDataChannel = MockDataChannel;
globalThis.MockRTCPeerConnection = MockRTCPeerConnection;

// ── 4. nostr-tools/pool mock ──
const _published = [];
const _subs = [];

class MockSub {
  constructor(relays, filters, opts) {
    this.relays = relays;
    this.filters = filters;
    this.opts = opts;
    this.closed = false;
  }
  close() { this.closed = true; }
}

class MockSimplePool {
  constructor() {
    this._published = _published;
    this._subs = _subs;
  }
  publish(relays, event) {
    _published.push({ relays, event });
    return relays.map(() => Promise.resolve("ok"));
  }
  subscribeMany(relays, filters, opts) {
    const sub = new MockSub(relays, filters, opts);
    _subs.push(sub);
    return sub;
  }
  async ensureRelay(url) {
    return { url, onclose: null };
  }
}

vi.mock("nostr-tools/pool", () => ({
  SimplePool: MockSimplePool,
}));

// Expose for test assertions
globalThis._mockPool = { _published, _subs, MockSimplePool, MockSub };

// ── 5. WebSocket mock ──
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onerror = null;
    this.onclose = null;
    this.onmessage = null;
    // Fire onopen asynchronously
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 10);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  send() {}
}

globalThis.WebSocket = MockWebSocket;

// ── 6. performance.now polyfill ──
if (typeof globalThis.performance === "undefined") {
  globalThis.performance = { now: () => Date.now() };
}

// ── 7. Cleanup ──
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("tt-did", "test-device-id");
  _published.length = 0;
  _subs.length = 0;
});
