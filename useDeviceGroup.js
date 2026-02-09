// ══════════════════════════════════════════════════════════════
// useDeviceGroup — React hook for device-level pairing
// ══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { DEVICE_ID, NOSTR_RELAYS } from "./constants.js";
import { generateSyncKey, generateSyncId, loadCachedRelays } from "./sync.js";
import {
  loadDeviceGroup, saveDeviceGroup, clearDeviceGroup,
  generateDevicePairCode, publishTankKeys, subscribeTankKeys,
  publishDeviceSignal, subscribeDeviceSignals, checkDeviceLimit,
} from "./deviceGroup.js";

export default function useDeviceGroup(tanks, setTanks, initP, shareTank, joinTank, unsyncTank, getSyncKeys) {
  const [deviceGroup, setDeviceGroup] = useState(() => loadDeviceGroup());
  const unsubKeysRef = useRef(null);
  const unsubSignalsRef = useRef(null);
  const tanksRef = useRef(tanks);
  tanksRef.current = tanks;
  const deviceGroupRef = useRef(deviceGroup);
  deviceGroupRef.current = deviceGroup;
  const initializedRef = useRef(false);
  const prevTankIdsRef = useRef(null);

  const getRelays = useCallback(() => {
    return loadCachedRelays() || NOSTR_RELAYS;
  }, []);

  // Subscribe to device channel (both persistent + ephemeral)
  const subscribeToChannel = useCallback(async (groupKey, groupId, relays) => {
    // Unsubscribe old if any
    if (unsubKeysRef.current) { unsubKeysRef.current(); unsubKeysRef.current = null; }
    if (unsubSignalsRef.current) { unsubSignalsRef.current(); unsubSignalsRef.current = null; }

    const rl = relays || getRelays();

    // Persistent: tank keys
    unsubKeysRef.current = await subscribeTankKeys(groupKey, groupId, (tankKeysMap) => {
      // For each tank key not already in local sync keys, join
      const currentKeys = getSyncKeys();
      for (const [tankId, keyInfo] of Object.entries(tankKeysMap)) {
        if (currentKeys[tankId]) continue; // Already subscribed
        // Create tank locally if it doesn't exist
        const existing = tanksRef.current.find(t => t.id === tankId);
        if (!existing) {
          const nt = {
            id: tankId, name: keyInfo.name || "Synced Tank",
            fishes: [], speedIdx: 2, ownerId: null, peers: [],
          };
          setTanks(prev => {
            if (prev.find(t => t.id === tankId)) return prev;
            return [...prev, nt];
          });
        }
        // Join the tank's per-tank sync channel
        joinTank({
          tankId, syncId: keyInfo.syncId, encKey: keyInfo.encKey,
          relays: keyInfo.relays || rl, permission: "shared",
        });
      }
    }, rl);

    // Ephemeral: device signals
    unsubSignalsRef.current = await subscribeDeviceSignals(groupKey, (msg) => {
      if (msg.from === DEVICE_ID) return; // Ignore own signals

      if (msg.type === "device.join") {
        // Add device to group
        setDeviceGroup(prev => {
          if (!prev) return prev;
          const devices = [...(prev.devices || [])];
          if (!devices.find(d => d.deviceId === msg.deviceId)) {
            devices.push({
              deviceId: msg.deviceId,
              deviceName: msg.deviceName || msg.deviceId.slice(0, 12),
              pairedAt: msg.ts || new Date().toISOString(),
              lastSeenAt: msg.ts || new Date().toISOString(),
            });
          }
          const updated = { ...prev, devices };
          saveDeviceGroup(updated);
          return updated;
        });
        // Publish current tank keys so the new device gets them
        const keys = getSyncKeys();
        const tn = tanksRef.current;
        const keysMap = {};
        for (const [tankId, sk] of Object.entries(keys)) {
          const tank = tn.find(t => t.id === tankId);
          keysMap[tankId] = { syncId: sk.syncId, encKey: sk.encKey, relays: sk.relays, name: tank?.name || "Tank" };
        }
        if (Object.keys(keysMap).length > 0) {
          publishTankKeys(groupKey, groupId, keysMap, rl).catch(() => {});
        }

      } else if (msg.type === "device.leave") {
        setDeviceGroup(prev => {
          if (!prev) return prev;
          const devices = (prev.devices || []).filter(d => d.deviceId !== msg.deviceId);
          const updated = { ...prev, devices };
          saveDeviceGroup(updated);
          return updated;
        });

      } else if (msg.type === "tank.add") {
        // New tank from another device
        const currentKeys = getSyncKeys();
        if (!currentKeys[msg.tankId] && msg.syncId && msg.encKey) {
          const existing = tanksRef.current.find(t => t.id === msg.tankId);
          if (!existing) {
            const nt = {
              id: msg.tankId, name: msg.tankName || "Synced Tank",
              fishes: [], speedIdx: 2, ownerId: null, peers: [],
            };
            setTanks(prev => {
              if (prev.find(t => t.id === msg.tankId)) return prev;
              return [...prev, nt];
            });
          }
          joinTank({
            tankId: msg.tankId, syncId: msg.syncId, encKey: msg.encKey,
            relays: msg.relays || rl, permission: "shared",
          });
        }

      } else if (msg.type === "tank.remove") {
        unsyncTank(msg.tankId);
        setTanks(prev => prev.filter(t => t.id !== msg.tankId));
      }
    }, rl);
  }, [getSyncKeys, joinTank, setTanks, unsyncTank, getRelays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore device group on mount
  useEffect(() => {
    const dg = loadDeviceGroup();
    if (!dg || initializedRef.current) return;
    initializedRef.current = true;
    setDeviceGroup(dg);
    subscribeToChannel(dg.groupKey, dg.groupId, dg.relays || getRelays()).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-push new tanks to device group
  useEffect(() => {
    const dg = deviceGroupRef.current;
    if (!dg) return;

    const currentTankIds = new Set(tanks.map(t => t.id));
    const prevTankIds = prevTankIdsRef.current;
    prevTankIdsRef.current = currentTankIds;
    if (!prevTankIds) return; // First render, skip

    const currentKeys = getSyncKeys();
    const rl = dg.relays || getRelays();

    // Detect new tanks that don't have sync keys yet
    for (const tankId of currentTankIds) {
      if (!prevTankIds.has(tankId) && !currentKeys[tankId]) {
        // New local tank — auto-share it
        const tank = tanks.find(t => t.id === tankId);
        if (tank && (!tank.ownerId || tank.ownerId === DEVICE_ID)) {
          shareTank(tankId).then(creds => {
            // Publish tank.add ephemeral + update persistent tank.sync
            publishDeviceSignal(dg.groupKey, {
              type: "tank.add", from: DEVICE_ID,
              tankId, syncId: creds.syncId, encKey: creds.encKey,
              relays: creds.relays, tankName: tank.name, ts: new Date().toISOString(),
            }, rl).catch(() => {});
            // Update persistent snapshot
            const allKeys = getSyncKeys();
            const keysMap = {};
            const tn = tanksRef.current;
            for (const [tid, sk] of Object.entries(allKeys)) {
              const t = tn.find(tt => tt.id === tid);
              keysMap[tid] = { syncId: sk.syncId, encKey: sk.encKey, relays: sk.relays, name: t?.name || "Tank" };
            }
            publishTankKeys(dg.groupKey, dg.groupId, keysMap, rl).catch(() => {});
          }).catch(() => {});
        }
      }
    }

    // Detect removed tanks
    if (prevTankIds) {
      for (const tankId of prevTankIds) {
        if (!currentTankIds.has(tankId)) {
          publishDeviceSignal(dg.groupKey, {
            type: "tank.remove", from: DEVICE_ID, tankId, ts: new Date().toISOString(),
          }, rl).catch(() => {});
          // Update persistent snapshot
          const allKeys = getSyncKeys();
          const keysMap = {};
          const tn = tanksRef.current;
          for (const [tid, sk] of Object.entries(allKeys)) {
            if (tid === tankId) continue; // Exclude removed
            const t = tn.find(tt => tt.id === tid);
            keysMap[tid] = { syncId: sk.syncId, encKey: sk.encKey, relays: sk.relays, name: t?.name || "Tank" };
          }
          publishTankKeys(dg.groupKey, dg.groupId, keysMap, rl).catch(() => {});
        }
      }
    }
  }, [tanks]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── pairDevice — initiator flow ──
  const pairDevice = useCallback(async (deviceName) => {
    const groupId = generateSyncId();
    const groupKey = await generateSyncKey();
    const rl = getRelays();
    const dg = {
      groupId, groupKey, deviceName: deviceName || "My Device",
      createdAt: new Date().toISOString(),
      devices: [{
        deviceId: DEVICE_ID,
        deviceName: deviceName || "My Device",
        pairedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      }],
      relays: rl,
    };
    saveDeviceGroup(dg);
    setDeviceGroup(dg);
    deviceGroupRef.current = dg;
    prevTankIdsRef.current = new Set(tanksRef.current.map(t => t.id));

    await subscribeToChannel(groupKey, groupId, rl);

    // Publish current tank keys as persistent snapshot
    const keys = getSyncKeys();
    const keysMap = {};
    for (const [tankId, sk] of Object.entries(keys)) {
      const tank = tanksRef.current.find(t => t.id === tankId);
      keysMap[tankId] = { syncId: sk.syncId, encKey: sk.encKey, relays: sk.relays, name: tank?.name || "Tank" };
    }

    // Auto-share unshared tanks
    for (const tank of tanksRef.current) {
      if (!keys[tank.id] && (!tank.ownerId || tank.ownerId === DEVICE_ID)) {
        const creds = await shareTank(tank.id);
        keysMap[tank.id] = { syncId: creds.syncId, encKey: creds.encKey, relays: creds.relays, name: tank.name };
      }
    }

    if (Object.keys(keysMap).length > 0) {
      await publishTankKeys(groupKey, groupId, keysMap, rl).catch(() => {});
    }

    return dg;
  }, [getSyncKeys, shareTank, subscribeToChannel, getRelays]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── acceptDevicePair — receiver flow ──
  const acceptDevicePair = useCallback(async (pairData) => {
    const { groupId, groupKey, relays: pairRelays, deviceId: remoteDeviceId, deviceName: remoteDeviceName } = pairData;
    const rl = pairRelays || getRelays();
    const localName = (typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 30) : "Device");
    const dg = {
      groupId, groupKey, deviceName: localName,
      createdAt: new Date().toISOString(),
      devices: [
        { deviceId: remoteDeviceId, deviceName: remoteDeviceName, pairedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
        { deviceId: DEVICE_ID, deviceName: localName, pairedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
      ],
      relays: rl,
    };
    saveDeviceGroup(dg);
    setDeviceGroup(dg);
    deviceGroupRef.current = dg;
    prevTankIdsRef.current = new Set(tanksRef.current.map(t => t.id));

    await subscribeToChannel(groupKey, groupId, rl);

    // Announce ourselves
    await publishDeviceSignal(groupKey, {
      type: "device.join", from: DEVICE_ID,
      deviceId: DEVICE_ID, deviceName: localName,
      ts: new Date().toISOString(),
    }, rl).catch(() => {});

    // Tank keys will arrive via persistent subscription (subscribeTankKeys)
  }, [subscribeToChannel, getRelays]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── unpairDevice — leave group ──
  const unpairDevice = useCallback(async () => {
    const dg = deviceGroupRef.current;
    if (dg) {
      const rl = dg.relays || getRelays();
      await publishDeviceSignal(dg.groupKey, {
        type: "device.leave", from: DEVICE_ID,
        deviceId: DEVICE_ID, ts: new Date().toISOString(),
      }, rl).catch(() => {});
    }
    // Unsubscribe
    if (unsubKeysRef.current) { unsubKeysRef.current(); unsubKeysRef.current = null; }
    if (unsubSignalsRef.current) { unsubSignalsRef.current(); unsubSignalsRef.current = null; }
    clearDeviceGroup();
    setDeviceGroup(null);
    deviceGroupRef.current = null;
    // Per-tank sync keys stay (tanks remain synced through per-tank channels)
  }, [getRelays]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubKeysRef.current) unsubKeysRef.current();
      if (unsubSignalsRef.current) unsubSignalsRef.current();
    };
  }, []);

  return { deviceGroup, pairDevice, acceptDevicePair, unpairDevice };
}
