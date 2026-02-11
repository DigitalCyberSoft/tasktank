// ══════════════════════════════════════════════════════════════
// useBroadcastSync — same-browser-tab instant sync via BroadcastChannel
// ══════════════════════════════════════════════════════════════
import { useEffect, useRef } from "react";

const CHANNEL_NAME = "tasktank-sync";

export default function useBroadcastSync(tanks, setTanks, initP) {
  const isRemoteRef = useRef(false);
  const channelRef = useRef(null);
  const tanksRef = useRef(tanks);
  tanksRef.current = tanks;

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = bc;

    bc.onmessage = (e) => {
      const msg = e.data;
      if (msg?.type !== "full-state" || !Array.isArray(msg.tanks)) return;
      isRemoteRef.current = true;
      try {
        // Init animation positions for any new fish
        for (const tank of msg.tanks) {
          for (const fish of (tank.fishes || [])) {
            initP(fish.id, fish.completed ? "completed" : (fish.importance || "normal"));
          }
        }
        setTanks(msg.tanks);
      } finally {
        setTimeout(() => { isRemoteRef.current = false; }, 50);
      }
    };

    return () => { bc.close(); channelRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast on change (skip if change came from another tab)
  useEffect(() => {
    if (isRemoteRef.current) return;
    if (!channelRef.current) return;
    try {
      channelRef.current.postMessage({ type: "full-state", tanks, ts: Date.now() });
    } catch {}
  }, [tanks]);
}
