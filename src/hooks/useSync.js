// ══════════════════════════════════════════════════════════════
// useSync — React hook bridging Nostr + WebRTC to tank state
// ══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { DEVICE_ID, NOSTR_RELAYS, PRESENCE_TIMEOUT, NOSTR_PUSH_INTERVAL_CONNECTED } from "../constants.js";
import {
  initPool,
  onConnectionChange,
  generateSyncKey,
  generateSyncId,
  subscribeTank,
  pushFullTank,
  pushTankMeta,
  pushFish,
  tombstoneFish,
  pushPeerInfo,
  loadSyncKeys,
  saveSyncKeys,
  testRelays,
  loadCachedRelays,
  ensureRelays,
} from "../sync/sync.js";
import { PeerManager } from "../sync/webrtc.js";
import { subscribeSignaling, startHeartbeatInterval } from "../sync/signaling.js";
import { FileTransferManager } from "../sync/fileTransfer.js";
import { hasFile, deleteFilesForFish } from "../sync/fileStore.js";

export default function useSync(tanks, setTanks, initP) {
  const [syncStatus, setSyncStatus] = useState("off");
  const [syncedTanks, setSyncedTanks] = useState(new Set());
  const [peerConnectionStatus, setPeerConnectionStatus] = useState({});
  const [fileTransferStatus, setFileTransferStatus] = useState({}); // fileId -> { direction, progress }
  const prevTanksRef = useRef(null);
  const isRemoteRef = useRef(false);
  const unsubs = useRef({});
  const syncKeysRef = useRef(loadSyncKeys());
  const preferredRelays = useRef(loadCachedRelays() || NOSTR_RELAYS);
  const peerManagerRef = useRef(null);
  const fileTransferRef = useRef(null);
  const signalingUnsubs = useRef({});
  const heartbeatIntervals = useRef({});
  const presenceTimestamps = useRef({});
  const presenceCheckInterval = useRef(null);
  const nostrPushTimers = useRef({});
  // Keep a ref to latest tanks for use inside callbacks
  const tanksRef = useRef(tanks);
  tanksRef.current = tanks;

  // Helper: get relays for a sync key (stored relays > device preferred > default)
  const getRelays = (sk) => sk?.relays?.length ? sk.relays : preferredRelays.current;

  // Initialize Nostr pool, test relays, and track connection status
  useEffect(() => {
    initPool(NOSTR_RELAYS);
    setSyncStatus("connecting");
    const peers = new Set();
    onConnectionChange((status, peer) => {
      const id = peer?.url || peer?.id || "?";
      if (status === "connected") peers.add(id);
      else peers.delete(id);
      setSyncStatus(peers.size > 0 ? "connected" : "disconnected");
    });
    // Test relays on startup (use cached if fresh, otherwise re-test)
    const cached = loadCachedRelays();
    if (cached) {
      preferredRelays.current = cached;
      ensureRelays(cached);
    } else {
      testRelays().then(best => {
        if (best.length) {
          preferredRelays.current = best;
          ensureRelays(best);
        }
      }).catch(() => {});
    }
    const t = setTimeout(() => setSyncStatus(prev => prev === "connecting" ? "disconnected" : prev), 5000);
    return () => clearTimeout(t);
  }, []);

  // Initialize PeerManager + FileTransferManager (once)
  useEffect(() => {
    const pm = new PeerManager();
    peerManagerRef.current = pm;

    const ftm = new FileTransferManager(
      (remoteDeviceId, payload) => pm.sendRaw(remoteDeviceId, payload),
      pm,
    );
    fileTransferRef.current = ftm;

    ftm.onProgress = (fileId, progress) => {
      setFileTransferStatus(prev => ({ ...prev, [fileId]: { ...prev[fileId], progress } }));
    };

    ftm.onFileReceived = (fileId, fishId, tankId) => {
      setFileTransferStatus(prev => { const n = { ...prev }; delete n[fileId]; return n; });
      // Mark hasLocalBlob on the attachment
      isRemoteRef.current = true;
      setTanks(prev => prev.map(t => {
        if (t.id !== tankId) return t;
        return { ...t, fishes: (t.fishes || []).map(f => {
          if (f.id !== fishId) return f;
          return { ...f, attachments: (f.attachments || []).map(a =>
            a.fileId === fileId ? { ...a, hasLocalBlob: true } : a
          )};
        })};
      }));
      setTimeout(() => { isRemoteRef.current = false; }, 50);
    };

    pm.onFileMessage = (remoteDeviceId, msg) => {
      ftm.handleMessage(remoteDeviceId, msg);
    };

    pm.onMessage = (remoteDeviceId, msg) => {
      if (!msg.tankId) return;
      isRemoteRef.current = true;
      try {
        if (msg.type === "meta") {
          setTanks(prev => prev.map(t =>
            t.id === msg.tankId ? { ...t, name: msg.data.name || t.name, speedIdx: msg.data.speedIdx ?? t.speedIdx } : t
          ));
        } else if (msg.type === "fish.upsert") {
          setTanks(prev => prev.map(t => {
            if (t.id !== msg.tankId) return t;
            const existing = (t.fishes || []).find(f => f.id === msg.fishId);
            if (existing) {
              return { ...t, fishes: t.fishes.map(f => f.id === msg.fishId ? { ...f, ...msg.data, id: msg.fishId } : f) };
            } else {
              initP(msg.fishId, msg.data.importance || "normal");
              return { ...t, fishes: [...(t.fishes || []), { ...msg.data, id: msg.fishId }] };
            }
          }));
        } else if (msg.type === "fish.delete") {
          deleteFilesForFish(msg.fishId).catch(() => {});
          setTanks(prev => prev.map(t =>
            t.id === msg.tankId ? { ...t, fishes: (t.fishes || []).filter(f => f.id !== msg.fishId) } : t
          ));
        }
      } finally {
        setTimeout(() => { isRemoteRef.current = false; }, 50);
      }
    };

    pm.onConnectionChange = (remoteDeviceId, state) => {
      setPeerConnectionStatus(prev => {
        const next = { ...prev };
        if (state === "connected") {
          next[remoteDeviceId] = "connected";
        } else if (state === "closed") {
          delete next[remoteDeviceId];
        } else {
          next[remoteDeviceId] = "relay";
        }
        return next;
      });

      if (state === "connected") {
        // Offer all locally-available files to the new peer
        const allTanks = tanksRef.current;
        const keys = syncKeysRef.current;
        for (const tank of allTanks) {
          if (!keys[tank.id]) continue;
          for (const fish of (tank.fishes || [])) {
            const atts = (fish.attachments || []).filter(a => a.fileId && a.hasLocalBlob).map(a => ({ ...a, fishId: fish.id, tankId: tank.id }));
            if (atts.length) ftm.offerFiles(remoteDeviceId, atts);
          }
        }
      } else if (state === "closed" || state === "failed") {
        ftm.cleanup(remoteDeviceId);
      }
    };

    return () => { pm.destroy(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Presence timeout checker
  useEffect(() => {
    presenceCheckInterval.current = setInterval(() => {
      const now = Date.now();
      const pm = peerManagerRef.current;
      if (!pm) return;
      for (const [deviceId, ts] of Object.entries(presenceTimestamps.current)) {
        if (now - ts > PRESENCE_TIMEOUT && !pm.isConnected(deviceId)) {
          setPeerConnectionStatus(prev => {
            if (prev[deviceId] && prev[deviceId] !== "connected") {
              const next = { ...prev };
              delete next[deviceId];
              return next;
            }
            return prev;
          });
        }
      }
    }, 30000);
    return () => { if (presenceCheckInterval.current) clearInterval(presenceCheckInterval.current); };
  }, []);

  // Setup signaling for a given encKey
  function setupSignaling(encKey, relays, tankIds, relayOnly = false) {
    // Already subscribed to this encKey
    if (signalingUnsubs.current[encKey]) return;

    const pm = peerManagerRef.current;
    if (!pm) return;

    subscribeSignaling(encKey, {
      onOffer: relayOnly ? undefined : (from, offer) => {
        // Only the device with higher ID accepts offers (receiver)
        if (DEVICE_ID > from) {
          pm.handleOffer(from, offer, encKey, relays, {}).catch(() => {});
        }
      },
      onAnswer: relayOnly ? undefined : (from, answer) => {
        pm.handleAnswer(from, answer).catch(() => {});
      },
      onIce: relayOnly ? undefined : (from, candidate) => {
        pm.addIceCandidate(from, candidate).catch(() => {});
      },
      onHeartbeat: (from, hbTanks, ts) => {
        presenceTimestamps.current[from] = ts;
        setPeerConnectionStatus(prev => {
          if (!pm.isConnected(from) && !prev[from]) {
            return { ...prev, [from]: "relay" };
          }
          return prev;
        });
        // If not relay-only, not connected and we're the initiator, start connection
        if (!relayOnly && !pm.isConnected(from) && DEVICE_ID < from) {
          pm.getOrCreateConnection(from, encKey, relays, {});
          pm.createOffer(from).catch(() => {});
        }
      },
    }, relays).then(unsub => {
      signalingUnsubs.current[encKey] = unsub;
    }).catch(() => {});

    // Start heartbeat
    if (!heartbeatIntervals.current[encKey]) {
      heartbeatIntervals.current[encKey] = startHeartbeatInterval(encKey, () => {
        const keys = syncKeysRef.current;
        return Object.entries(keys).filter(([, sk]) => sk.encKey === encKey).map(([tid]) => tid);
      }, relays);
    }
  }

  // Restore subscriptions for tanks that have sync keys
  useEffect(() => {
    const keys = syncKeysRef.current;
    const activeSyncs = new Set();

    // Group by encKey for signaling setup
    const encKeyGroups = {};

    for (const [tankId, sk] of Object.entries(keys)) {
      const { syncId, encKey } = sk;
      const relays = getRelays(sk);
      if (!unsubs.current[tankId]) {
        startSubscription(tankId, syncId, encKey, relays);
        // Re-push owned tanks to migrate data to Nostr relays
        const tank = tanks.find(t => t.id === tankId);
        if (tank && (!tank.ownerId || tank.ownerId === DEVICE_ID)) {
          pushFullTank(syncId, encKey, tank, relays);
        }
      }
      activeSyncs.add(tankId);

      if (!encKeyGroups[encKey]) encKeyGroups[encKey] = { relays, tankIds: [] };
      encKeyGroups[encKey].tankIds.push(tankId);
    }

    // Setup signaling per unique encKey (relay-only if all tanks for this key are relay-only)
    for (const [encKey, group] of Object.entries(encKeyGroups)) {
      const allRelayOnly = group.tankIds.every(tid => keys[tid]?.relayOnly);
      setupSignaling(encKey, group.relays, group.tankIds, allRelayOnly);
    }

    setSyncedTanks(activeSyncs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startSubscription(tankId, syncId, encKey, relays) {
    // Unsubscribe if already subscribed
    if (unsubs.current[tankId]) {
      unsubs.current[tankId]();
    }

    const rl = relays || preferredRelays.current;
    ensureRelays(rl);

    const unsub = await subscribeTank(syncId, encKey, (event) => {
      isRemoteRef.current = true;
      try {
        if (event.type === "meta") {
          setTanks((prev) =>
            prev.map((t) =>
              t.id === tankId
                ? {
                    ...t,
                    name: event.data.name || t.name,
                    speedIdx: event.data.speedIdx ?? t.speedIdx,
                  }
                : t
            )
          );
        } else if (event.type === "fish.upsert") {
          setTanks((prev) =>
            prev.map((t) => {
              if (t.id !== tankId) return t;
              const existing = (t.fishes || []).find(
                (f) => f.id === event.fishId
              );
              if (existing) {
                // Merge: remote data overwrites
                return {
                  ...t,
                  fishes: t.fishes.map((f) =>
                    f.id === event.fishId ? { ...f, ...event.data, id: event.fishId } : f
                  ),
                };
              } else {
                // New fish from remote
                initP(event.fishId, event.data.importance || "normal");
                return {
                  ...t,
                  fishes: [
                    ...(t.fishes || []),
                    { ...event.data, id: event.fishId },
                  ],
                };
              }
            })
          );
        } else if (event.type === "fish.delete") {
          deleteFilesForFish(event.fishId).catch(() => {});
          setTanks((prev) =>
            prev.map((t) =>
              t.id === tankId
                ? {
                    ...t,
                    fishes: (t.fishes || []).filter(
                      (f) => f.id !== event.fishId
                    ),
                  }
                : t
            )
          );
        } else if (event.type === "peer") {
          setTanks((prev) =>
            prev.map((t) => {
              if (t.id !== tankId) return t;
              const peers = [...(t.peers || [])];
              const { peerId, data: peerData } = event;

              // If this peer left, remove them
              if (peerData._left) {
                return { ...t, peers: peers.filter((p) => p.deviceId !== peerId) };
              }

              // If this is our own entry, update myPermission
              let myPermission = t.myPermission;
              if (peerId === DEVICE_ID && peerData.permission) {
                myPermission = peerData.permission;
              }

              // Upsert peer
              const idx = peers.findIndex((p) => p.deviceId === peerId);
              const peerEntry = {
                deviceId: peerId,
                deviceName: peerData.deviceName || (idx >= 0 ? peers[idx].deviceName : peerId.slice(0, 12)),
                permission: peerData.permission || (idx >= 0 ? peers[idx].permission : "shared"),
                pairedAt: peerData.joinedAt || (idx >= 0 ? peers[idx].pairedAt : new Date().toISOString()),
                lastSyncAt: new Date().toISOString(),
              };
              if (idx >= 0) {
                peers[idx] = peerEntry;
              } else {
                peers.push(peerEntry);
              }

              return { ...t, peers, myPermission };
            })
          );
        }
      } finally {
        // Delay clearing to avoid the immediate save re-pushing
        setTimeout(() => { isRemoteRef.current = false; }, 50);
      }
    }, rl);

    unsubs.current[tankId] = unsub;
  }

  // Detect local changes and push (dual-path: WebRTC immediate + Nostr snapshot)
  useEffect(() => {
    if (isRemoteRef.current) return;
    if (!prevTanksRef.current) {
      prevTanksRef.current = tanks;
      return;
    }

    const prev = prevTanksRef.current;
    prevTanksRef.current = tanks;

    const keys = syncKeysRef.current;
    const pm = peerManagerRef.current;

    for (const tank of tanks) {
      const sk = keys[tank.id];
      if (!sk) continue;
      const { syncId, encKey } = sk;
      const relays = getRelays(sk);

      // Skip pushes for readonly tanks
      if (tank.ownerId && tank.ownerId !== DEVICE_ID && (tank.myPermission || "shared") === "readonly") continue;

      const prevTank = prev.find((t) => t.id === tank.id);
      if (!prevTank) continue;

      // Collect changes
      const changes = [];

      // Check metadata changes
      if (tank.name !== prevTank.name || tank.speedIdx !== prevTank.speedIdx) {
        changes.push({ type: "meta", data: { name: tank.name, speedIdx: tank.speedIdx, ownerId: tank.ownerId } });
      }

      // Check fish changes
      const prevFishMap = new Map((prevTank.fishes || []).map((f) => [f.id, f]));
      const currFishMap = new Map((tank.fishes || []).map((f) => [f.id, f]));

      for (const [fid, fish] of currFishMap) {
        const pf = prevFishMap.get(fid);
        if (!pf || JSON.stringify(pf) !== JSON.stringify(fish)) {
          // Strip hasLocalBlob from attachments before syncing (device-local flag)
          const syncData = (fish.attachments?.some(a => a.hasLocalBlob))
            ? { ...fish, attachments: fish.attachments.map(a => a.hasLocalBlob ? { ...a, hasLocalBlob: false } : a) }
            : fish;
          changes.push({ type: "fish.upsert", fishId: fid, data: syncData });
        }
      }

      for (const [fid] of prevFishMap) {
        if (!currFishMap.has(fid)) {
          changes.push({ type: "fish.delete", fishId: fid });
        }
      }

      if (changes.length === 0) continue;

      // WebRTC immediate: send to all connected peers
      let allPeersConnected = true;
      let hasPeers = false;
      const tankPeers = (tank.peers || []).filter(p => p.deviceId !== DEVICE_ID);
      for (const peer of tankPeers) {
        hasPeers = true;
        if (pm && pm.isConnected(peer.deviceId)) {
          for (const change of changes) {
            pm.sendMessage(peer.deviceId, tank.id, change);
          }
        } else {
          allPeersConnected = false;
        }
      }

      // Nostr snapshot: slow when all peers connected, fast otherwise
      if (nostrPushTimers.current[tank.id]) {
        clearTimeout(nostrPushTimers.current[tank.id]);
      }

      const nostrDelay = (hasPeers && allPeersConnected) ? NOSTR_PUSH_INTERVAL_CONNECTED : 300;
      nostrPushTimers.current[tank.id] = setTimeout(() => {
        for (const change of changes) {
          if (change.type === "meta") {
            pushTankMeta(syncId, encKey, change.data, relays);
          } else if (change.type === "fish.upsert") {
            pushFish(syncId, encKey, change.fishId, change.data, relays);
          } else if (change.type === "fish.delete") {
            tombstoneFish(syncId, encKey, change.fishId, relays);
          }
        }
      }, nostrDelay);
    }
  }, [tanks]);

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      for (const unsub of Object.values(unsubs.current)) {
        unsub();
      }
      for (const unsub of Object.values(signalingUnsubs.current)) {
        if (typeof unsub === "function") unsub();
      }
      for (const interval of Object.values(heartbeatIntervals.current)) {
        clearInterval(interval);
      }
      for (const timer of Object.values(nostrPushTimers.current)) {
        clearTimeout(timer);
      }
    };
  }, []);

  const shareTank = useCallback(
    async (tankId) => {
      const keys = syncKeysRef.current;

      // If already shared, return existing credentials
      if (keys[tankId]) {
        return keys[tankId];
      }

      const syncId = generateSyncId();
      const encKey = await generateSyncKey();
      const relays = preferredRelays.current;
      const creds = { syncId, encKey, relays };

      keys[tankId] = creds;
      syncKeysRef.current = keys;
      saveSyncKeys(keys);

      // Push full tank to Nostr
      const tank = tanksRef.current.find((t) => t.id === tankId);
      if (tank) {
        await pushFullTank(syncId, encKey, tank, relays);
      }

      // Start subscribing
      startSubscription(tankId, syncId, encKey, relays);
      setSyncedTanks((prev) => new Set([...prev, tankId]));

      // Setup signaling for WebRTC
      setupSignaling(encKey, relays, [tankId]);

      return creds;
    },
    [tanks] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const joinTank = useCallback(
    (pairData) => {
      const { tankId, syncId, encKey, permission, recipientName, relays: pairRelays, relayOnly } = pairData;
      if (!syncId || !encKey) return;

      // Union of sharer's relays and our preferred relays (deduplicated)
      const relays = [...new Set([...(pairRelays || []), ...preferredRelays.current])];

      const keys = syncKeysRef.current;
      keys[tankId] = { syncId, encKey, relays, ...(relayOnly ? { relayOnly: true } : {}) };
      syncKeysRef.current = keys;
      saveSyncKeys(keys);

      startSubscription(tankId, syncId, encKey, relays);
      setSyncedTanks((prev) => new Set([...prev, tankId]));

      // Setup signaling for WebRTC (skip direct connections if relay-only)
      setupSignaling(encKey, relays, [tankId], !!relayOnly);

      // Announce self to peers via Nostr
      const deviceName = recipientName || (typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 30) : "Device");
      pushPeerInfo(syncId, encKey, DEVICE_ID, {
        deviceName,
        permission: permission || "shared",
        joinedAt: new Date().toISOString(),
      }, relays);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const unsyncTank = useCallback(
    (tankId) => {
      const keys = syncKeysRef.current;
      const sk = keys[tankId];

      // Push _left to own peers entry so owner sees us removed
      if (sk) {
        pushPeerInfo(sk.syncId, sk.encKey, DEVICE_ID, { _left: true }, getRelays(sk));
      }

      // Unsubscribe from Nostr
      if (unsubs.current[tankId]) {
        unsubs.current[tankId]();
        delete unsubs.current[tankId];
      }

      // Clean up WebRTC: close connections for peers that don't share other tanks
      if (sk) {
        const encKey = sk.encKey;
        delete keys[tankId];
        syncKeysRef.current = keys;
        saveSyncKeys(keys);

        // Check if any other tank still uses this encKey
        const otherTanksWithKey = Object.values(keys).some(k => k.encKey === encKey);
        if (!otherTanksWithKey) {
          // Tear down signaling for this encKey
          if (signalingUnsubs.current[encKey]) {
            signalingUnsubs.current[encKey]();
            delete signalingUnsubs.current[encKey];
          }
          if (heartbeatIntervals.current[encKey]) {
            clearInterval(heartbeatIntervals.current[encKey]);
            delete heartbeatIntervals.current[encKey];
          }
        }

        // Clear Nostr push timer
        if (nostrPushTimers.current[tankId]) {
          clearTimeout(nostrPushTimers.current[tankId]);
          delete nostrPushTimers.current[tankId];
        }
      } else {
        delete keys[tankId];
        syncKeysRef.current = keys;
        saveSyncKeys(keys);
      }

      // Remove from syncedTanks
      setSyncedTanks((prev) => {
        const next = new Set(prev);
        next.delete(tankId);
        return next;
      });
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const updatePeerGun = useCallback(
    (tankId, targetDeviceId, info) => {
      const keys = syncKeysRef.current;
      const sk = keys[tankId];
      if (!sk) return;
      pushPeerInfo(sk.syncId, sk.encKey, targetDeviceId, info, getRelays(sk));
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const getSyncKeys = useCallback(() => ({ ...syncKeysRef.current }), []);

  const requestFileFromPeer = useCallback((fileId, fishId, tankId) => {
    const pm = peerManagerRef.current;
    const ftm = fileTransferRef.current;
    if (!pm || !ftm) return;
    const peers = pm.getConnectedPeers();
    for (const peerId of Object.keys(peers)) {
      ftm.requestFile(peerId, fileId, {});
      break; // request from first connected peer
    }
  }, []);

  return { syncStatus, syncedTanks, peerConnectionStatus, fileTransferStatus, shareTank, joinTank, unsyncTank, updatePeerGun, getSyncKeys, requestFileFromPeer };
}
