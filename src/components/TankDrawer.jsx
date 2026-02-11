import { useState } from "react";
import { SPD, DEVICE_ID } from "../constants.js";
import { iconBtn, tinyBtn } from "../styles.js";

function TankRow({tank,index,total,isActive,onSelect,onMove,onRename,onDelete,onSpeed,onLeave}){
  const isNonOwner=tank.ownerId&&tank.ownerId!==DEVICE_ID;
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(tank.name);
  const si=tank.speedIdx??2;
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 6px",borderRadius:8,marginBottom:4,cursor:"pointer",background:isActive?"rgba(77,150,255,.06)":"transparent",border:`1px solid ${isActive?"rgba(77,150,255,.15)":"transparent"}`}}>
      <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
        <button onClick={e=>{e.stopPropagation();onMove(-1);}} disabled={index===0} style={{...tinyBtn,opacity:index===0?.15:.5}}>{"\u25B2"}</button>
        <button onClick={e=>{e.stopPropagation();onMove(1);}} disabled={index===total-1} style={{...tinyBtn,opacity:index===total-1?.15:.5}}>{"\u25BC"}</button>
      </div>
      <div onClick={onSelect} style={{flex:1,minWidth:0}}>
        {editing?(<input autoFocus value={name} onChange={e=>setName(e.target.value)}
          onBlur={()=>{onRename(name);setEditing(false);}}
          onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setEditing(false);}}
          onClick={e=>e.stopPropagation()}
          style={{width:"100%",padding:"2px 4px",background:"rgba(0,0,0,.3)",border:"1px solid rgba(77,150,255,.3)",borderRadius:4,color:"var(--tx,#d0d8e4)",fontSize:11,fontFamily:"inherit",boxSizing:"border-box"}}/>
        ):(<div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,fontWeight:600,color:isActive?"#7bb8ff":"#8898aa",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tank.name}</span>
            <span style={{fontSize:8,opacity:.25,flexShrink:0}}>{(tank.fishes||[]).length}{"\uD83D\uDC20"}</span>
          </div>)}
      </div>
      <button onClick={e=>{e.stopPropagation();onSpeed();}} title={SPD[si].label} style={{...tinyBtn,fontSize:13,minWidth:24}}>{SPD[si].icon}</button>
      {!isNonOwner&&<button onClick={e=>{e.stopPropagation();setEditing(true);setName(tank.name);}} style={{...tinyBtn,fontSize:9}}>{"\u270F\uFE0F"}</button>}
      {isNonOwner?(<button onClick={e=>{e.stopPropagation();onLeave();}} style={{...tinyBtn,color:"#FF4757",fontSize:8}}>{"\u21A9"}</button>
      ):(<button onClick={e=>{e.stopPropagation();onDelete();}} style={{...tinyBtn,color:"#FF4757",fontSize:9}}>{"\uD83D\uDDD1\uFE0F"}</button>)}
    </div>
  );
}

export default function TankDrawer({ drawer, setDrawer, tanks, activeId, setActiveId, moveTank, renameTank, setDelModal, cycleSpeed, addTank, setJoinModal, MAX_TANKS, leaveTank }) {
  if(!drawer)return null;
  return(<>
    <div onClick={()=>setDrawer(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.5)",zIndex:38}}/>
    <div style={{position:"absolute",top:0,left:0,bottom:0,width:"min(300px, 80vw)",background:"var(--surf,rgba(8,12,24,.98))",zIndex:40,display:"flex",flexDirection:"column",boxShadow:"4px 0 30px rgba(0,0,0,.5)",animation:"slideRight .2s ease-out",backdropFilter:"blur(10px)"}}>
      <div style={{padding:"14px 16px",borderBottom:"1px solid var(--brd,rgba(255,255,255,.04))",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:12,fontWeight:700,letterSpacing:3,color:"#4D96FF"}}>{"\uD83D\uDC20"} TANKS</span>
        <button onClick={()=>setDrawer(false)} style={{...iconBtn,fontSize:14}}>{"\u2715"}</button>
      </div>
      <div style={{flex:1,overflow:"auto",padding:"8px 12px"}}>
        {tanks.map((tank,i)=>(<TankRow key={tank.id} tank={tank} index={i} total={tanks.length}
          isActive={tank.id===activeId}
          onSelect={()=>{setActiveId(tank.id);setDrawer(false);}}
          onMove={dir=>moveTank(tank.id,dir)}
          onRename={name=>renameTank(tank.id,name)}
          onDelete={()=>setDelModal({tankId:tank.id,input:""})}
          onSpeed={()=>cycleSpeed(tank.id)}
          onLeave={()=>{leaveTank(tank.id);setDrawer(false);}}/>))}
      </div>
      {tanks.length<MAX_TANKS&&(<div style={{padding:"12px 16px",borderTop:"1px solid var(--brd,rgba(255,255,255,.04))"}}>
        <button onClick={()=>{addTank();setDrawer(false);}} style={{width:"100%",padding:"10px 0",background:"rgba(77,150,255,.08)",border:"1px solid rgba(77,150,255,.2)",borderRadius:8,color:"#7bb8ff",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,marginBottom:6}}>+ New Tank</button>
        <button onClick={()=>{setJoinModal(true);setDrawer(false);}} style={{width:"100%",padding:"10px 0",background:"rgba(46,213,115,.06)",border:"1px solid rgba(46,213,115,.15)",borderRadius:8,color:"#2ED573",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1}}>{"\uD83D\uDCF1"} Join Shared Tank</button>
      </div>)}
    </div>
  </>);
}
