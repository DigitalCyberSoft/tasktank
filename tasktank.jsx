import { useState, useEffect, useRef, useCallback } from "react";
import { MAX_TANKS, COLORS, SPD, IMP, DEPTH_BAND, DUR_PRESETS, DEVICE_ID, pick, uid, clamp, todayStr, daysBetween, getGrid, getZoomGrid, durLabel, nowISO, db, GUN_RELAYS, SYNC_CODE_VERSION } from "./constants.js";
import useSync from "./useSync.js";
import { iconBtn, gridCardBtn } from "./styles.js";
import useAnimationLoop from "./useAnimationLoop.js";
import TankRenderer from "./TankRenderer.jsx";
import CaughtPanel from "./CaughtPanel.jsx";
import TopBar from "./TopBar.jsx";
import TankDrawer from "./TankDrawer.jsx";
import { DesktopInputBar, MobileInputBar } from "./InputBar.jsx";
import { DeleteModal, NewTankModal, ListViewOverlay, PurgeOverlay, ShareModal, JoinModal, BulkAddModal } from "./Modals.jsx";

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
export default function TaskTankApp(){
  const [tanks,setTanks]=useState([]);
  const [activeId,setActiveId]=useState(null);
  const [caught,setCaught]=useState(null);
  const [ready,setReady]=useState(false);
  const [input,setInput]=useState("");
  const [drawer,setDrawer]=useState(false);
  const [nukeId,setNukeId]=useState(null);
  const [keepers,setKeepers]=useState(new Set());
  const [delModal,setDelModal]=useState(null);
  const [flushTid,setFlushTid]=useState(null);
  const [etId,setEtId]=useState(null);
  const [etName,setEtName]=useState("");
  const [zoomed,setZoomed]=useState(false);
  const [viewZoom,setViewZoom]=useState(0); // 0=auto, 1=single, 2/3/4/6=explicit grid
  const [winW,setWinW]=useState(typeof window!=="undefined"?window.innerWidth:800);
  const [opLog,setOpLog]=useState([]);
  const [newImp,setNewImp]=useState("normal");
  const [newDue,setNewDue]=useState("");
  const [newDur,setNewDur]=useState("");
  const [headerEdit,setHeaderEdit]=useState(false);
  const [headerName,setHeaderName]=useState("");
  const [shareModal,setShareModal]=useState(null);
  const [joinModal,setJoinModal]=useState(false);
  const [bulkModal,setBulkModal]=useState(false);
  const [listView,setListView]=useState(false);
  const [newTankModal,setNewTankModal]=useState(false);

  const isMobile=winW<768;
  const effectiveZoom=viewZoom===0?(isMobile?1:(zoomed?1:0)):viewZoom;
  const showSingle=effectiveZoom===1;
  const showGrid=!showSingle&&tanks.length>0;
  const ZOOM_LEVELS=[1,2,3,4,6];
  const cycleZoom=(dir)=>{
    const cur=effectiveZoom===0?Math.min(tanks.length+(tanks.length<MAX_TANKS?1:0),6):effectiveZoom;
    const ci=ZOOM_LEVELS.indexOf(cur);
    const ni=clamp((ci===-1?(dir>0?ZOOM_LEVELS.length-1:0):ci+dir),0,ZOOM_LEVELS.length-1);
    setViewZoom(ZOOM_LEVELS[ni]);if(ZOOM_LEVELS[ni]===1&&!activeId&&tanks.length)setActiveId(tanks[0].id);
    if(ZOOM_LEVELS[ni]>1)setZoomed(false);
  };

  // Animation loop hook
  const { pR, fE, fB, fL, tE, surfT, flR, initP } = useAnimationLoop(tanks, caught, showGrid, showSingle, effectiveZoom);

  // P2P sync hook
  const { syncStatus, syncedTanks, shareTank, joinTank } = useSync(tanks, setTanks, initP);

  const tchR=useRef({sx:0,sy:0,swiping:false,swiped:false,dx:0});const swipeEl=useRef(null);

  useEffect(()=>{const h=()=>setWinW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);

  // Operation log — every mutation appends here for sync
  const log=useCallback((op,payload)=>{
    setOpLog(prev=>{const next=[...prev,{id:uid(),ts:nowISO(),deviceId:DEVICE_ID,op,payload}];
      return next.length>500?next.slice(-500):next;});
  },[]);

  // LOAD/SAVE
  useEffect(()=>{db.load().then(d=>{
    if(d?.tanks?.length){setTanks(d.tanks);setActiveId(d.activeId||d.tanks[0].id);
      d.tanks.forEach(t=>{(t.fishes||[]).forEach(f=>initP(f.id,f.completed?"completed":(f.importance||"normal")));surfT.current[t.id]=180+Math.random()*250;});
      if(d.opLog)setOpLog(d.opLog);if(d.viewZoom!=null)setViewZoom(d.viewZoom);}
    setReady(true);
  });},[initP]);
  useEffect(()=>{if(ready)db.save({tanks,activeId,opLog,deviceId:DEVICE_ID,viewZoom,v:5});},[tanks,activeId,opLog,viewZoom,ready]);

  // SWIPE (mobile single view)
  const navTank=useCallback(dir=>{setActiveId(prev=>{const ts=tanks;const i=ts.findIndex(t=>t.id===prev);return ts[clamp(i+dir,0,ts.length-1)]?.id??prev;});},[tanks]);
  const onTS=useCallback(e=>{if(e.touches.length!==1)return;const t=e.touches[0];tchR.current={sx:t.clientX,sy:t.clientY,swiping:false,swiped:false,dx:0};if(swipeEl.current)swipeEl.current.style.transition="none";},[]);
  const onTM=useCallback(e=>{if(e.touches.length!==1)return;const dx=e.touches[0].clientX-tchR.current.sx;const dy=e.touches[0].clientY-tchR.current.sy;if(!tchR.current.swiping){if(Math.abs(dx)>16&&Math.abs(dx)>Math.abs(dy)*1.5)tchR.current.swiping=true;else return;}tchR.current.dx=dx;if(swipeEl.current)swipeEl.current.style.transform=`translateX(${clamp(dx*.3,-100,100)}px)`;},[]);
  const onTE=useCallback(()=>{if(swipeEl.current){swipeEl.current.style.transition="transform .2s ease";swipeEl.current.style.transform="";}if(tchR.current.swiping){tchR.current.swiped=true;const{dx}=tchR.current;if(dx<-50)navTank(1);else if(dx>50)navTank(-1);setTimeout(()=>{tchR.current.swiped=false;},80);}},[navTank]);

  // TANK CRUD
  const openNewTank=()=>{if(tanks.length>=MAX_TANKS)return;setNewTankModal(true);};
  const addTank=(name)=>{if(tanks.length>=MAX_TANKS)return;const id=uid();surfT.current[id]=200+Math.random()*280;const t={id,name,fishes:[],speedIdx:2,ownerId:DEVICE_ID,peers:[]};setTanks(p=>[...p,t]);setActiveId(id);log("tank.add",{tankId:id,name:t.name});};
  const confirmDelete=()=>{if(!delModal)return;const tid=delModal.tankId;const tank=tanks.find(t=>t.id===tid);if(tank)(tank.fishes||[]).forEach(f=>{delete pR.current[f.id];delete fE.current[f.id];delete fB.current[f.id];delete fL.current[f.id];});delete tE.current[tid];delete surfT.current[tid];if(caught?.tankId===tid)setCaught(null);if(nukeId===tid){setNukeId(null);setKeepers(new Set());}setTanks(p=>{const nx=p.filter(t=>t.id!==tid);if(activeId===tid)setActiveId(nx[0]?.id||null);return nx;});log("tank.delete",{tankId:tid});setDelModal(null);if(tanks.length<=2&&viewZoom>1)setViewZoom(0);};
  const moveTank=(tid,dir)=>{setTanks(p=>{const i=p.findIndex(t=>t.id===tid);const ni=clamp(i+dir,0,p.length-1);if(i===ni)return p;const a=[...p];[a[i],a[ni]]=[a[ni],a[i]];log("tank.reorder",{tankId:tid,from:i,to:ni});return a;});};
  const renameTank=(tid,name)=>{if(!name.trim())return;setTanks(p=>p.map(t=>t.id===tid?{...t,name:name.trim()}:t));log("tank.rename",{tankId:tid,name:name.trim()});};
  const saveTankName=()=>{if(etName.trim()&&etId)renameTank(etId,etName);setEtId(null);};
  const saveHeaderName=()=>{if(headerName.trim()&&activeId)renameTank(activeId,headerName);setHeaderEdit(false);};
  const cycleSpeed=tid=>{setTanks(p=>p.map(t=>t.id===tid?{...t,speedIdx:((t.speedIdx??2)+1)%SPD.length}:t));log("tank.speed",{tankId:tid});};

  // FISH CRUD
  const addFish=()=>{const t=input.trim();if(!t||!activeId)return;const id=uid();const imp=newImp||"normal";const due=newDue||null;const dur=newDur||null;initP(id,imp);setTanks(p=>p.map(tk=>tk.id===activeId?{...tk,fishes:[...(tk.fishes||[]),{id,task:t,color:pick(COLORS),importance:imp,dueDate:due,duration:dur,completed:false,checklist:[],links:[],attachments:[]}]}:tk));log("fish.add",{tankId:activeId,fishId:id,task:t,importance:imp,dueDate:due,duration:dur});setInput("");};
  const bulkAddFish=(lines,imp,dur)=>{
    if(!activeId||!lines.length)return;
    const newFishes=lines.map(task=>{const id=uid();initP(id,imp);return{id,task,color:pick(COLORS),importance:imp,dueDate:null,duration:dur,completed:false,checklist:[],links:[],attachments:[]};});
    setTanks(p=>p.map(tk=>tk.id===activeId?{...tk,fishes:[...(tk.fishes||[]),...newFishes]}:tk));
    newFishes.forEach(f=>log("fish.add",{tankId:activeId,fishId:f.id,task:f.task,importance:imp,dueDate:null,duration:dur}));
  };
  const catchFish=(tid,fid)=>{if(tchR.current.swiped||nukeId||caught||flR.current)return;setCaught({tankId:tid,fishId:fid});setActiveId(tid);};
  const releaseFish=()=>{if(!caught)return;const p=pR.current[caught.fishId];if(p){const a=Math.random()*Math.PI*2;p.dx=Math.cos(a)*0.018;p.dy=0;}setCaught(null);};
  const updateCaughtFish=fn=>{if(!caught)return;setTanks(p=>p.map(t=>t.id===caught.tankId?{...t,fishes:(t.fishes||[]).map(f=>f.id===caught.fishId?fn(f):f)}:t));};
  const toggleComplete=()=>{if(!caught)return;updateCaughtFish(f=>{const nc=!f.completed;const band=DEPTH_BAND[nc?"completed":(f.importance||"normal")];const p=pR.current[f.id];if(p){p.targetY=band.min+Math.random()*(band.max-band.min);}log("fish.status",{fishId:f.id,completed:nc});return{...f,completed:nc};});};
  const toggleFishComplete=(tid,fid)=>{setTanks(p=>p.map(t=>t.id!==tid?t:{...t,fishes:(t.fishes||[]).map(f=>{if(f.id!==fid)return f;const nc=!f.completed;const band=DEPTH_BAND[nc?"completed":(f.importance||"normal")];const pr=pR.current[f.id];if(pr){pr.targetY=band.min+Math.random()*(band.max-band.min);}log("fish.status",{fishId:f.id,completed:nc});return{...f,completed:nc};})}));};
  const removeFish=()=>{if(!caught)return;const{tankId,fishId}=caught;delete pR.current[fishId];delete fE.current[fishId];delete fB.current[fishId];delete fL.current[fishId];setTanks(p=>p.map(t=>t.id===tankId?{...t,fishes:(t.fishes||[]).filter(f=>f.id!==fishId)}:t));log("fish.remove",{tankId,fishId});setCaught(null);};
  const setFishImportance=k=>{updateCaughtFish(f=>{const band=DEPTH_BAND[f.completed?"completed":k];const p=pR.current[f.id];if(p){p.targetY=band.min+Math.random()*(band.max-band.min);}log("fish.edit",{fishId:f.id,importance:k});return{...f,importance:k};});};

  // PURGE
  const openPurge=()=>{if(!activeId)return;if(caught)releaseFish();setNukeId(activeId);setKeepers(new Set());};
  const toggleK=id=>setKeepers(p=>{const s=new Set(p);s.has(id)?s.delete(id):s.add(id);return s;});
  const doPurge=()=>{const tank=tanks.find(t=>t.id===nukeId);if(!tank)return;
    const doom=new Set((tank.fishes||[]).filter(f=>!keepers.has(f.id)).map(f=>f.id));if(!doom.size)return;
    const sp={};doom.forEach(id=>{const p=pR.current[id];if(p)sp[id]={x:p.x,y:p.y};});
    flR.current={tankId:nukeId,doomed:doom,sp,start:Date.now(),dur:1600};
    log("purge",{tankId:nukeId,removed:[...doom]});
    const flushingTankId=nukeId;const doomedSet=doom;
    setFlushTid(nukeId);setNukeId(null);setKeepers(new Set());
    setTimeout(()=>{
      if(!flR.current||flR.current.tankId!==flushingTankId)return;
      setTanks(p=>p.map(t=>t.id!==flushingTankId?t:{...t,fishes:(t.fishes||[]).filter(f=>!doomedSet.has(f.id))}));
      doomedSet.forEach(id=>{delete pR.current[id];delete fE.current[id];delete fB.current[id];delete fL.current[id];});
      flR.current=null;setFlushTid(null);
    },1650);
  };

  // ── SHARING & SYNC ──
  const generateShareCode=async(tankId,perm)=>{
    const tank=tanks.find(t=>t.id===tankId);if(!tank)return"";
    const creds=await shareTank(tankId);
    const payload={type:"tasktank-pair",v:SYNC_CODE_VERSION,deviceId:DEVICE_ID,
      deviceName:(typeof navigator!=="undefined"?navigator.userAgent.slice(0,30):"Device"),
      tankId,tankName:tank.name,fishCount:(tank.fishes||[]).length,
      permission:perm,syncId:creds.syncId,encKey:creds.encKey,
      relays:GUN_RELAYS,
      ts:nowISO(),expires:new Date(Date.now()+300000).toISOString()};
    try{return btoa(JSON.stringify(payload));}catch{return"";}
  };
  const parseShareCode=(code)=>{
    try{const d=JSON.parse(atob(code.trim()));
      if(d.type!=="tasktank-pair"||!d.deviceId||!d.tankId)return{error:"Invalid pairing code"};
      if(d.deviceId===DEVICE_ID)return{error:"Can't pair with yourself"};
      if(d.expires&&new Date(d.expires)<new Date())return{error:"Pairing code expired"};
      if(d.v>=2&&(!d.syncId||!d.encKey))return{error:"Missing sync credentials"};
      return{data:d};}catch{return{error:"Invalid code format"};}
  };
  const acceptPair=(pairData)=>{
    const existing=tanks.find(t=>t.id===pairData.tankId);
    if(existing){
      setTanks(p=>p.map(t=>t.id===pairData.tankId?{...t,peers:[...(t.peers||[]).filter(p=>p.deviceId!==pairData.deviceId),
        {deviceId:pairData.deviceId,deviceName:pairData.deviceName,permission:pairData.permission,pairedAt:nowISO(),lastSyncAt:null}]}:t));
    }else{
      const nt={id:pairData.tankId,name:pairData.tankName||"Shared Tank",fishes:[],speedIdx:2,
        ownerId:pairData.deviceId,peers:[{deviceId:pairData.deviceId,deviceName:pairData.deviceName,permission:pairData.permission,pairedAt:nowISO(),lastSyncAt:null}]};
      setTanks(p=>[...p,nt]);surfT.current[nt.id]=200+Math.random()*300;
      setActiveId(nt.id);
    }
    // Start P2P sync for v2 codes
    if(pairData.syncId&&pairData.encKey){
      joinTank({tankId:pairData.tankId,syncId:pairData.syncId,encKey:pairData.encKey});
    }
    log("sync.pair",{tankId:pairData.tankId,remoteDeviceId:pairData.deviceId,permission:pairData.permission});
    setJoinModal(false);
  };
  const removePeer=(tankId,deviceId)=>{
    setTanks(p=>p.map(t=>t.id===tankId?{...t,peers:(t.peers||[]).filter(p=>p.deviceId!==deviceId)}:t));
    log("sync.unpair",{tankId,remoteDeviceId:deviceId});
  };

  // DERIVED
  const actTank=tanks.find(t=>t.id===activeId);
  useEffect(()=>{if(tanks.length>0&&!actTank){setActiveId(tanks[0].id);}},[tanks,actTank]);
  const nukeTank=tanks.find(t=>t.id===nukeId);
  const cData=caught?tanks.find(t=>t.id===caught.tankId)?.fishes?.find(f=>f.id===caught.fishId):null;
  const td=todayStr();
  const dueLabel=d=>{if(!d)return null;const diff=daysBetween(td,d);if(diff<0)return{text:`${-diff}d overdue`,color:"#FF4757"};if(diff===0)return{text:"Due today",color:"#FFD93D"};if(diff===1)return{text:"Tomorrow",color:"#4D96FF"};return{text:`${diff}d left`,color:"#6BCB77"};};
  const cardN=tanks.length+(tanks.length<MAX_TANKS?1:0);
  const grid=effectiveZoom>=2?getZoomGrid(effectiveZoom,cardN):getGrid(cardN);
  const truncLen=showSingle?22:(effectiveZoom>=4?14:16);

  // Fish actions bundle for CaughtPanel
  const fishActions={toggleComplete,updateCaughtFish,setFishImportance,releaseFish,removeFish,log};

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return(
    <div style={{width:"100vw",height:"100vh",background:"#040810",display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"'SF Mono','Fira Code','Cascadia Code','Consolas',monospace",color:"#d0d8e4",userSelect:"none",position:"relative"}}>
      <style>{`
        @keyframes sway{0%,100%{transform:skewX(-5deg)}50%{transform:skewX(5deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes slideRight{from{transform:translateX(-100%)}to{transform:translateX(0)}}
        @keyframes rise{0%{opacity:.1;transform:translateY(0)}100%{opacity:0;transform:translateY(-45vh) scale(.3)}}
        @keyframes vSpin{from{transform:rotate(0)}to{transform:rotate(1080deg)}}
        @keyframes vPulse{0%,100%{opacity:.15;transform:scale(.7)}50%{opacity:.5;transform:scale(1.3)}}
        @keyframes impP{0%,100%{opacity:.5}50%{opacity:1}}
        .fhit{cursor:pointer;transition:filter .12s;-webkit-tap-highlight-color:transparent}
        .fhit:hover{filter:brightness(1.5) drop-shadow(0 0 14px rgba(255,255,255,.3))!important}
        input:focus,textarea:focus{outline:none;border-color:rgba(77,150,255,.4)!important}
        button{transition:transform .07s,filter .08s;-webkit-tap-highlight-color:transparent}
        button:active{transform:scale(.95)!important}
        .ni{transition:all .12s}.ni:hover{background:rgba(255,255,255,.04)!important}
        .tcard{transition:border-color .2s,box-shadow .2s;cursor:pointer}
        .tcard:hover{box-shadow:0 0 16px rgba(77,150,255,.05)}
        .addc{transition:border-color .2s,background .2s}.addc:hover{border-color:rgba(77,150,255,.25)!important;background:rgba(77,150,255,.025)!important}
        *{-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.06) transparent}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:2px}
      `}</style>

      {/* ══ TOP BAR ══ */}
      <TopBar showSingle={showSingle} setDrawer={setDrawer} stStatus={syncStatus} setJoinModal={setJoinModal}
        actTank={actTank} headerEdit={headerEdit} headerName={headerName} setHeaderName={setHeaderName}
        setHeaderEdit={setHeaderEdit} saveHeaderName={saveHeaderName} effectiveZoom={effectiveZoom}
        cycleZoom={cycleZoom} tanks={tanks} setListView={setListView} setShareModal={setShareModal}
        cycleSpeed={cycleSpeed} openPurge={openPurge}/>

      {/* ══ BODY ══ */}
      {tanks.length===0&&!showGrid?(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:20}}>
          <div style={{fontSize:48,opacity:.15}}>{"\uD83D\uDC20"}</div>
          <div style={{fontSize:14,opacity:.2,letterSpacing:4,fontWeight:700}}>TASKTANK</div>
          <div style={{fontSize:10,opacity:.1,textAlign:"center",maxWidth:220,lineHeight:1.6}}>Your tasks are fish. They swim to remind you. Create your first tank.</div>
          <button onClick={openNewTank} style={{marginTop:8,padding:"10px 24px",background:"linear-gradient(135deg,#4D96FF,#6BCB77)",border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1}}>+ Create Tank</button>
        </div>
      ):showGrid?(
        /* ── DESKTOP GRID ── */
        <div style={{flex:1,display:"grid",gridTemplateColumns:`repeat(${grid.c},1fr)`,gridTemplateRows:`repeat(${grid.r},1fr)`,gap:5,padding:5,overflow:"hidden",minHeight:0}}>
          {tanks.map((tank,i)=>{
            const isAct=tank.id===activeId;const si=tank.speedIdx??2;
            return(<div key={tank.id} className="tcard" onClick={()=>setActiveId(tank.id)}
              style={{display:"flex",flexDirection:"column",borderRadius:8,border:`1px solid ${isAct?"rgba(77,150,255,.3)":"rgba(255,255,255,.03)"}`,boxShadow:isAct?"0 0 14px rgba(77,150,255,.06)":"none",overflow:"hidden",minHeight:0,background:"rgba(6,10,20,.6)"}}>
              <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 8px",flexShrink:0,background:isAct?"rgba(77,150,255,.06)":"rgba(255,255,255,.012)",borderBottom:"1px solid rgba(255,255,255,.025)"}}>
                <button onClick={e=>{e.stopPropagation();moveTank(tank.id,-1);}} style={{...gridCardBtn,opacity:i===0?.15:.5}}>{"\u25C0"}</button>
                <button onClick={e=>{e.stopPropagation();moveTank(tank.id,1);}} style={{...gridCardBtn,opacity:i===tanks.length-1?.15:.5}}>{"\u25B6"}</button>
                {etId===tank.id?(<input autoFocus value={etName} onChange={e=>setEtName(e.target.value)}
                  onBlur={saveTankName} onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setEtId(null);}}
                  onClick={e=>e.stopPropagation()}
                  style={{flex:1,padding:"2px 5px",background:"rgba(0,0,0,.3)",border:"1px solid rgba(77,150,255,.3)",borderRadius:4,color:"#d0d8e4",fontSize:12,fontFamily:"inherit",minWidth:0}}/>
                ):(<span onClick={e=>{e.stopPropagation();setEtId(tank.id);setEtName(tank.name);}}
                  style={{flex:1,fontSize:12,fontWeight:600,letterSpacing:1.2,color:isAct?"#7bb8ff":"#7888a0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"text",borderBottom:isAct?"1px dashed rgba(123,184,255,.15)":"1px dashed transparent"}}>{tank.name.toUpperCase()} <span style={{fontSize:9,opacity:.2}}>{"\u270F"}</span></span>)}
                <span style={{fontSize:10,opacity:.25,flexShrink:0}}>{(tank.fishes||[]).length}{"\uD83D\uDC20"}</span>
                {(tank.peers||[]).length>0&&<span style={{fontSize:9,opacity:.35,flexShrink:0,color:"#2ED573"}}>{(tank.peers||[]).length}{"\uD83D\uDD17"}</span>}
                <button onClick={e=>{e.stopPropagation();cycleSpeed(tank.id);}} title={SPD[si].label} style={{...gridCardBtn,fontSize:13,minWidth:26}}>{SPD[si].icon}</button>
                <button onClick={e=>{e.stopPropagation();setActiveId(tank.id);setListView(true);}} style={{...gridCardBtn,fontSize:12}} title="List view">{"\u2630"}</button>
                <button onClick={e=>{e.stopPropagation();setShareModal(tank.id);}} style={{...gridCardBtn,fontSize:12}} title="Share">{"\uD83D\uDD17"}</button>
                <button onClick={e=>{e.stopPropagation();setActiveId(tank.id);setViewZoom(1);}} style={{...gridCardBtn,fontSize:12}}>{"\u26F6"}</button>
                <button onClick={e=>{e.stopPropagation();setDelModal({tankId:tank.id,input:""});}} style={{...gridCardBtn,color:"#556",fontSize:11}}>{"\u00D7"}</button>
              </div>
              <TankRenderer tank={tank} caught={caught} showSingle={showSingle} effectiveZoom={effectiveZoom}
                flushTid={flushTid} catchFish={catchFish} pR={pR} fE={fE} fB={fB} fL={fL} tE={tE}
                dueLabel={dueLabel} truncLen={truncLen}/>
            </div>);
          })}
          {tanks.length<MAX_TANKS&&(
            <div className="addc" onClick={openNewTank} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"1.5px dashed rgba(255,255,255,.05)",borderRadius:8,cursor:"pointer",background:"rgba(255,255,255,.006)",minHeight:0}}>
              <div style={{fontSize:32,opacity:.13,marginBottom:3,lineHeight:1}}>+</div>
              <div style={{fontSize:11,opacity:.08,letterSpacing:2}}>NEW TANK</div>
            </div>)}
        </div>
      ):(
        /* ── MOBILE SINGLE VIEW ── */
        actTank?(<div ref={swipeEl} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE} style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
          <TankRenderer tank={actTank} caught={caught} showSingle={showSingle} effectiveZoom={effectiveZoom}
            flushTid={flushTid} catchFish={catchFish} pR={pR} fE={fE} fB={fB} fL={fL} tE={tE}
            dueLabel={dueLabel} truncLen={truncLen}/>
        </div>):(tanks.length>0?(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",opacity:.3,fontSize:10}}>Loading tank...</div>
        ):(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:20}}>
            <div style={{fontSize:48,opacity:.15}}>{"\uD83D\uDC20"}</div>
            <div style={{fontSize:14,opacity:.2,letterSpacing:4,fontWeight:700}}>TASKTANK</div>
            <button onClick={openNewTank} style={{marginTop:8,padding:"10px 24px",background:"linear-gradient(135deg,#4D96FF,#6BCB77)",border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1}}>+ Create Tank</button>
          </div>
        ))
      )}

      {/* ── Desktop input bar (grid mode) ── */}
      {showGrid&&tanks.length>0&&(
        <DesktopInputBar input={input} setInput={setInput} addFish={addFish} actTank={actTank}
          newImp={newImp} setNewImp={setNewImp} newDur={newDur} setNewDur={setNewDur}
          newDue={newDue} setNewDue={setNewDue} setBulkModal={setBulkModal}/>
      )}

      {/* ── Mobile bottom bar ── */}
      {showSingle&&tanks.length>0&&(
        <MobileInputBar input={input} setInput={setInput} addFish={addFish} actTank={actTank}
          newImp={newImp} setNewImp={setNewImp} newDur={newDur} setNewDur={setNewDur}
          newDue={newDue} setNewDue={setNewDue} setBulkModal={setBulkModal}
          tanks={tanks} activeId={activeId} setActiveId={setActiveId} navTank={navTank}/>
      )}

      {/* ══ CAUGHT PANEL ══ */}
      <CaughtPanel cData={cData} nukeId={nukeId} isMobile={isMobile} fishActions={fishActions} releaseFish={releaseFish}/>

      {/* ══ TANK DRAWER (mobile) ══ */}
      <TankDrawer drawer={drawer} setDrawer={setDrawer} tanks={tanks} activeId={activeId} setActiveId={setActiveId}
        moveTank={moveTank} renameTank={renameTank} setDelModal={setDelModal} cycleSpeed={cycleSpeed}
        addTank={openNewTank} setJoinModal={setJoinModal} MAX_TANKS={MAX_TANKS}/>

      {/* ══ DELETE MODAL ══ */}
      <DeleteModal delModal={delModal} setDelModal={setDelModal} tanks={tanks} confirmDelete={confirmDelete}/>

      {/* ══ NEW TANK MODAL ══ */}
      <NewTankModal newTankModal={newTankModal} setNewTankModal={setNewTankModal} onCreateTank={addTank}/>

      {/* ══ LIST VIEW OVERLAY ══ */}
      <ListViewOverlay listView={listView} setListView={setListView} actTank={actTank} catchFish={catchFish} toggleFishComplete={toggleFishComplete}/>

      {/* ══ PURGE OVERLAY ══ */}
      <PurgeOverlay nukeId={nukeId} nukeTank={nukeTank} keepers={keepers} toggleK={toggleK}
        doPurge={doPurge} setNukeId={setNukeId} setKeepers={setKeepers}/>

      {/* ══ SHARE MODAL ══ */}
      <ShareModal shareModal={shareModal} setShareModal={setShareModal} tanks={tanks}
        syncStatus={syncStatus} syncedTanks={syncedTanks} generateShareCode={generateShareCode} removePeer={removePeer}/>

      {/* ══ JOIN MODAL ══ */}
      <JoinModal joinModal={joinModal} setJoinModal={setJoinModal} parseShareCode={parseShareCode}
        acceptPair={acceptPair} syncStatus={syncStatus}/>

      {/* ══ BULK ADD MODAL ══ */}
      <BulkAddModal bulkModal={bulkModal} setBulkModal={setBulkModal} actTank={actTank}
        activeId={activeId} bulkAddFish={bulkAddFish} initP={initP}/>

    </div>);
}
