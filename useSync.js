// ══════════════════════════════════════════════════════════════
// useSync — React hook bridging Gun.js to tank state
// ══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { DEVICE_ID, GUN_RELAYS } from "./constants.js";
import {
  initGun,
  generateSyncKey,
  generateSyncId,
  subscribeTank,
  pushFullTank,
  pushTankMeta,
  pushFish,
  tombstoneFish,
  loadSyncKeys,
  saveSyncKeys,
} from "./sync.js";

export default function useSync(tanks, setTanks, initP) {
  const [syncStatus, setSyncStatus] = useState("off");
  const [syncedTanks, setSyncedTanks] = useState(new Set());
  const prevTanksRef = useRef(null);
  const isRemoteRef = useRef(false);
  const unsubs = useRef({});
  const debounceRef = useRef(null);
  const syncKeysRef = useRef(loadSyncKeys());

  // Initialize Gun and track connection status
  useEffect(() => {
    try {
      initGun(GUN_RELAYS);
      setSyncStatus("connected");
    } catch {
      setSyncStatus("disconnected");
    }
  }, []);

  // Restore subscriptions for tanks that have sync keys
  useEffect(() => {
    const keys = syncKeysRef.current;
    const activeSyncs = new Set();

    for (const [tankId, { syncId, encKey }] of Object.entries(keys)) {
      if (!unsubs.current[tankId]) {
        startSubscription(tankId, syncId, encKey);
      }
      activeSyncs.add(tankId);
    }

    setSyncedTanks(activeSyncs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startSubscription(tankId, syncId, encKey) {
    // Unsubscribe if already subscribed
    if (unsubs.current[tankId]) {
      unsubs.current[tankId]();
    }

    const unsub = subscribeTank(syncId, encKey, (event) => {
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
        }
      } finally {
        // Delay clearing to avoid the immediate save re-pushing
        setTimeout(() => { isRemoteRef.current = false; }, 50);
      }
    });

    unsubs.current[tankId] = unsub;
  }

  // Detect local changes and push to Gun (debounced)
  useEffect(() => {
    if (isRemoteRef.current) return;
    if (!prevTanksRef.current) {
      prevTanksRef.current = tanks;
      return;
    }

    const prev = prevTanksRef.current;
    prevTanksRef.current = tanks;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const keys = syncKeysRef.current;

      for (const tank of tanks) {
        const sk = keys[tank.id];
        if (!sk) continue;
        const { syncId, encKey } = sk;

        const prevTank = prev.find((t) => t.id === tank.id);
        if (!prevTank) continue;

        // Check metadata changes
        if (
          tank.name !== prevTank.name ||
          tank.speedIdx !== prevTank.speedIdx
        ) {
          pushTankMeta(syncId, encKey, {
            name: tank.name,
            speedIdx: tank.speedIdx,
            ownerId: tank.ownerId,
          });
        }

        // Check fish changes
        const prevFishMap = new Map(
          (prevTank.fishes || []).map((f) => [f.id, f])
        );
        const currFishMap = new Map(
          (tank.fishes || []).map((f) => [f.id, f])
        );

        // Added or modified fish
        for (const [fid, fish] of currFishMap) {
          const pf = prevFishMap.get(fid);
          if (!pf || JSON.stringify(pf) !== JSON.stringify(fish)) {
            pushFish(syncId, encKey, fid, fish);
          }
        }

        // Deleted fish
        for (const [fid] of prevFishMap) {
          if (!currFishMap.has(fid)) {
            tombstoneFish(syncId, encKey, fid);
          }
        }
      }
    }, 300);
  }, [tanks]);

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      for (const unsub of Object.values(unsubs.current)) {
        unsub();
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
      const creds = { syncId, encKey };

      keys[tankId] = creds;
      syncKeysRef.current = keys;
      saveSyncKeys(keys);

      // Push full tank to Gun
      const tank = tanks.find((t) => t.id === tankId);
      if (tank) {
        await pushFullTank(syncId, encKey, tank);
      }

      // Start subscribing
      startSubscription(tankId, syncId, encKey);
      setSyncedTanks((prev) => new Set([...prev, tankId]));

      return creds;
    },
    [tanks] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const joinTank = useCallback(
    (pairData) => {
      const { tankId, syncId, encKey } = pairData;
      if (!syncId || !encKey) return;

      const keys = syncKeysRef.current;
      keys[tankId] = { syncId, encKey };
      syncKeysRef.current = keys;
      saveSyncKeys(keys);

      startSubscription(tankId, syncId, encKey);
      setSyncedTanks((prev) => new Set([...prev, tankId]));
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { syncStatus, syncedTanks, shareTank, joinTank };
}
