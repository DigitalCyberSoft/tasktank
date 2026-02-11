// ══════════════════════════════════════════════════════════════
// SYNC — Nostr adapter (NIP-78) with AES-GCM encryption
// ══════════════════════════════════════════════════════════════
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { NOSTR_RELAYS } from "../constants.js";

let pool = null;
let connectionCb = null;
const connectedRelays = new Set();

export function initPool(relays = NOSTR_RELAYS) {
  if (pool) return pool;
  pool = new SimplePool();
  for (const url of relays) {
    pool.ensureRelay(url).then(relay => {
      connectedRelays.add(url);
      if (connectionCb) connectionCb("connected", { url });
      relay.onclose = () => {
        connectedRelays.delete(url);
        if (connectionCb) connectionCb("disconnected", { url });
      };
    }).catch(() => {});
  }
  return pool;
}

export function onConnectionChange(cb) { connectionCb = cb; }
export function getConnectedRelays() { return [...connectedRelays]; }

// ── Relay latency testing ──

const PREFERRED_RELAYS_KEY = "tt-preferred-relays";
const RELAY_TTL = 24 * 60 * 60 * 1000; // 24h

export async function testRelays(relayUrls = NOSTR_RELAYS, topN = 5) {
  const results = await Promise.allSettled(
    relayUrls.map(async (url) => {
      const start = performance.now();
      const ws = new WebSocket(url);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
        setTimeout(() => reject(new Error("timeout")), 4000);
      });
      const latency = performance.now() - start;
      ws.close();
      return { url, latency };
    })
  );
  const best = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value)
    .sort((a, b) => a.latency - b.latency)
    .slice(0, topN)
    .map(r => r.url);
  // Cache with TTL
  try {
    localStorage.setItem(PREFERRED_RELAYS_KEY, JSON.stringify({ ts: Date.now(), relays: best }));
  } catch {}
  return best;
}

export function loadCachedRelays() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFERRED_RELAYS_KEY));
    if (raw && Array.isArray(raw.relays) && raw.relays.length && (Date.now() - raw.ts) < RELAY_TTL) {
      return raw.relays;
    }
  } catch {}
  return null;
}

export function ensureRelays(relays) {
  const p = initPool();
  for (const url of relays) {
    if (!connectedRelays.has(url)) {
      p.ensureRelay(url).then(relay => {
        connectedRelays.add(url);
        if (connectionCb) connectionCb("connected", { url });
        relay.onclose = () => {
          connectedRelays.delete(url);
          if (connectionCb) connectionCb("disconnected", { url });
        };
      }).catch(() => {});
    }
  }
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

// ── Nostr keypair derivation (encKey → secp256k1 privkey) ──

export async function deriveKeypair(b64Key) {
  const raw = Uint8Array.from(atob(b64Key), c => c.charCodeAt(0));
  const skBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  const pubkey = getPublicKey(skBytes);
  return { skBytes, pubkey };
}

// ── Nostr event helpers (NIP-78 kind 30078) ──

async function publishEvent(encKey, dTag, data, relays = NOSTR_RELAYS) {
  const { skBytes } = await deriveKeypair(encKey);
  const ct = await encrypt(data, encKey);
  const event = finalizeEvent({
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["d", dTag]],
    content: ct,
  }, skBytes);
  const p = initPool();
  await Promise.allSettled(p.publish(relays, event));
}

export async function pushTankMeta(syncId, encKey, meta, relays = NOSTR_RELAYS) {
  await publishEvent(encKey, `${syncId}:m`, meta, relays);
}

export async function pushFish(syncId, encKey, fishId, fishData, relays = NOSTR_RELAYS) {
  await publishEvent(encKey, `${syncId}:f:${fishId}`, fishData, relays);
}

export async function tombstoneFish(syncId, encKey, fishId, relays = NOSTR_RELAYS) {
  await publishEvent(encKey, `${syncId}:f:${fishId}`, { _del: true }, relays);
}

export async function pushPeerInfo(syncId, encKey, deviceId, info, relays = NOSTR_RELAYS) {
  await publishEvent(encKey, `${syncId}:p:${deviceId}`, info, relays);
}

export async function pushFullTank(syncId, encKey, tank, relays = NOSTR_RELAYS) {
  await pushTankMeta(syncId, encKey, {
    name: tank.name,
    speedIdx: tank.speedIdx,
    ownerId: tank.ownerId,
  }, relays);
  for (const fish of (tank.fishes || [])) {
    await pushFish(syncId, encKey, fish.id, fish, relays);
  }
}

export async function subscribeTank(syncId, encKey, onChange, relays = NOSTR_RELAYS) {
  const { pubkey } = await deriveKeypair(encKey);
  const p = initPool();
  const sub = p.subscribeMany(relays,
    { kinds: [30078], authors: [pubkey] }
  , {
    async onevent(event) {
      const dTag = event.tags.find(t => t[0] === "d")?.[1];
      if (!dTag || !dTag.startsWith(syncId)) return;
      const data = await decrypt(event.content, encKey);
      if (!data) return;

      if (dTag === `${syncId}:m`) {
        onChange({ type: "meta", data });
      } else if (dTag.startsWith(`${syncId}:f:`)) {
        const fishId = dTag.slice(syncId.length + 3);
        if (data._del) onChange({ type: "fish.delete", fishId });
        else onChange({ type: "fish.upsert", fishId, data });
      } else if (dTag.startsWith(`${syncId}:p:`)) {
        const peerId = dTag.slice(syncId.length + 3);
        onChange({ type: "peer", peerId, data });
      }
    }
  });
  return () => sub.close();
}

// ── Ephemeral Events (WebRTC signaling) ──

export async function publishEphemeral(kind, encKey, data, relays = NOSTR_RELAYS) {
  const { skBytes } = await deriveKeypair(encKey);
  const ct = await encrypt(data, encKey);
  const event = finalizeEvent({
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: ct,
  }, skBytes);
  const p = initPool();
  await Promise.allSettled(p.publish(relays, event));
}

export async function subscribeEphemeral(kind, encKey, onEvent, relays = NOSTR_RELAYS) {
  const { pubkey } = await deriveKeypair(encKey);
  const p = initPool();
  const sub = p.subscribeMany(relays,
    { kinds: [kind], authors: [pubkey], since: Math.floor(Date.now() / 1000) }
  , {
    async onevent(event) {
      const data = await decrypt(event.content, encKey);
      if (!data) return;
      onEvent(data);
    }
  });
  return () => sub.close();
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
