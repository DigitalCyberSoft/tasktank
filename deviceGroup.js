// ══════════════════════════════════════════════════════════════
// DEVICE GROUP — device-level pairing, storage, and channel protocol
// ══════════════════════════════════════════════════════════════
import { DEVICE_ID, MAX_SYNC_DEVICES, DEVICE_PAIR_CODE_VERSION, NOSTR_RELAYS } from "./constants.js";
import {
  generateSyncKey, generateSyncId, encrypt, decrypt, deriveKeypair,
  initPool, loadCachedRelays, ensureRelays,
} from "./sync.js";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";

const STORAGE_KEY = "tt-device-group";

// ── Storage ──

export function loadDeviceGroup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveDeviceGroup(dg) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(dg)); } catch {}
}

export function clearDeviceGroup() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ── Pairing codes ──

export function generateDevicePairCode(groupId, groupKey, deviceName, relays) {
  const payload = {
    _dg: true,
    g: groupId,
    k: groupKey,
    y: relays,
    x: Math.floor((Date.now() + 600000) / 1000), // 10 min expiry
    d: DEVICE_ID,
    n: deviceName || "Unknown Device",
    v: DEVICE_PAIR_CODE_VERSION,
  };
  try {
    return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch { return ""; }
}

export function parseDevicePairCode(code) {
  try {
    const raw = code.trim().replace(/-/g, '+').replace(/_/g, '/');
    const d = JSON.parse(atob(raw));
    if (!d._dg) return { error: "Not a device pair code" };
    if (!d.g || !d.k) return { error: "Invalid device pair code" };
    if (d.d === DEVICE_ID) return { error: "Can't pair with yourself" };
    if (d.x && d.x * 1000 < Date.now()) return { error: "Pairing code expired" };
    return {
      data: {
        groupId: d.g,
        groupKey: d.k,
        relays: (d.y && Array.isArray(d.y) && d.y.length) ? d.y : NOSTR_RELAYS,
        deviceId: d.d,
        deviceName: d.n || d.d?.slice(0, 12) || "Unknown",
      }
    };
  } catch { return { error: "Invalid code format" }; }
}

// ── Helpers ──

function getRelays() {
  return loadCachedRelays() || NOSTR_RELAYS;
}

// ── Device channel — persistent state (kind 30078, d-tag: {groupId}:keys) ──

export async function publishTankKeys(groupKey, groupId, syncKeysMap, relays) {
  const rl = relays || getRelays();
  ensureRelays(rl);
  const { skBytes } = await deriveKeypair(groupKey);
  const ct = await encrypt({ tanks: syncKeysMap }, groupKey);
  const event = finalizeEvent({
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["d", `${groupId}:keys`]],
    content: ct,
  }, skBytes);
  const p = initPool();
  await Promise.allSettled(p.publish(rl, event));
}

export async function subscribeTankKeys(groupKey, groupId, onKeys, relays) {
  const rl = relays || getRelays();
  ensureRelays(rl);
  const { pubkey } = await deriveKeypair(groupKey);
  const p = initPool();
  const sub = p.subscribeMany(rl,
    { kinds: [30078], authors: [pubkey], "#d": [`${groupId}:keys`] }
  , {
    async onevent(event) {
      const dTag = event.tags.find(t => t[0] === "d")?.[1];
      if (dTag !== `${groupId}:keys`) return;
      const data = await decrypt(event.content, groupKey);
      if (data && data.tanks) onKeys(data.tanks);
    }
  });
  return () => sub.close();
}

// ── Device channel — ephemeral signals (kind 20078) ──

export async function publishDeviceSignal(groupKey, msg, relays) {
  const rl = relays || getRelays();
  ensureRelays(rl);
  const { skBytes } = await deriveKeypair(groupKey);
  const ct = await encrypt(msg, groupKey);
  const event = finalizeEvent({
    kind: 20078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: ct,
  }, skBytes);
  const p = initPool();
  await Promise.allSettled(p.publish(rl, event));
}

export async function subscribeDeviceSignals(groupKey, onSignal, relays) {
  const rl = relays || getRelays();
  ensureRelays(rl);
  const { pubkey } = await deriveKeypair(groupKey);
  const p = initPool();
  const sub = p.subscribeMany(rl,
    { kinds: [20078], authors: [pubkey], since: Math.floor(Date.now() / 1000) }
  , {
    async onevent(event) {
      const data = await decrypt(event.content, groupKey);
      if (data) onSignal(data);
    }
  });
  return () => sub.close();
}

// ── Device limit check ──

export function checkDeviceLimit(devices) {
  const count = (devices || []).length;
  return { ok: count < MAX_SYNC_DEVICES, count, max: MAX_SYNC_DEVICES };
}
