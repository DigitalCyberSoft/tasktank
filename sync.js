// ══════════════════════════════════════════════════════════════
// SYNC — Gun.js adapter with AES-GCM encryption
// ══════════════════════════════════════════════════════════════
import Gun from "gun/gun";
import "gun/sea";
import { GUN_RELAYS } from "./constants.js";

let gunInstance = null;

export function initGun(relays = GUN_RELAYS) {
  if (gunInstance) return gunInstance;
  gunInstance = Gun({ peers: relays.map(r => r), localStorage: false, radisk: false });
  return gunInstance;
}

// ── Encryption (AES-GCM via Web Crypto) ──

export async function generateSyncKey() {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

async function importKey(b64) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(data, b64Key) {
  const key = await importKey(b64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  // Prepend IV to ciphertext
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(b64ct, b64Key) {
  try {
    const key = await importKey(b64Key);
    const combined = Uint8Array.from(atob(b64ct), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}

// ── Gun graph helpers ──

function tankNode(syncId) {
  const gun = initGun();
  return gun.get("tt").get(syncId);
}

export async function pushTankMeta(syncId, encKey, meta) {
  const ct = await encrypt(meta, encKey);
  tankNode(syncId).get("m").put(ct);
}

export async function pushFish(syncId, encKey, fishId, fishData) {
  const ct = await encrypt(fishData, encKey);
  tankNode(syncId).get("f").get(fishId).put(ct);
}

export async function tombstoneFish(syncId, encKey, fishId) {
  const ct = await encrypt({ _del: true }, encKey);
  tankNode(syncId).get("f").get(fishId).put(ct);
}

export async function pushPeerInfo(syncId, encKey, deviceId, info) {
  const ct = await encrypt(info, encKey);
  tankNode(syncId).get("peers").get(deviceId).put(ct);
}

export async function pushFullTank(syncId, encKey, tank) {
  await pushTankMeta(syncId, encKey, {
    name: tank.name,
    speedIdx: tank.speedIdx,
    ownerId: tank.ownerId,
  });
  for (const fish of (tank.fishes || [])) {
    await pushFish(syncId, encKey, fish.id, fish);
  }
}

export function subscribeTank(syncId, encKey, onChange) {
  const node = tankNode(syncId);
  let alive = true;

  // Subscribe to metadata changes
  node.get("m").on(async (data) => {
    if (!alive || !data || typeof data !== "string") return;
    const meta = await decrypt(data, encKey);
    if (meta) onChange({ type: "meta", data: meta });
  });

  // Subscribe to fish changes
  node.get("f").map().on(async (data, fishId) => {
    if (!alive || !data || typeof data !== "string") return;
    const fish = await decrypt(data, encKey);
    if (!fish) return;
    if (fish._del) {
      onChange({ type: "fish.delete", fishId });
    } else {
      onChange({ type: "fish.upsert", fishId, data: fish });
    }
  });

  // Subscribe to peer changes
  node.get("peers").map().on(async (data, peerId) => {
    if (!alive || !data || typeof data !== "string") return;
    const info = await decrypt(data, encKey);
    if (info) onChange({ type: "peer", peerId, data: info });
  });

  return () => {
    alive = false;
    node.get("m").off();
    node.get("f").map().off();
    node.get("peers").map().off();
  };
}

// ── Sync key persistence ──

const SYNC_KEYS_KEY = "tt-sync-keys";

export function loadSyncKeys() {
  try {
    const raw = localStorage.getItem(SYNC_KEYS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveSyncKeys(keys) {
  try { localStorage.setItem(SYNC_KEYS_KEY, JSON.stringify(keys)); } catch {}
}

export function generateSyncId() {
  const seg = () => Math.random().toString(36).slice(2, 6);
  return `${seg()}-${seg()}-${seg()}`;
}
