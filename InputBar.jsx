import { IMP, DUR_PRESETS, todayStr } from "./constants.js";
import { tinyBtn } from "./styles.js";

export function DesktopInputBar({ input, setInput, addFish, actTank, newImp, setNewImp, newDur, setNewDur, newDue, setNewDue, setBulkModal }) {
  return(
    <div style={{padding:"6px 10px",background:"rgba(5,9,18,.96)",borderTop:"1px solid rgba(255,255,255,.03)",zIndex:15,flexShrink:0}}>
      <div style={{display:"flex",gap:6}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addFish()}
          placeholder={actTank?`Add fish to ${actTank.name}\u2026`:"Select a tank\u2026"}
          style={{flex:1,padding:"7px 12px",background:"rgba(255,255,255,.035)",border:"1px solid rgba(255,255,255,.06)",borderRadius:7,color:"#d0d8e4",fontSize:12,fontFamily:"inherit"}}/>
        <button onClick={addFish} style={{padding:"7px 14px",background:"linear-gradient(135deg,#4D96FF,#6BCB77)",border:"none",borderRadius:7,color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer",fontFamily:"inherit",letterSpacing:1}}>+ FISH</button>
        <button onClick={()=>setBulkModal(true)} title="Bulk add (paste list)" style={{padding:"7px 10px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:7,color:"#8898aa",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>{"\u2630"}</button>
      </div>
      <div style={{display:"flex",gap:4,marginTop:5,alignItems:"center",flexWrap:"wrap"}}>
        {Object.entries(IMP).map(([k,v])=>{const act=newImp===k;return(
          <button key={k} onClick={()=>setNewImp(k)} style={{padding:"3px 8px",fontSize:8,fontFamily:"inherit",cursor:"pointer",background:act?(v.color?v.color+"18":"rgba(255,255,255,.06)"):"rgba(255,255,255,.02)",border:`1px solid ${act?(v.color||"rgba(255,255,255,.15)")+"44":"rgba(255,255,255,.04)"}`,borderRadius:4,color:act?(v.color||"#d0d8e4"):"#556",fontWeight:act?700:400,transition:"all .1s"}}>{v.badge?v.badge+" ":""}{v.label}</button>);})}
        <div style={{width:1,height:14,background:"rgba(255,255,255,.04)",margin:"0 2px"}}/>
        {DUR_PRESETS.filter((_,i)=>i%2===0||i<4).map(d=>{const act=newDur===d.v;return(
          <button key={d.v} onClick={()=>setNewDur(act?"":d.v)} style={{padding:"3px 6px",fontSize:8,fontFamily:"inherit",cursor:"pointer",background:act?"rgba(77,150,255,.12)":"rgba(255,255,255,.02)",border:`1px solid ${act?"rgba(77,150,255,.3)":"rgba(255,255,255,.04)"}`,borderRadius:4,color:act?"#7bb8ff":"#556",fontWeight:act?700:400,transition:"all .1s"}}>{d.l}</button>);})}
        {newDur&&<button onClick={()=>setNewDur("")} style={{...tinyBtn,fontSize:8,color:"#888"}}>{"\u2715"}</button>}
        <div style={{width:1,height:14,background:"rgba(255,255,255,.04)",margin:"0 2px"}}/>
        <input type="date" value={newDue} min={todayStr()} onChange={e=>setNewDue(e.target.value)}
          style={{padding:"2px 6px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",borderRadius:4,color:"#d0d8e4",fontSize:9,fontFamily:"inherit",colorScheme:"dark"}}/>
        {newDue&&<button onClick={()=>setNewDue("")} style={{...tinyBtn,fontSize:8,color:"#888"}}>{"\u2715"}</button>}
      </div>
    </div>);
}

export function MobileInputBar({ input, setInput, addFish, actTank, newImp, setNewImp, newDur, setNewDur, newDue, setNewDue, setBulkModal, tanks, activeId, setActiveId, navTank }) {
  return(
    <div style={{background:"rgba(5,9,18,.96)",borderTop:"1px solid rgba(255,255,255,.03)",padding:"6px 10px 8px",flexShrink:0,zIndex:15}}>
      <div style={{display:"flex",gap:6,marginBottom:4}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addFish()}
          placeholder={actTank?`Add to ${actTank.name}\u2026`:"Select a tank\u2026"}
          style={{flex:1,padding:"8px 12px",background:"rgba(255,255,255,.035)",border:"1px solid rgba(255,255,255,.06)",borderRadius:8,color:"#d0d8e4",fontSize:12,fontFamily:"inherit"}}/>
        <button onClick={addFish} style={{padding:"8px 14px",background:"linear-gradient(135deg,#4D96FF,#6BCB77)",border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer",fontFamily:"inherit",letterSpacing:1}}>+</button>
        <button onClick={()=>setBulkModal(true)} title="Bulk add" style={{padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,color:"#8898aa",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>{"\u2630"}</button>
      </div>
      <div style={{display:"flex",gap:3,alignItems:"center",marginBottom:tanks.length>1?5:0,overflowX:"auto"}}>
        {Object.entries(IMP).map(([k,v])=>{const act=newImp===k;return(
          <button key={k} onClick={()=>setNewImp(k)} style={{padding:"3px 7px",fontSize:8,fontFamily:"inherit",cursor:"pointer",background:act?(v.color?v.color+"18":"rgba(255,255,255,.06)"):"rgba(255,255,255,.02)",border:`1px solid ${act?(v.color||"rgba(255,255,255,.15)")+"44":"rgba(255,255,255,.04)"}`,borderRadius:4,color:act?(v.color||"#d0d8e4"):"#556",fontWeight:act?700:400,flexShrink:0,transition:"all .1s"}}>{v.badge||"\u2022"}</button>);})}
        <div style={{width:1,height:12,background:"rgba(255,255,255,.04)",flexShrink:0}}/>
        {DUR_PRESETS.filter((_,i)=>i<5).map(d=>{const act=newDur===d.v;return(
          <button key={d.v} onClick={()=>setNewDur(act?"":d.v)} style={{padding:"3px 5px",fontSize:7,fontFamily:"inherit",cursor:"pointer",background:act?"rgba(77,150,255,.12)":"rgba(255,255,255,.02)",border:`1px solid ${act?"rgba(77,150,255,.3)":"rgba(255,255,255,.04)"}`,borderRadius:3,color:act?"#7bb8ff":"#556",fontWeight:act?700:400,flexShrink:0,transition:"all .1s"}}>{d.l}</button>);})}
        {newDur&&<button onClick={()=>setNewDur("")} style={{...tinyBtn,fontSize:7,color:"#888",flexShrink:0}}>{"\u2715"}</button>}
        <div style={{width:1,height:12,background:"rgba(255,255,255,.04)",flexShrink:0}}/>
        <input type="date" value={newDue} min={todayStr()} onChange={e=>setNewDue(e.target.value)}
          style={{padding:"2px 5px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",borderRadius:4,color:"#d0d8e4",fontSize:8,fontFamily:"inherit",colorScheme:"dark",flexShrink:0}}/>
        {newDue&&<button onClick={()=>setNewDue("")} style={{...tinyBtn,fontSize:7,color:"#888",flexShrink:0}}>{"\u2715"}</button>}
      </div>
      {tanks.length>1&&(()=>{
        const ci=tanks.findIndex(t=>t.id===activeId);const prev=ci>0?tanks[ci-1]:null;const next=ci<tanks.length-1?tanks[ci+1]:null;
        return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:4,padding:"2px 0"}}>
          <button onClick={()=>prev&&navTank(-1)} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 8px",background:prev?"rgba(77,150,255,.06)":"transparent",border:"1px solid "+(prev?"rgba(77,150,255,.15)":"transparent"),borderRadius:6,cursor:prev?"pointer":"default",opacity:prev?1:0.15,flex:1,justifyContent:"flex-start",fontFamily:"inherit",color:"#7bb8ff",fontSize:9,fontWeight:500,overflow:"hidden"}}>
            <span style={{fontSize:12,flexShrink:0}}>{"\u25C0"}</span>
            {prev&&<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{prev.name}</span>}
          </button>
          <div style={{display:"flex",gap:4,flexShrink:0}}>
            {tanks.map(t=>(<div key={t.id} onClick={()=>setActiveId(t.id)} style={{width:t.id===activeId?10:6,height:6,borderRadius:3,cursor:"pointer",background:t.id===activeId?"#4D96FF":"rgba(255,255,255,.12)",transition:"all .2s"}}/>))}
          </div>
          <button onClick={()=>next&&navTank(1)} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 8px",background:next?"rgba(77,150,255,.06)":"transparent",border:"1px solid "+(next?"rgba(77,150,255,.15)":"transparent"),borderRadius:6,cursor:next?"pointer":"default",opacity:next?1:0.15,flex:1,justifyContent:"flex-end",fontFamily:"inherit",color:"#7bb8ff",fontSize:9,fontWeight:500,overflow:"hidden"}}>
            {next&&<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{next.name}</span>}
            <span style={{fontSize:12,flexShrink:0}}>{"\u25B6"}</span>
          </button>
        </div>);
      })()}
    </div>);
}
