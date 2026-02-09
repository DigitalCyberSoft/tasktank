// ══════════════════════════════════════════════════════════════
// DEV PANEL — Debug panel + mock peer simulator (dev-only)
// ══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { uid, NOSTR_RELAYS } from "./constants.js";
import { getConnectedRelays, testRelays, pushFish, pushTankMeta, tombstoneFish } from "./sync.js";

const MOCK_DEVICE_ID = "mock-" + uid();

const S = {
  panel: {
    position: "fixed", bottom: 12, right: 12, width: 360, maxHeight: "70vh",
    background: "rgba(8,12,24,.97)", border: "1px solid rgba(77,150,255,.2)",
    borderRadius: 10, zIndex: 9999, display: "flex", flexDirection: "column",
    boxShadow: "0 8px 32px rgba(0,0,0,.5)", fontFamily: "'SF Mono','Fira Code',monospace",
    color: "#d0d8e4", fontSize: 10, overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "8px 12px", background: "rgba(77,150,255,.08)",
    borderBottom: "1px solid rgba(77,150,255,.15)",
  },
  title: { fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#4D96FF" },
  closeBtn: {
    background: "none", border: "none", color: "#4D96FF", cursor: "pointer",
    fontSize: 14, padding: "0 4px", fontFamily: "inherit",
  },
  body: { flex: 1, overflow: "auto", padding: "8px 12px" },
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: "#4D96FF",
    marginBottom: 6, cursor: "pointer", userSelect: "none",
  },
  row: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 },
  label: { fontSize: 9, opacity: 0.5, minWidth: 60 },
  value: { fontSize: 9, color: "#6BCB77" },
  valueOff: { fontSize: 9, color: "#FF6B6B" },
  input: {
    flex: 1, padding: "4px 6px", background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.08)", borderRadius: 4,
    color: "#d0d8e4", fontSize: 9, fontFamily: "inherit",
  },
  btn: {
    padding: "4px 10px", background: "rgba(77,150,255,.12)",
    border: "1px solid rgba(77,150,255,.2)", borderRadius: 4,
    color: "#4D96FF", fontSize: 9, cursor: "pointer", fontFamily: "inherit",
    fontWeight: 600,
  },
  btnDanger: {
    padding: "4px 10px", background: "rgba(255,75,87,.1)",
    border: "1px solid rgba(255,75,87,.2)", borderRadius: 4,
    color: "#FF4757", fontSize: 9, cursor: "pointer", fontFamily: "inherit",
  },
  select: {
    flex: 1, padding: "4px 6px", background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.08)", borderRadius: 4,
    color: "#d0d8e4", fontSize: 9, fontFamily: "inherit",
  },
  badge: (color) => ({
    display: "inline-block", padding: "1px 6px", borderRadius: 3,
    background: `${color}22`, color, fontSize: 8, fontWeight: 600,
  }),
  progress: {
    height: 3, borderRadius: 2, background: "rgba(255,255,255,.06)",
    overflow: "hidden", flex: 1,
  },
  progressBar: (pct, color) => ({
    height: "100%", width: `${pct * 100}%`,
    background: color || "#4D96FF", transition: "width .3s",
  }),
  minimized: {
    position: "fixed", bottom: 12, right: 12, width: 36, height: 36,
    background: "rgba(8,12,24,.95)", border: "1px solid rgba(77,150,255,.3)",
    borderRadius: 8, zIndex: 9999, display: "flex", alignItems: "center",
    justifyContent: "center", cursor: "pointer", fontSize: 14,
    boxShadow: "0 4px 12px rgba(0,0,0,.3)",
  },
};

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={S.section}>
      <div style={S.sectionTitle} onClick={() => setOpen(o => !o)}>
        {open ? "\u25BC" : "\u25B6"} {title}
      </div>
      {open && children}
    </div>
  );
}

export default function DevPanel({
  syncStatus, syncedTanks, peerConnectionStatus, fileTransferStatus,
  tanks, setTanks, getSyncKeys, onClose,
}) {
  const [minimized, setMinimized] = useState(false);
  const [relayInfo, setRelayInfo] = useState(null);
  const [relayTesting, setRelayTesting] = useState(false);
  const [selectedTank, setSelectedTank] = useState("");
  const [mode, setMode] = useState("nostr"); // "nostr" | "direct"
  const [fishText, setFishText] = useState("");
  const [fishImp, setFishImp] = useState("normal");
  const [metaName, setMetaName] = useState("");
  const [delFishId, setDelFishId] = useState("");
  const [eventCount, setEventCount] = useState(0);
  const [lastEvent, setLastEvent] = useState(null);
  const heartbeatRef = useRef(null);

  // Get sync keys for selected tank
  const getSyncInfo = useCallback(() => {
    if (!selectedTank || !getSyncKeys) return null;
    const keys = getSyncKeys();
    return keys?.[selectedTank] || null;
  }, [selectedTank, getSyncKeys]);

  // Synced tank IDs
  const syncedTankIds = syncedTanks ? Object.keys(syncedTanks) : [];

  // Auto-select first synced tank
  useEffect(() => {
    if (!selectedTank && syncedTankIds.length > 0) {
      setSelectedTank(syncedTankIds[0]);
    }
  }, [syncedTankIds.length]);

  const logEvent = () => {
    setEventCount(c => c + 1);
    setLastEvent(new Date().toLocaleTimeString());
  };

  // ── Relay Inspector ──
  const refreshRelays = () => {
    const connected = getConnectedRelays();
    setRelayInfo({
      connected,
      total: NOSTR_RELAYS.length,
      details: NOSTR_RELAYS.map(r => ({
        url: r, ok: connected.includes(r),
      })),
    });
  };

  const runRelayTest = async () => {
    setRelayTesting(true);
    try {
      const best = await testRelays();
      refreshRelays();
    } catch {}
    setRelayTesting(false);
  };

  useEffect(() => { refreshRelays(); }, []);

  // ── Mock Peer Actions ──
  const injectFish = async () => {
    if (!fishText.trim()) return;
    const info = getSyncInfo();
    if (mode === "nostr" && info) {
      const fishId = "mock-" + uid();
      await pushFish(info.syncId, info.encKey, fishId, {
        id: fishId, task: fishText.trim(), color: "#4D96FF",
        importance: fishImp, completed: false, checklist: [], links: [], attachments: [],
        _deviceId: MOCK_DEVICE_ID,
      }, info.relays);
      logEvent();
    } else if (mode === "direct") {
      setTanks(prev => prev.map(t => {
        if (t.id !== selectedTank) return t;
        const fishId = "mock-" + uid();
        return {
          ...t, fishes: [...(t.fishes || []), {
            id: fishId, task: fishText.trim(), color: "#FF6B9D",
            importance: fishImp, completed: false, checklist: [], links: [], attachments: [],
          }],
        };
      }));
      logEvent();
    }
    setFishText("");
  };

  const injectMeta = async () => {
    if (!metaName.trim()) return;
    const info = getSyncInfo();
    if (mode === "nostr" && info) {
      await pushTankMeta(info.syncId, info.encKey, {
        name: metaName.trim(), _deviceId: MOCK_DEVICE_ID,
      }, info.relays);
      logEvent();
    } else if (mode === "direct") {
      setTanks(prev => prev.map(t =>
        t.id === selectedTank ? { ...t, name: metaName.trim() } : t
      ));
      logEvent();
    }
    setMetaName("");
  };

  const deleteFish = async () => {
    if (!delFishId.trim()) return;
    const info = getSyncInfo();
    if (mode === "nostr" && info) {
      await tombstoneFish(info.syncId, info.encKey, delFishId.trim(), info.relays);
      logEvent();
    } else if (mode === "direct") {
      setTanks(prev => prev.map(t => {
        if (t.id !== selectedTank) return t;
        return { ...t, fishes: (t.fishes || []).filter(f => f.id !== delFishId.trim()) };
      }));
      logEvent();
    }
    setDelFishId("");
  };

  const bulkAdd = async (count) => {
    const info = getSyncInfo();
    for (let i = 0; i < count; i++) {
      const fishId = "mock-" + uid();
      const task = `Mock task #${i + 1} (${uid().slice(0, 4)})`;
      if (mode === "nostr" && info) {
        await pushFish(info.syncId, info.encKey, fishId, {
          id: fishId, task, color: "#C9B1FF",
          importance: "normal", completed: false, checklist: [], links: [], attachments: [],
          _deviceId: MOCK_DEVICE_ID,
        }, info.relays);
      } else {
        setTanks(prev => prev.map(t => {
          if (t.id !== selectedTank) return t;
          return { ...t, fishes: [...(t.fishes || []), {
            id: fishId, task, color: "#C9B1FF",
            importance: "normal", completed: false, checklist: [], links: [], attachments: [],
          }]};
        }));
      }
    }
    setEventCount(c => c + count);
    setLastEvent(new Date().toLocaleTimeString());
  };

  const rapidFire = async () => {
    await bulkAdd(50);
  };

  const toggleHeartbeat = () => {
    // Heartbeat is a placeholder — in mock mode we just track the toggle
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    } else {
      heartbeatRef.current = setInterval(() => {
        logEvent();
      }, 30000);
    }
  };

  useEffect(() => () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
  }, []);

  if (minimized) {
    return (
      <div style={S.minimized} onClick={() => setMinimized(false)} title="Open Dev Panel">
        {"\uD83D\uDD27"}
      </div>
    );
  }

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <span style={S.title}>DEV PANEL</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={S.closeBtn} onClick={() => setMinimized(true)} title="Minimize">{"\u2212"}</button>
          <button style={S.closeBtn} onClick={onClose} title="Close">{"\u2715"}</button>
        </div>
      </div>
      <div style={S.body}>

        {/* ── Section 1: Sync State Inspector ── */}
        <Section title="SYNC STATE">
          <div style={S.row}>
            <span style={S.label}>Status</span>
            <span style={syncStatus === "connected" ? S.value : S.valueOff}>
              {syncStatus || "off"}
            </span>
          </div>
          <div style={S.row}>
            <span style={S.label}>Tanks</span>
            <span style={{ fontSize: 9 }}>{syncedTankIds.length} synced</span>
          </div>
          {syncedTankIds.map(tid => {
            const keys = getSyncKeys?.();
            const info = keys?.[tid];
            const tank = tanks?.find(t => t.id === tid);
            return (
              <div key={tid} style={{ ...S.row, marginLeft: 8 }}>
                <span style={{ fontSize: 8, opacity: 0.4 }}>{tank?.name || tid.slice(0, 8)}</span>
                {info && <span style={{ fontSize: 7, opacity: 0.25, cursor: "pointer" }}
                  onClick={() => navigator.clipboard?.writeText(info.syncId)}
                  title="Click to copy syncId">
                  {info.syncId?.slice(0, 9)}...
                </span>}
              </div>
            );
          })}

          {/* Peer list */}
          {peerConnectionStatus && Object.keys(peerConnectionStatus).length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 8, opacity: 0.4, marginBottom: 3 }}>PEERS</div>
              {Object.entries(peerConnectionStatus).map(([peerId, info]) => (
                <div key={peerId} style={S.row}>
                  <span style={{ fontSize: 8, opacity: 0.6 }}>{peerId.slice(0, 12)}</span>
                  <span style={S.badge(info.isLAN ? "#2ED573" : "#4D96FF")}>
                    {info.isLAN ? "LAN" : "DIRECT"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* File transfers */}
          {fileTransferStatus && Object.keys(fileTransferStatus).length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 8, opacity: 0.4, marginBottom: 3 }}>TRANSFERS</div>
              {Object.entries(fileTransferStatus).map(([fileId, info]) => (
                <div key={fileId} style={S.row}>
                  <span style={{ fontSize: 8, opacity: 0.6 }}>
                    {info.direction === "up" ? "\u2191" : "\u2193"} {fileId.slice(0, 10)}
                  </span>
                  <div style={S.progress}>
                    <div style={S.progressBar(info.progress, info.direction === "up" ? "#FFD93D" : "#6BCB77")} />
                  </div>
                  <span style={{ fontSize: 8, opacity: 0.4 }}>{Math.round(info.progress * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Section 2: Relay Inspector ── */}
        <Section title="RELAYS" defaultOpen={false}>
          {relayInfo && (
            <>
              <div style={S.row}>
                <span style={S.label}>Connected</span>
                <span style={relayInfo.connected.length > 0 ? S.value : S.valueOff}>
                  {relayInfo.connected.length} / {relayInfo.total}
                </span>
              </div>
              {relayInfo.details.map(r => (
                <div key={r.url} style={{ ...S.row, marginLeft: 8 }}>
                  <span style={S.badge(r.ok ? "#2ED573" : "#FF4757")}>
                    {r.ok ? "OK" : "FAIL"}
                  </span>
                  <span style={{ fontSize: 8, opacity: 0.4, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.url.replace("wss://", "")}
                  </span>
                </div>
              ))}
            </>
          )}
          <div style={{ marginTop: 6 }}>
            <button style={S.btn} onClick={runRelayTest} disabled={relayTesting}>
              {relayTesting ? "Testing..." : "Re-test Relays"}
            </button>
          </div>
        </Section>

        {/* ── Section 3: Mock Peer Simulator ── */}
        <Section title="MOCK PEER" defaultOpen={false}>
          <div style={{ fontSize: 8, opacity: 0.3, marginBottom: 6 }}>
            ID: {MOCK_DEVICE_ID.slice(0, 20)}
          </div>

          {/* Tank selector */}
          <div style={S.row}>
            <span style={S.label}>Tank</span>
            <select style={S.select} value={selectedTank}
              onChange={e => setSelectedTank(e.target.value)}>
              <option value="">Select tank...</option>
              {syncedTankIds.map(tid => {
                const t = tanks?.find(tk => tk.id === tid);
                return <option key={tid} value={tid}>{t?.name || tid.slice(0, 12)}</option>;
              })}
            </select>
          </div>

          {/* Mode toggle */}
          <div style={S.row}>
            <span style={S.label}>Mode</span>
            <button style={{ ...S.btn, background: mode === "nostr" ? "rgba(77,150,255,.2)" : "transparent" }}
              onClick={() => setMode("nostr")}>Nostr</button>
            <button style={{ ...S.btn, background: mode === "direct" ? "rgba(77,150,255,.2)" : "transparent" }}
              onClick={() => setMode("direct")}>Direct</button>
          </div>

          {/* Inject Fish */}
          <div style={{ ...S.row, marginTop: 8 }}>
            <input style={S.input} placeholder="Task text..." value={fishText}
              onChange={e => setFishText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && injectFish()} />
            <select style={{ ...S.select, flex: "none", width: 70 }} value={fishImp}
              onChange={e => setFishImp(e.target.value)}>
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="critical">Critical</option>
            </select>
            <button style={S.btn} onClick={injectFish}>+ Fish</button>
          </div>

          {/* Inject Meta */}
          <div style={S.row}>
            <input style={S.input} placeholder="New tank name..." value={metaName}
              onChange={e => setMetaName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && injectMeta()} />
            <button style={S.btn} onClick={injectMeta}>Rename</button>
          </div>

          {/* Delete Fish */}
          <div style={S.row}>
            <input style={S.input} placeholder="Fish ID..." value={delFishId}
              onChange={e => setDelFishId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && deleteFish()} />
            <button style={S.btnDanger} onClick={deleteFish}>Delete</button>
          </div>

          {/* Bulk actions */}
          <div style={{ ...S.row, marginTop: 8 }}>
            <button style={S.btn} onClick={() => bulkAdd(10)}>+10 Random</button>
            <button style={S.btn} onClick={rapidFire}>Rapid 50</button>
            <button style={{ ...S.btn, background: heartbeatRef.current ? "rgba(46,213,115,.15)" : undefined }}
              onClick={toggleHeartbeat}>
              {heartbeatRef.current ? "Stop HB" : "Start HB"}
            </button>
          </div>

          {/* Event counter */}
          <div style={{ ...S.row, marginTop: 6 }}>
            <span style={S.label}>Events</span>
            <span style={{ fontSize: 9 }}>{eventCount}</span>
            {lastEvent && <span style={{ fontSize: 8, opacity: 0.3, marginLeft: 8 }}>last: {lastEvent}</span>}
          </div>
        </Section>

      </div>
    </div>
  );
}
