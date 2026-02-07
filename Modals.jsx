import { useState, useEffect, useRef } from "react";
import { IMP, DUR_PRESETS, durLabel, todayStr, daysBetween, DEVICE_ID, nowISO, exportPlain, exportRich } from "./constants.js";
import { iconBtn, tinyBtn } from "./styles.js";

// ══════════════════════════════════════════════════════════════
// DELETE MODAL
// ══════════════════════════════════════════════════════════════
export function DeleteModal({ delModal, setDelModal, tanks, confirmDelete }) {
  if(!delModal)return null;
  const tank=tanks.find(t=>t.id===delModal.tankId);if(!tank)return null;
  const match=delModal.input.trim().toLowerCase()===tank.name.trim().toLowerCase();
  return(<><div onClick={()=>setDelModal(null)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)",zIndex:48}}/>
    <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"min(320px, 88vw)",background:"rgba(12,8,8,.97)",border:"1px solid rgba(255,70,70,.15)",borderRadius:14,padding:20,zIndex:50,animation:"fadeIn .2s ease-out",boxShadow:"0 12px 40px rgba(0,0,0,.6)"}}>
      <div style={{fontSize:22,textAlign:"center",marginBottom:8}}>{"\u26A0\uFE0F"}</div>
      <div style={{fontSize:12,fontWeight:700,textAlign:"center",color:"#FF4757",letterSpacing:2,marginBottom:6}}>DELETE TANK</div>
      <div style={{fontSize:10,textAlign:"center",opacity:.5,marginBottom:14,lineHeight:1.6}}>
        Permanently destroy <b style={{color:"#eee"}}>{tank.name}</b> and {(tank.fishes||[]).length} fish. Type the name to confirm.</div>
      <input autoFocus value={delModal.input} onChange={e=>setDelModal(p=>({...p,input:e.target.value}))} placeholder={tank.name}
        style={{width:"100%",padding:"10px 12px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,70,70,.15)",borderRadius:8,color:"#d0d8e4",fontSize:12,fontFamily:"inherit",boxSizing:"border-box",marginBottom:14}}/>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setDelModal(null)} style={{flex:1,padding:"10px 0",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,color:"#a8b4c0",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>Cancel</button>
        <button onClick={confirmDelete} disabled={!match} style={{flex:1,padding:"10px 0",border:"none",borderRadius:8,fontWeight:700,cursor:match?"pointer":"not-allowed",fontSize:11,fontFamily:"inherit",background:match?"linear-gradient(135deg,#FF4757,#c0392b)":"rgba(255,255,255,.03)",color:match?"#fff":"#444",opacity:match?1:.4}}>Delete Forever</button>
      </div></div></>);
}

// ══════════════════════════════════════════════════════════════
// LIST VIEW OVERLAY (Trello-style)
// ══════════════════════════════════════════════════════════════
export function ListViewOverlay({ listView, setListView, actTank, catchFish, toggleFishComplete }) {
  const [copyMenu,setCopyMenu]=useState(false);
  const [copyFlash,setCopyFlash]=useState("");
  const [inclCompleted,setInclCompleted]=useState(false);
  if(!listView||!actTank)return null;
  const td=todayStr();
  const fishes=actTank.fishes||[];
  const doCopy=(mode)=>{
    const text=mode==="plain"?exportPlain(fishes,inclCompleted):exportRich(fishes,inclCompleted);
    try{navigator.clipboard.writeText(text);}catch{}
    setCopyFlash(mode==="plain"?"Copied plain!":"Copied with details!");
    setCopyMenu(false);
    setTimeout(()=>setCopyFlash(""),1500);
  };
  const toggleBtn=(f)=>(<div onClick={e=>{e.stopPropagation();toggleFishComplete(actTank.id,f.id);}}
    style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${f.completed?"#2ED573":"rgba(255,255,255,.2)"}`,
      background:f.completed?"#2ED573":"transparent",display:"flex",alignItems:"center",justifyContent:"center",
      flexShrink:0,cursor:"pointer",transition:"all .15s"}}>
    {f.completed&&<span style={{color:"#fff",fontSize:12,fontWeight:700,lineHeight:1}}>{"\u2713"}</span>}
  </div>);
  return(
    <div style={{position:"absolute",inset:0,zIndex:180,background:"rgba(8,12,24,.98)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",animation:"fadeIn .2s ease-out"}}>
      <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,.06)",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button onClick={()=>setListView(false)} style={iconBtn}>{"\u2715"}</button>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,letterSpacing:2,color:"#4D96FF"}}>{"\u2630"} LIST VIEW</div>
          <div style={{fontSize:10,opacity:.4}}>{actTank.name} · {fishes.length} tasks</div>
        </div>
        <div style={{fontSize:9,opacity:.3,display:"flex",gap:8,alignItems:"center"}}>
          <span>{fishes.filter(f=>!f.completed).length} active</span>
          <span>{fishes.filter(f=>f.completed).length} done</span>
          <div style={{position:"relative"}}>
            {copyFlash?(<span style={{fontSize:9,color:"#2ED573",fontWeight:600}}>{copyFlash}</span>):(
              <button onClick={()=>setCopyMenu(p=>!p)} style={{...iconBtn,fontSize:11,padding:"3px 6px"}} title="Copy task list">{"\uD83D\uDCCB"}</button>
            )}
            {copyMenu&&(<div style={{position:"absolute",top:"100%",right:0,marginTop:4,background:"rgba(12,18,32,.98)",border:"1px solid rgba(77,150,255,.2)",borderRadius:8,padding:8,zIndex:10,minWidth:150,boxShadow:"0 8px 24px rgba(0,0,0,.5)"}}>
              <button onClick={()=>doCopy("plain")} style={{display:"block",width:"100%",padding:"8px 10px",background:"none",border:"none",borderRadius:4,color:"#d0d8e4",fontSize:10,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}} className="ni">Plain text</button>
              <button onClick={()=>doCopy("rich")} style={{display:"block",width:"100%",padding:"8px 10px",background:"none",border:"none",borderRadius:4,color:"#d0d8e4",fontSize:10,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}} className="ni">With details</button>
              <div style={{borderTop:"1px solid rgba(255,255,255,.06)",margin:"4px 0"}}/>
              <label style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",fontSize:9,color:"#8898aa",cursor:"pointer"}}>
                <input type="checkbox" checked={inclCompleted} onChange={e=>setInclCompleted(e.target.checked)} style={{accentColor:"#4D96FF"}}/>
                Include completed
              </label>
            </div>)}
          </div>
        </div>
      </div>
      {copyMenu&&<div onClick={()=>setCopyMenu(false)} style={{position:"fixed",inset:0,zIndex:179}}/>}
      <div style={{flex:1,overflow:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:16}}>
        {/* Critical / Overdue */}
        {(()=>{const items=fishes.filter(f=>!f.completed&&(f.importance==="critical"||(f.dueDate&&daysBetween(todayStr(),f.dueDate)<0)));
          if(!items.length)return null;
          return(<div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:"#FF4757",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>{"\uD83D\uDD25"} CRITICAL / OVERDUE <span style={{fontSize:9,opacity:.5,fontWeight:400}}>({items.length})</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {items.map(f=>(<div key={f.id} onClick={()=>{catchFish(actTank.id,f.id);setListView(false);}} style={{padding:"12px 14px",background:"rgba(255,71,87,.08)",border:"1px solid rgba(255,71,87,.2)",borderRadius:8,cursor:"pointer",transition:"all .15s",display:"flex",alignItems:"center",gap:10}} className="ni">
                {toggleBtn(f)}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#f8e8e8",marginBottom:4}}>{f.task}</div>
                  <div style={{fontSize:9,opacity:.5,display:"flex",gap:8,flexWrap:"wrap"}}>
                    {f.dueDate&&<span style={{color:daysBetween(todayStr(),f.dueDate)<0?"#FF4757":"#FFD93D"}}>Due: {f.dueDate}</span>}
                    {f.duration&&<span>{"\u23F1"} {durLabel(f.duration)}</span>}
                    {(f.checklist||[]).length>0&&<span>{"\u2611"} {(f.checklist||[]).filter(c=>c.done).length}/{(f.checklist||[]).length}</span>}
                  </div>
                </div>
              </div>))}
            </div>
          </div>);
        })()}

        {/* Important */}
        {(()=>{const items=fishes.filter(f=>!f.completed&&f.importance==="important"&&!(f.dueDate&&daysBetween(todayStr(),f.dueDate)<0));
          if(!items.length)return null;
          return(<div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:"#FFD93D",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>{"\u2B50"} IMPORTANT <span style={{fontSize:9,opacity:.5,fontWeight:400}}>({items.length})</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {items.map(f=>(<div key={f.id} onClick={()=>{catchFish(actTank.id,f.id);setListView(false);}} style={{padding:"12px 14px",background:"rgba(255,217,61,.06)",border:"1px solid rgba(255,217,61,.15)",borderRadius:8,cursor:"pointer",transition:"all .15s",display:"flex",alignItems:"center",gap:10}} className="ni">
                {toggleBtn(f)}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#f8f4e8",marginBottom:4}}>{f.task}</div>
                  <div style={{fontSize:9,opacity:.5,display:"flex",gap:8,flexWrap:"wrap"}}>
                    {f.dueDate&&<span>Due: {f.dueDate}</span>}
                    {f.duration&&<span>{"\u23F1"} {durLabel(f.duration)}</span>}
                    {(f.checklist||[]).length>0&&<span>{"\u2611"} {(f.checklist||[]).filter(c=>c.done).length}/{(f.checklist||[]).length}</span>}
                  </div>
                </div>
              </div>))}
            </div>
          </div>);
        })()}

        {/* Normal */}
        {(()=>{const items=fishes.filter(f=>!f.completed&&(f.importance||"normal")==="normal"&&f.importance!=="critical"&&f.importance!=="important");
          if(!items.length)return null;
          return(<div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:"#8898aa",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>{"\u25CB"} NORMAL <span style={{fontSize:9,opacity:.5,fontWeight:400}}>({items.length})</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {items.map(f=>(<div key={f.id} onClick={()=>{catchFish(actTank.id,f.id);setListView(false);}} style={{padding:"12px 14px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:8,cursor:"pointer",transition:"all .15s",display:"flex",alignItems:"center",gap:10}} className="ni">
                {toggleBtn(f)}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:500,color:"#d0d8e4",marginBottom:4}}>{f.task}</div>
                  <div style={{fontSize:9,opacity:.5,display:"flex",gap:8,flexWrap:"wrap"}}>
                    {f.dueDate&&<span>Due: {f.dueDate}</span>}
                    {f.duration&&<span>{"\u23F1"} {durLabel(f.duration)}</span>}
                    {(f.checklist||[]).length>0&&<span>{"\u2611"} {(f.checklist||[]).filter(c=>c.done).length}/{(f.checklist||[]).length}</span>}
                  </div>
                </div>
              </div>))}
            </div>
          </div>);
        })()}

        {/* Completed */}
        {(()=>{const items=fishes.filter(f=>f.completed);
          if(!items.length)return null;
          return(<div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:"#2ED573",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>{"\u2713"} COMPLETED <span style={{fontSize:9,opacity:.5,fontWeight:400}}>({items.length})</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {items.map(f=>(<div key={f.id} onClick={()=>{catchFish(actTank.id,f.id);setListView(false);}} style={{padding:"10px 14px",background:"rgba(46,213,115,.04)",border:"1px solid rgba(46,213,115,.1)",borderRadius:8,cursor:"pointer",transition:"all .15s",opacity:.6,display:"flex",alignItems:"center",gap:10}} className="ni">
                {toggleBtn(f)}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,color:"#8ab894",textDecoration:"line-through"}}>{f.task}</div>
                </div>
              </div>))}
            </div>
          </div>);
        })()}

        {/* Empty state */}
        {fishes.length===0&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",opacity:.3}}>
            <div style={{fontSize:32,marginBottom:8}}>{"\uD83D\uDC20"}</div>
            <div style={{fontSize:11}}>No tasks in this tank</div>
          </div>
        )}
      </div>
      <div style={{padding:"12px 16px",borderTop:"1px solid rgba(255,255,255,.06)",flexShrink:0}}>
        <button onClick={()=>setListView(false)} style={{width:"100%",padding:"12px 0",background:"linear-gradient(135deg,#4D96FF,#3a7bd5)",border:"none",borderRadius:8,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"inherit",letterSpacing:1}}>{"\uD83D\uDC20"} Back to Tank View</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PURGE OVERLAY
// ══════════════════════════════════════════════════════════════
export function PurgeOverlay({ nukeId, nukeTank, keepers, toggleK, doPurge, setNukeId, setKeepers }) {
  if(!nukeId||!nukeTank)return null;
  return(
    <div style={{position:"absolute",inset:0,zIndex:200,background:"rgba(6,2,2,.98)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",padding:"14px 12px",animation:"fadeIn .2s ease-out"}}>
      <div style={{textAlign:"center",marginBottom:12,flexShrink:0}}>
        <div style={{fontSize:24}}>{"\u2622\uFE0F"}</div>
        <div style={{fontSize:13,fontWeight:700,color:"#FF4757",letterSpacing:4,marginTop:3}}>PURGE: {nukeTank.name.toUpperCase()}</div>
        <div style={{fontSize:10,opacity:.6,marginTop:4,letterSpacing:1,color:"#ccc"}}>Tap to save. Rest get flushed.</div>
      </div>
      <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column",gap:4}}>
        {(nukeTank.fishes||[]).map(f=>{const saved=keepers.has(f.id);const imp=IMP[f.importance||"normal"];
          return(<div key={f.id} className="ni" onClick={()=>toggleK(f.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,cursor:"pointer",background:saved?"rgba(46,213,115,.1)":"rgba(255,71,87,.08)",border:`1.5px solid ${saved?"rgba(46,213,115,.25)":"rgba(255,71,87,.2)"}`,transition:"all .15s"}}>
            <div style={{width:24,height:24,borderRadius:6,border:`2px solid ${saved?"#2ED573":"rgba(255,255,255,.15)"}`,background:saved?"#2ED573":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
              {saved&&<span style={{color:"#fff",fontSize:14,fontWeight:700}}>{"\u2713"}</span>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:saved?600:400,color:saved?"#e8f0e8":"#aa8888",textDecoration:saved?"none":"line-through",wordBreak:"break-word",lineHeight:1.4}}>{f.task}</div>
              <div style={{fontSize:9,opacity:.5,marginTop:2,display:"flex",gap:6,flexWrap:"wrap"}}>
                {imp.badge&&<span>{imp.badge} {imp.label}</span>}
                {f.duration&&<span>{"\u23F1"} {durLabel(f.duration)}</span>}
                {f.dueDate&&<span>Due: {f.dueDate}</span>}
              </div>
            </div>
            <span style={{fontSize:16,flexShrink:0}}>{saved?"\uD83D\uDEDF":"\uD83D\uDC80"}</span></div>);})}
      </div>
      <div style={{display:"flex",gap:8,marginTop:12,justifyContent:"center",flexShrink:0}}>
        <button onClick={()=>{setNukeId(null);setKeepers(new Set());}} style={{padding:"12px 20px",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:8,color:"#d0d8e4",cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:500}}>Cancel</button>
        <button onClick={doPurge} disabled={!(nukeTank.fishes||[]).some(f=>!keepers.has(f.id))} style={{padding:"12px 24px",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"inherit",letterSpacing:2,background:(nukeTank.fishes||[]).some(f=>!keepers.has(f.id))?"linear-gradient(135deg,#FF4757,#c0392b)":"rgba(255,255,255,.04)",color:(nukeTank.fishes||[]).some(f=>!keepers.has(f.id))?"#fff":"#555",opacity:(nukeTank.fishes||[]).some(f=>!keepers.has(f.id))?1:.35}}>{"\u2622"} FLUSH {(nukeTank.fishes||[]).filter(f=>!keepers.has(f.id)).length}</button>
      </div>
    </div>);
}

// ══════════════════════════════════════════════════════════════
// SHARE MODAL — sharePerm state is internal
// ══════════════════════════════════════════════════════════════
export function ShareModal({ shareModal, setShareModal, tanks, syncStatus, syncedTanks, generateShareCode, removePeer }) {
  const [sharePerm,setSharePerm]=useState("shared");
  const [code,setCode]=useState("");
  const [loading,setLoading]=useState(false);
  const [qrUrl,setQrUrl]=useState(null);

  // Generate code when modal opens or perm changes
  const prevRef=useRef({shareModal:null,sharePerm:null});
  useEffect(()=>{
    if(!shareModal)return;
    if(prevRef.current.shareModal===shareModal&&prevRef.current.sharePerm===sharePerm)return;
    prevRef.current={shareModal,sharePerm};
    setLoading(true);setCode("");setQrUrl(null);
    generateShareCode(shareModal,sharePerm).then(c=>{setCode(c);setLoading(false);});
  },[shareModal,sharePerm,generateShareCode]);

  // Generate real QR code when code is available
  useEffect(()=>{
    if(!code)return;
    import("qrcode").then(QRCode=>{
      QRCode.toDataURL(code,{width:240,margin:1,color:{dark:"#0a0e1a",light:"#ffffff"}}).then(url=>setQrUrl(url)).catch(()=>{});
    }).catch(()=>{});
  },[code]);

  if(!shareModal)return null;
  const tank=tanks.find(t=>t.id===shareModal);if(!tank)return null;
  const peers=tank.peers||[];
  const isOwner=!tank.ownerId||tank.ownerId===DEVICE_ID;
  const isSynced=syncedTanks.has(shareModal);
  const PERM_OPTS=[{v:"shared",l:"Shared",d:"Can view, edit, add fish",c:"#6BCB77"},{v:"readonly",l:"Read-only",d:"Can view only",c:"#4D96FF"}];
  return(<><div onClick={()=>setShareModal(null)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)",zIndex:48}}/>
    <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"min(380px, 92vw)",maxHeight:"85vh",background:"rgba(8,14,28,.98)",border:"1px solid rgba(77,150,255,.15)",borderRadius:14,zIndex:50,animation:"fadeIn .2s ease-out",boxShadow:"0 12px 40px rgba(0,0,0,.6)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"16px 18px 10px",borderBottom:"1px solid rgba(255,255,255,.04)",flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:12,fontWeight:700,letterSpacing:2,color:"#4D96FF"}}>{"\uD83D\uDD17"} SHARE TANK</div>
          <div style={{fontSize:10,opacity:.4,marginTop:2}}>{tank.name}</div></div>
          <button onClick={()=>setShareModal(null)} style={{...iconBtn,fontSize:14}}>{"\u2715"}</button>
        </div>
      </div>
      <div style={{flex:1,overflow:"auto",padding:"12px 18px 18px"}}>
        {/* Sync status */}
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14,padding:"8px 10px",borderRadius:6,background:syncStatus==="connected"?"rgba(46,213,115,.06)":"rgba(255,255,255,.02)",border:`1px solid ${syncStatus==="connected"?"rgba(46,213,115,.12)":"rgba(255,255,255,.04)"}`}}>
          <span style={{fontSize:14}}>{syncStatus==="connected"?"\u26A1":"\u25CB"}</span>
          <div><div style={{fontSize:9,fontWeight:600,color:syncStatus==="connected"?"#2ED573":"#888"}}>{syncStatus==="connected"?"P2P Sync Active":"P2P Sync Offline"}</div>
          <div style={{fontSize:8,opacity:.35,marginTop:1}}>{syncStatus==="connected"?(isSynced?"This tank is syncing via Gun.js relays":"Share to start syncing"):"Relay servers unreachable — will retry"}</div></div>
        </div>

        {/* Permission selector */}
        {isOwner&&<><div style={{fontSize:9,opacity:.35,letterSpacing:1.5,marginBottom:6,fontWeight:600}}>PERMISSION</div>
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {PERM_OPTS.map(p=>(<button key={p.v} onClick={()=>setSharePerm(p.v)} style={{flex:1,padding:"8px 6px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",background:sharePerm===p.v?p.c+"14":"rgba(255,255,255,.02)",border:`1.5px solid ${sharePerm===p.v?p.c+"44":"rgba(255,255,255,.04)"}`,transition:"all .12s"}}>
            <div style={{fontSize:10,fontWeight:sharePerm===p.v?700:400,color:sharePerm===p.v?p.c:"#778",letterSpacing:.5}}>{p.l}</div>
            <div style={{fontSize:7,opacity:.35,marginTop:2}}>{p.d}</div></button>))}
        </div></>}

        {/* Pairing code */}
        {isOwner&&<><div style={{fontSize:9,opacity:.35,letterSpacing:1.5,marginBottom:6,fontWeight:600}}>PAIRING CODE</div>
        <div style={{position:"relative",marginBottom:6}}>
          <div style={{padding:"10px 12px",background:"rgba(0,0,0,.3)",border:"1px solid rgba(77,150,255,.12)",borderRadius:8,fontSize:8,fontFamily:"monospace",color:"#7bb8ff",wordBreak:"break-all",lineHeight:1.5,maxHeight:60,overflow:"hidden"}}>{loading?"Generating...":code}</div>
          {code&&<button onClick={()=>{try{navigator.clipboard.writeText(code);}catch{}}} style={{position:"absolute",top:4,right:4,...tinyBtn,padding:"3px 8px",background:"rgba(77,150,255,.12)",borderRadius:4,fontSize:8,color:"#7bb8ff",border:"1px solid rgba(77,150,255,.2)"}}>Copy</button>}
        </div>
        <div style={{fontSize:7,opacity:.25,marginBottom:14,lineHeight:1.5}}>Share this code with another device. They paste it in Join to sync this tank. Code expires in 5 minutes.</div></>}

        {/* QR code */}
        {isOwner&&<div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
          <div style={{width:140,height:140,background:"#fff",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",padding:8,position:"relative",overflow:"hidden"}}>
            {qrUrl?<img src={qrUrl} alt="QR Code" style={{width:120,height:120,imageRendering:"pixelated"}}/>
            :<div style={{fontSize:9,color:"#888",textAlign:"center"}}>{loading?"Generating...":"QR loading..."}</div>}
            <div style={{fontSize:5,color:"#0a0e1a",opacity:.4,marginTop:2,fontFamily:"sans-serif"}}>Scan to pair</div>
          </div>
        </div>}

        {/* Paired devices */}
        <div style={{fontSize:9,opacity:.35,letterSpacing:1.5,marginBottom:6,fontWeight:600}}>PAIRED DEVICES {peers.length>0&&`(${peers.length})`}</div>
        {peers.length===0?(
          <div style={{fontSize:9,opacity:.2,textAlign:"center",padding:"12px 0"}}>No devices paired yet</div>
        ):peers.map(p=>(<div key={p.deviceId} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",marginBottom:4,borderRadius:6,background:"rgba(255,255,255,.015)",border:"1px solid rgba(255,255,255,.03)"}}>
          <span style={{fontSize:14,flexShrink:0}}>{"\uD83D\uDCF1"}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:10,fontWeight:600,color:"#d0d8e4",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.deviceName||p.deviceId.slice(0,12)}</div>
            <div style={{fontSize:7,opacity:.3,marginTop:1}}>
              <span style={{color:p.permission==="shared"?"#6BCB77":"#4D96FF",fontWeight:600}}>{p.permission}</span>
              {" \u00B7 "}paired {p.pairedAt?new Date(p.pairedAt).toLocaleDateString():"unknown"}
              {p.lastSyncAt&&<span>{" \u00B7 "}synced {new Date(p.lastSyncAt).toLocaleDateString()}</span>}
            </div>
          </div>
          {isOwner&&<button onClick={()=>removePeer(tank.id,p.deviceId)} style={{...tinyBtn,fontSize:8,color:"#FF4757"}}>Remove</button>}
        </div>))}

        {/* Device info */}
        <div style={{marginTop:14,padding:"8px 10px",borderRadius:6,background:"rgba(255,255,255,.01)",border:"1px solid rgba(255,255,255,.025)"}}>
          <div style={{fontSize:8,opacity:.25,letterSpacing:1,marginBottom:3}}>THIS DEVICE</div>
          <div style={{fontSize:8,fontFamily:"monospace",color:"#556",wordBreak:"break-all"}}>{DEVICE_ID}</div>
          {tank.ownerId&&tank.ownerId!==DEVICE_ID&&<div style={{fontSize:8,color:"#FFD93D",opacity:.5,marginTop:3}}>You are a {(peers.find(p=>p.deviceId===DEVICE_ID)||{permission:"shared"}).permission} member</div>}
        </div>
      </div>
    </div></>);
}

// ══════════════════════════════════════════════════════════════
// JOIN / PAIR MODAL — joinCode, joinError state is internal
// ══════════════════════════════════════════════════════════════
export function JoinModal({ joinModal, setJoinModal, parseShareCode, acceptPair, syncStatus }) {
  const [joinCode,setJoinCode]=useState("");
  const [joinError,setJoinError]=useState("");
  const [scanning,setScanning]=useState(false);
  const videoRef=useRef(null);
  const canvasRef=useRef(null);
  const streamRef=useRef(null);
  const scanTimerRef=useRef(null);

  const stopScanner=()=>{
    setScanning(false);
    if(scanTimerRef.current){clearInterval(scanTimerRef.current);scanTimerRef.current=null;}
    if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
  };

  const startScanner=async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
      streamRef.current=stream;setScanning(true);
      // Wait for video element to be available
      setTimeout(()=>{
        const video=videoRef.current;if(!video){stopScanner();return;}
        video.srcObject=stream;video.play();
        const canvas=canvasRef.current;if(!canvas)return;
        const ctx=canvas.getContext("2d",{willReadFrequently:true});
        scanTimerRef.current=setInterval(async()=>{
          if(!video.videoWidth)return;
          canvas.width=video.videoWidth;canvas.height=video.videoHeight;
          ctx.drawImage(video,0,0);
          const imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
          // Try native BarcodeDetector first, fall back to jsQR
          try{
            if("BarcodeDetector"in window){
              const detector=new BarcodeDetector({formats:["qr_code"]});
              const results=await detector.detect(imageData);
              if(results.length>0){setJoinCode(results[0].rawValue);setJoinError("");stopScanner();return;}
            }
          }catch{}
          // jsQR fallback
          try{
            const jsQR=(await import("jsqr")).default;
            const result=jsQR(imageData.data,imageData.width,imageData.height);
            if(result){setJoinCode(result.data);setJoinError("");stopScanner();return;}
          }catch{}
        },250);
      },100);
    }catch(err){setJoinError("Camera access denied: "+err.message);setScanning(false);}
  };

  // Cleanup on unmount/close
  useEffect(()=>()=>stopScanner(),[]);

  if(!joinModal)return null;
  const close=()=>{stopScanner();setJoinModal(false);setJoinCode("");setJoinError("");};
  return(<><div onClick={close} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)",zIndex:48}}/>
    <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"min(360px, 90vw)",maxHeight:"85vh",background:"rgba(8,14,28,.98)",border:"1px solid rgba(77,150,255,.15)",borderRadius:14,padding:20,zIndex:50,animation:"fadeIn .2s ease-out",boxShadow:"0 12px 40px rgba(0,0,0,.6)",overflow:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,letterSpacing:2,color:"#4D96FF"}}>{"\uD83D\uDCF1"} JOIN TANK</div>
        <button onClick={close} style={{...iconBtn,fontSize:14}}>{"\u2715"}</button>
      </div>
      <div style={{fontSize:10,opacity:.4,marginBottom:12,lineHeight:1.5}}>Scan a QR code or paste the pairing code from another device.</div>

      {/* QR Scanner */}
      {scanning?(
        <div style={{marginBottom:12,borderRadius:8,overflow:"hidden",position:"relative",background:"#000"}}>
          <video ref={videoRef} style={{width:"100%",display:"block",borderRadius:8}} playsInline muted/>
          <canvas ref={canvasRef} style={{display:"none"}}/>
          <div style={{position:"absolute",inset:0,border:"3px solid rgba(77,150,255,.4)",borderRadius:8,pointerEvents:"none"}}/>
          <div style={{position:"absolute",bottom:8,left:0,right:0,textAlign:"center",fontSize:9,color:"#fff",textShadow:"0 1px 4px rgba(0,0,0,.8)"}}>Point camera at QR code...</div>
          <button onClick={stopScanner} style={{position:"absolute",top:6,right:6,...iconBtn,background:"rgba(0,0,0,.5)",color:"#fff",fontSize:10,padding:"4px 8px",borderRadius:6}}>{"\u2715"}</button>
        </div>
      ):(
        <button onClick={startScanner} style={{width:"100%",padding:"12px 0",marginBottom:12,background:"rgba(77,150,255,.08)",border:"1px solid rgba(77,150,255,.2)",borderRadius:8,color:"#7bb8ff",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          {"\uD83D\uDCF7"} Scan QR Code
        </button>
      )}

      <div style={{fontSize:8,opacity:.25,letterSpacing:1,marginBottom:6,fontWeight:600}}>OR PASTE CODE</div>
      <textarea value={joinCode} onChange={e=>{setJoinCode(e.target.value);setJoinError("");}} placeholder="Paste pairing code here\u2026" rows={3}
        style={{width:"100%",padding:"10px 12px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(77,150,255,.12)",borderRadius:8,color:"#d0d8e4",fontSize:10,fontFamily:"monospace",resize:"vertical",boxSizing:"border-box"}}/>
      {joinError&&<div style={{fontSize:9,color:"#FF4757",marginTop:6}}>{"\u26A0"} {joinError}</div>}
      {joinCode.trim().length>10&&!joinError&&(()=>{const parsed=parseShareCode(joinCode);
        if(parsed.error)return <div style={{fontSize:9,color:"#FF4757",marginTop:6}}>{"\u26A0"} {parsed.error}</div>;
        const d=parsed.data;
        return(<div style={{marginTop:10,padding:"10px 12px",borderRadius:8,background:"rgba(77,150,255,.04)",border:"1px solid rgba(77,150,255,.12)"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#7bb8ff",marginBottom:4}}>{d.tankName||"Shared Tank"}</div>
          <div style={{fontSize:9,opacity:.4,lineHeight:1.5}}>
            From: {d.deviceName||"Unknown device"}{"\n"}
            Fish: {d.fishCount||0}{" \u00B7 "}Permission: <span style={{color:d.permission==="shared"?"#6BCB77":"#4D96FF",fontWeight:600}}>{d.permission}</span>
            {d.syncId&&<span>{"\n"}Sync: encrypted P2P</span>}
          </div>
          <button onClick={()=>{acceptPair(d);setJoinCode("");setJoinError("");}} style={{marginTop:10,width:"100%",padding:"10px 0",background:"linear-gradient(135deg,#4D96FF,#6BCB77)",border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1}}>{"\u2713"} Accept & Sync</button>
        </div>);
      })()}
      <div style={{display:"flex",gap:8,marginTop:14}}>
        <button onClick={close} style={{flex:1,padding:"10px 0",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,color:"#a8b4c0",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>Cancel</button>
      </div>

      {/* Sync status */}
      <div style={{marginTop:14,padding:"8px 10px",borderRadius:6,background:syncStatus==="connected"?"rgba(46,213,115,.04)":"rgba(255,255,255,.01)",border:`1px solid ${syncStatus==="connected"?"rgba(46,213,115,.1)":"rgba(255,255,255,.025)"}`}}>
        <div style={{fontSize:8,display:"flex",alignItems:"center",gap:4}}>
          <span>{syncStatus==="connected"?"\u26A1":"\u25CB"}</span>
          <span style={{color:syncStatus==="connected"?"#2ED573":"#667",fontWeight:600}}>P2P Sync {syncStatus==="connected"?"active":"offline"}</span>
        </div>
        {syncStatus!=="connected"&&<div style={{fontSize:7,opacity:.25,marginTop:3,lineHeight:1.4}}>Relay servers unreachable. Sync will resume automatically when connection is restored.</div>}
      </div>
    </div></>);
}

// ══════════════════════════════════════════════════════════════
// BULK ADD MODAL — bulkText, bulkImp, bulkDur state is internal
// ══════════════════════════════════════════════════════════════
export function BulkAddModal({ bulkModal, setBulkModal, actTank, activeId, bulkAddFish: parentBulkAdd, initP }) {
  const [bulkText,setBulkText]=useState("");
  const [bulkImp,setBulkImp]=useState("normal");
  const [bulkDur,setBulkDur]=useState("");
  if(!bulkModal)return null;
  const close=()=>{setBulkModal(false);setBulkText("");};
  const doAdd=()=>{
    if(!activeId||!bulkText.trim())return;
    const lines=bulkText.split(/\n/).map(l=>l.trim()).filter(l=>l.length>0);
    if(!lines.length)return;
    parentBulkAdd(lines,bulkImp||"normal",bulkDur||null);
    setBulkText("");setBulkModal(false);
  };
  return(<><div onClick={close} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)",zIndex:48}}/>
    <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"min(420px, 92vw)",maxHeight:"80vh",background:"rgba(8,14,28,.98)",border:"1px solid rgba(77,150,255,.15)",borderRadius:14,zIndex:50,animation:"fadeIn .2s ease-out",boxShadow:"0 12px 40px rgba(0,0,0,.6)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"14px 18px 10px",borderBottom:"1px solid rgba(255,255,255,.04)",flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:12,fontWeight:700,letterSpacing:2,color:"#4D96FF"}}>{"\u2630"} BULK ADD</div>
          <div style={{fontSize:10,opacity:.4,marginTop:2}}>{actTank?.name||"Select a tank"}</div></div>
          <button onClick={close} style={{...iconBtn,fontSize:14}}>{"\u2715"}</button>
        </div>
      </div>
      <div style={{flex:1,overflow:"auto",padding:"12px 18px 18px",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{fontSize:10,opacity:.4,lineHeight:1.5}}>Paste a list of tasks, one per line. Each line becomes a fish with the settings below.</div>
        <textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} placeholder={"Buy groceries\nCall dentist\nFinish report\nReview PR #42\n..."} rows={8}
          style={{width:"100%",padding:"12px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(77,150,255,.12)",borderRadius:8,color:"#d0d8e4",fontSize:11,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",lineHeight:1.6}}/>

        {/* Preview count */}
        {bulkText.trim()&&(()=>{
          const lines=bulkText.split(/\n/).map(l=>l.trim()).filter(l=>l.length>0);
          return(<div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:6,background:"rgba(77,150,255,.04)",border:"1px solid rgba(77,150,255,.1)"}}>
            <span style={{fontSize:18}}>{"\uD83D\uDC20"}</span>
            <div><div style={{fontSize:11,fontWeight:700,color:"#7bb8ff"}}>{lines.length} fish to add</div>
            <div style={{fontSize:8,opacity:.4,marginTop:1}}>Preview: {lines.slice(0,3).join(", ")}{lines.length>3?`, +${lines.length-3} more`:""}</div></div>
          </div>);
        })()}

        {/* Settings that will apply */}
        <div style={{fontSize:9,opacity:.35,letterSpacing:1,fontWeight:600}}>APPLY TO ALL</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
          {Object.entries(IMP).map(([k,v])=>{const act=bulkImp===k;return(
            <button key={k} onClick={()=>setBulkImp(k)} style={{padding:"4px 10px",fontSize:9,fontFamily:"inherit",cursor:"pointer",background:act?(v.color?v.color+"18":"rgba(255,255,255,.06)"):"rgba(255,255,255,.02)",border:`1px solid ${act?(v.color||"rgba(255,255,255,.15)")+"44":"rgba(255,255,255,.04)"}`,borderRadius:5,color:act?(v.color||"#d0d8e4"):"#556",fontWeight:act?700:400,transition:"all .1s"}}>{v.badge?v.badge+" ":""}{v.label}</button>);})}
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
          {DUR_PRESETS.map(d=>{const act=bulkDur===d.v;return(
            <button key={d.v} onClick={()=>setBulkDur(act?"":d.v)} style={{padding:"4px 8px",fontSize:8,fontFamily:"inherit",cursor:"pointer",background:act?"rgba(77,150,255,.12)":"rgba(255,255,255,.02)",border:`1px solid ${act?"rgba(77,150,255,.3)":"rgba(255,255,255,.04)"}`,borderRadius:4,color:act?"#7bb8ff":"#556",fontWeight:act?700:400,transition:"all .1s"}}>{d.l}</button>);})}
          {bulkDur&&<button onClick={()=>setBulkDur("")} style={{...tinyBtn,fontSize:8,color:"#888"}}>{"\u2715"}</button>}
        </div>

        {/* Action buttons */}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={close} style={{flex:1,padding:"12px 0",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,color:"#a8b4c0",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>Cancel</button>
          <button onClick={doAdd} disabled={!bulkText.trim()||!activeId} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,fontWeight:700,cursor:bulkText.trim()&&activeId?"pointer":"not-allowed",fontSize:12,fontFamily:"inherit",letterSpacing:1,background:bulkText.trim()&&activeId?"linear-gradient(135deg,#4D96FF,#6BCB77)":"rgba(255,255,255,.04)",color:bulkText.trim()&&activeId?"#fff":"#555",opacity:bulkText.trim()&&activeId?1:.4}}>{"\uD83D\uDC20"} Add All Fish</button>
        </div>
      </div>
    </div></>);
}
