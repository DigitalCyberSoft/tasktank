import { useState, useRef } from "react";
import { IMP, SPD, DEVICE_ID, todayStr, daysBetween, durLabel } from "../constants.js";
import { boardCard, boardColumn, iconBtn } from "../styles.js";

const td=todayStr();
const dueLabel=d=>{if(!d)return null;const diff=daysBetween(td,d);if(diff<0)return{text:`${-diff}d overdue`,color:"#FF4757"};if(diff===0)return{text:"Due today",color:"#FFD93D"};if(diff===1)return{text:"Tomorrow",color:"#4D96FF"};return{text:`${diff}d left`,color:"#6BCB77"};};

const IMP_SECTIONS=[
  {key:"critical",label:"\uD83D\uDD25 CRITICAL",color:"#FF4757"},
  {key:"important",label:"\u2B50 IMPORTANT",color:"#FFD93D"},
  {key:"normal",label:"\u25CB NORMAL",color:"#8898aa"},
  {key:"completed",label:"\u2713 COMPLETED",color:"#2ED573"},
];

function BoardCard({fish,tankId,catchFish,toggleFishComplete}){
  const isComp=!!fish.completed;
  const imp=fish.importance||"normal";
  const dl=isComp?null:dueLabel(fish.dueDate);
  const cl=fish.checklist||[];
  const clDone=cl.filter(c=>c.done).length;
  const att=fish.attachments||[];
  return(
    <div onClick={()=>catchFish(tankId,fish.id)} className="ni"
      style={{...boardCard,opacity:isComp?.6:1}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
        <div onClick={e=>{e.stopPropagation();toggleFishComplete(tankId,fish.id);}}
          style={{width:18,height:18,borderRadius:4,marginTop:1,flexShrink:0,cursor:"pointer",
            border:`1.5px solid ${isComp?"#2ED573":"rgba(255,255,255,.15)"}`,
            background:isComp?"#2ED57322":"transparent",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#2ED573"}}>
          {isComp&&"\u2713"}
        </div>
        <span style={{flex:1,fontSize:12,lineHeight:1.4,wordBreak:"break-word",
          textDecoration:isComp?"line-through":"none",
          color:isComp?"var(--tx3,#556)":"var(--tx,#d0d8e4)"}}>
          {fish.task}
        </span>
      </div>
      {(dl||fish.duration||cl.length>0||att.length>0||(!isComp&&imp!=="normal"))&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginTop:6,paddingLeft:26}}>
          {!isComp&&imp!=="normal"&&<span style={{fontSize:8,color:IMP[imp].color,fontWeight:600}}>{IMP[imp].badge}</span>}
          {dl&&<span style={{fontSize:8,color:dl.color,fontWeight:600}}>{dl.text}</span>}
          {fish.duration&&<span style={{fontSize:8,color:"#7bb8ff"}}>{durLabel(fish.duration)}</span>}
          {cl.length>0&&<span style={{fontSize:8,opacity:.4}}>{"\u2611"} {clDone}/{cl.length}</span>}
          {att.length>0&&<span style={{fontSize:8,opacity:.4}}>{"\uD83D\uDCCE"} {att.length}</span>}
        </div>
      )}
    </div>
  );
}

function ImportanceSection({sectionKey,label,color,fishes,tankId,catchFish,toggleFishComplete}){
  const [collapsed,setCollapsed]=useState(false);
  if(fishes.length===0)return null;
  const isCompleted=sectionKey==="completed";
  return(
    <div style={{marginBottom:8}}>
      <div onClick={isCompleted?()=>setCollapsed(v=>!v):undefined}
        style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",cursor:isCompleted?"pointer":"default"}}>
        <span style={{fontSize:8,fontWeight:700,letterSpacing:1.5,color,opacity:.7}}>{label}</span>
        <span style={{fontSize:8,opacity:.25}}>{fishes.length}</span>
        {isCompleted&&<span style={{fontSize:8,opacity:.3,marginLeft:"auto"}}>{collapsed?"\u25B6":"\u25BC"}</span>}
      </div>
      {!collapsed&&fishes.map(f=>(
        <BoardCard key={f.id} fish={f} tankId={tankId} catchFish={catchFish} toggleFishComplete={toggleFishComplete}/>
      ))}
    </div>
  );
}

function QuickAddInput({tankId,addFishToTank}){
  const [val,setVal]=useState("");
  const submit=()=>{if(val.trim()){addFishToTank(tankId,val.trim());setVal("");}};
  return(
    <div style={{padding:"6px 8px",borderTop:"1px solid var(--brd2,rgba(255,255,255,.03))"}}>
      <div style={{display:"flex",gap:4}}>
        <input value={val} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")submit();}}
          placeholder="+ Add a task\u2026"
          style={{flex:1,padding:"7px 8px",background:"var(--inp,rgba(255,255,255,.035))",
            border:"1px solid var(--brd,rgba(255,255,255,.06))",borderRadius:5,
            color:"var(--tx,#d0d8e4)",fontSize:11,fontFamily:"inherit",minWidth:0}}/>
        {val.trim()&&<button onClick={submit}
          style={{padding:"4px 10px",background:"rgba(77,150,255,.15)",border:"none",borderRadius:5,
            color:"#4D96FF",fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:700,flexShrink:0}}>+</button>}
      </div>
    </div>
  );
}

function BoardColumn({tank,activeId,setActiveId,catchFish,toggleFishComplete,addFishToTank,cycleSpeed,setShareModal,setDelModal,renameTank,moveTank,tanks,leaveTank}){
  const [editName,setEditName]=useState(false);
  const [nameVal,setNameVal]=useState("");
  const fishes=tank.fishes||[];
  const isReadonly=!!(tank.ownerId&&tank.ownerId!==DEVICE_ID&&(tank.myPermission||"shared")==="readonly");
  const si=tank.speedIdx??2;

  const critical=fishes.filter(f=>!f.completed&&(f.importance||"normal")==="critical");
  const important=fishes.filter(f=>!f.completed&&(f.importance||"normal")==="important");
  const normal=fishes.filter(f=>!f.completed&&(f.importance||"normal")==="normal");
  const completed=fishes.filter(f=>f.completed);

  const idx=tanks.findIndex(t=>t.id===tank.id);

  return(
    <div style={{...boardColumn}} onClick={()=>setActiveId(tank.id)}>
      {/* Column header */}
      <div style={{display:"flex",alignItems:"center",gap:5,padding:"8px 10px",flexShrink:0,
        background:tank.id===activeId?"rgba(77,150,255,.06)":"var(--hvr,rgba(255,255,255,.012))",
        borderBottom:"1px solid var(--brd2,rgba(255,255,255,.025))"}}>
        {!isReadonly&&editName?(
          <input autoFocus value={nameVal} onChange={e=>setNameVal(e.target.value)}
            onBlur={()=>{if(nameVal.trim())renameTank(tank.id,nameVal);setEditName(false);}}
            onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setEditName(false);}}
            onClick={e=>e.stopPropagation()}
            style={{flex:1,padding:"2px 5px",background:"var(--inp,rgba(0,0,0,.3))",border:"1px solid rgba(77,150,255,.3)",borderRadius:4,color:"var(--tx,#d0d8e4)",fontSize:12,fontFamily:"inherit",minWidth:0}}/>
        ):(
          <span onClick={e=>{if(isReadonly)return;e.stopPropagation();setEditName(true);setNameVal(tank.name);}}
            style={{flex:1,fontSize:12,fontWeight:700,letterSpacing:1.2,
              color:tank.id===activeId?"#7bb8ff":"#7888a0",overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:isReadonly?"default":"text"}}>
            {tank.name.toUpperCase()}
            {isReadonly&&<span style={{fontSize:7,opacity:.3,color:"#4D96FF",marginLeft:4}}>VIEW ONLY</span>}
          </span>
        )}
        <span style={{fontSize:10,opacity:.25,flexShrink:0}}>{fishes.length}{"\uD83D\uDC20"}</span>
        <div style={{display:"flex",gap:2}}>
          {idx>0&&<button onClick={e=>{e.stopPropagation();moveTank(tank.id,-1);}} style={{...iconBtn,fontSize:9,padding:"2px 4px"}}>{"\u25C0"}</button>}
          {idx<tanks.length-1&&<button onClick={e=>{e.stopPropagation();moveTank(tank.id,1);}} style={{...iconBtn,fontSize:9,padding:"2px 4px"}}>{"\u25B6"}</button>}
          {!isReadonly&&<button onClick={e=>{e.stopPropagation();cycleSpeed(tank.id);}} title={SPD[si].label} style={{...iconBtn,fontSize:11,padding:"2px 5px"}}>{SPD[si].icon}</button>}
          <button onClick={e=>{e.stopPropagation();setShareModal(tank.id);}} style={{...iconBtn,fontSize:10,padding:"2px 5px"}} title="Share">{"\uD83D\uDD17"}</button>
          {!isReadonly?(<button onClick={e=>{e.stopPropagation();setDelModal({tankId:tank.id,input:""});}} style={{...iconBtn,color:"#556",fontSize:10,padding:"2px 5px"}}>{"\u00D7"}</button>
          ):(<button onClick={e=>{e.stopPropagation();leaveTank(tank.id);}} style={{...iconBtn,color:"#556",fontSize:8,padding:"2px 5px"}} title="Leave tank">{"\u21A9"}</button>)}
        </div>
      </div>

      {/* Card list */}
      <div style={{flex:1,overflow:"auto",padding:"6px 8px",minHeight:0}}>
        <ImportanceSection sectionKey="critical" label={IMP_SECTIONS[0].label} color={IMP_SECTIONS[0].color}
          fishes={critical} tankId={tank.id} catchFish={catchFish} toggleFishComplete={toggleFishComplete}/>
        <ImportanceSection sectionKey="important" label={IMP_SECTIONS[1].label} color={IMP_SECTIONS[1].color}
          fishes={important} tankId={tank.id} catchFish={catchFish} toggleFishComplete={toggleFishComplete}/>
        <ImportanceSection sectionKey="normal" label={IMP_SECTIONS[2].label} color={IMP_SECTIONS[2].color}
          fishes={normal} tankId={tank.id} catchFish={catchFish} toggleFishComplete={toggleFishComplete}/>
        <ImportanceSection sectionKey="completed" label={IMP_SECTIONS[3].label} color={IMP_SECTIONS[3].color}
          fishes={completed} tankId={tank.id} catchFish={catchFish} toggleFishComplete={toggleFishComplete}/>
        {fishes.length===0&&(
          <div style={{textAlign:"center",padding:"24px 8px",opacity:.15,fontSize:10}}>No tasks yet</div>
        )}
      </div>

      {/* Quick add */}
      {!isReadonly&&<QuickAddInput tankId={tank.id} addFishToTank={addFishToTank}/>}
    </div>
  );
}

export default function BoardView({tanks,activeId,setActiveId,catchFish,toggleFishComplete,addFishToTank,openNewTank,cycleSpeed,setShareModal,setDelModal,renameTank,moveTank,MAX_TANKS,leaveTank}){
  return(
    <div style={{flex:1,display:"flex",gap:12,padding:"12px 12px 12px",overflow:"auto",minHeight:0,alignItems:"flex-start"}}>
      {tanks.map(tank=>(
        <BoardColumn key={tank.id} tank={tank} activeId={activeId} setActiveId={setActiveId}
          catchFish={catchFish} toggleFishComplete={toggleFishComplete} addFishToTank={addFishToTank}
          cycleSpeed={cycleSpeed} setShareModal={setShareModal} setDelModal={setDelModal}
          renameTank={renameTank} moveTank={moveTank} tanks={tanks} leaveTank={leaveTank}/>
      ))}
      {tanks.length<MAX_TANKS&&(
        <div onClick={openNewTank} className="addc"
          style={{...boardColumn,alignItems:"center",justifyContent:"center",minHeight:120,cursor:"pointer",
            border:"1.5px dashed var(--brd,rgba(255,255,255,.05))",background:"var(--inp,rgba(255,255,255,.006))"}}>
          <div style={{fontSize:28,opacity:.13,marginBottom:2}}>+</div>
          <div style={{fontSize:10,opacity:.08,letterSpacing:2}}>ADD LIST</div>
        </div>
      )}
    </div>
  );
}
