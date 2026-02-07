import { useState } from "react";
import FishSVG from "./FishSVG.jsx";
import { IMP, DUR_PRESETS, durLabel, todayStr, daysBetween, uid } from "./constants.js";
import { iconBtn, inputStyle, smBtnAlt, addItemBtn } from "./styles.js";

export function Section({title,count,total,children}){
  return(<div style={{marginBottom:12}}>
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
      <span style={{fontSize:8,fontWeight:700,letterSpacing:2,opacity:.3}}>{title}</span>
      {(total??count)>0&&<span style={{fontSize:8,opacity:.2}}>{total!=null?`${count}/${total}`:count}</span>}
    </div>{children}
  </div>);
}

function CaughtContent({ cData, fishActions }) {
  const { toggleComplete, updateCaughtFish, setFishImportance, releaseFish, removeFish, log } = fishActions;
  const [editField,setEditField]=useState(null);
  const [editVal,setEditVal]=useState("");
  const [addMode,setAddMode]=useState(null);
  const [addVals,setAddVals]=useState({});

  const td=todayStr();
  const dueLabel=d=>{if(!d)return null;const diff=daysBetween(td,d);if(diff<0)return{text:`${-diff}d overdue`,color:"#FF4757"};if(diff===0)return{text:"Due today",color:"#FFD93D"};if(diff===1)return{text:"Tomorrow",color:"#4D96FF"};return{text:`${diff}d left`,color:"#6BCB77"};};
  const dl=cData.completed?null:dueLabel(cData.dueDate);
  const isComp=!!cData.completed;

  const addCheck=text=>{if(!text.trim())return;updateCaughtFish(f=>{log("fish.checklist.add",{fishId:f.id,text:text.trim()});return{...f,checklist:[...(f.checklist||[]),{id:uid(),text:text.trim(),done:false}]};});};
  const toggleCheck=cid=>{updateCaughtFish(f=>{log("fish.checklist.toggle",{fishId:f.id,checkId:cid});return{...f,checklist:(f.checklist||[]).map(c=>c.id===cid?{...c,done:!c.done}:c)};});};
  const removeCheck=cid=>{updateCaughtFish(f=>{log("fish.checklist.remove",{fishId:f.id,checkId:cid});return{...f,checklist:(f.checklist||[]).filter(c=>c.id!==cid)};});};
  const addLink=(url,label)=>{if(!url.trim())return;updateCaughtFish(f=>{log("fish.link.add",{fishId:f.id,url:url.trim()});return{...f,links:[...(f.links||[]),{id:uid(),url:url.trim(),label:(label||url).trim()}]};});};
  const removeLink=lid=>{updateCaughtFish(f=>{log("fish.link.remove",{fishId:f.id,linkId:lid});return{...f,links:(f.links||[]).filter(l=>l.id!==lid)};});};
  const addAttach=(name,url)=>{if(!name.trim())return;updateCaughtFish(f=>{log("fish.attach.add",{fishId:f.id,name:name.trim()});return{...f,attachments:[...(f.attachments||[]),{id:uid(),name:name.trim(),url:url?.trim()||null}]};});};
  const removeAttach=aid=>{updateCaughtFish(f=>{log("fish.attach.remove",{fishId:f.id,attachId:aid});return{...f,attachments:(f.attachments||[]).filter(a=>a.id!==aid)};});};

  return(<div style={{flex:1,overflow:"auto",padding:"0 16px 16px"}}>

    {/* STATUS BANNER */}
    <div onClick={toggleComplete} style={{
      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
      padding:"10px 12px",margin:"6px 0 10px",borderRadius:8,cursor:"pointer",
      background:isComp?"rgba(46,213,115,.08)":"rgba(255,150,50,.06)",
      border:`1.5px solid ${isComp?"rgba(46,213,115,.25)":"rgba(255,150,50,.18)"}`,
      transition:"all .15s",
    }}>
      <div style={{width:22,height:22,borderRadius:6,
        border:`2px solid ${isComp?"#2ED573":"rgba(255,255,255,.2)"}`,
        background:isComp?"#2ED573":"transparent",
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
        transition:"all .15s"}}>
        {isComp&&<span style={{color:"#fff",fontSize:13,fontWeight:700}}>{"\u2713"}</span>}
      </div>
      <span style={{fontSize:12,fontWeight:700,letterSpacing:1.5,
        color:isComp?"#2ED573":"#e8a44a"}}>
        {isComp?"COMPLETE":"INCOMPLETE"}
      </span>
      <span style={{fontSize:8,opacity:.3,marginLeft:4}}>tap to change</span>
    </div>

    <div style={{display:"flex",justifyContent:"center",margin:"4px 0 8px",filter:`drop-shadow(0 0 8px ${cData.color}44)${isComp?" grayscale(.5)":""}`}}><FishSVG color={cData.color} size={50}/></div>
    {editField==="task"?(<div style={{display:"flex",gap:6,marginBottom:10}}>
      <input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"&&editVal.trim()){updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,task:editVal.trim()});return{...f,task:editVal.trim()};});setEditField(null);}if(e.key==="Escape")setEditField(null);}}
        style={inputStyle}/><button onClick={()=>{if(editVal.trim()){updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,task:editVal.trim()});return{...f,task:editVal.trim()};});setEditField(null);}}} style={smBtnAlt}>OK</button></div>
    ):(<div onClick={()=>{setEditField("task");setEditVal(cData.task);}}
      style={{fontSize:14,lineHeight:1.5,marginBottom:10,wordBreak:"break-word",color:isComp?"#7a9a82":"#eef1f5",cursor:"text",borderBottom:"1px dashed rgba(255,255,255,.06)",paddingBottom:6,textDecoration:isComp?"line-through":"none"}}>
      {cData.task} <span style={{fontSize:9,opacity:.2}}>{"\u270F"}</span></div>)}

    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:9,opacity:.35}}>DUE</span>
        <input type="date" value={cData.dueDate||""} min={td}
          onChange={e=>{const v=e.target.value||null;updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,dueDate:v});return{...f,dueDate:v};});}}
          style={{padding:"4px 6px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:5,color:"#d0d8e4",fontSize:10,fontFamily:"inherit",colorScheme:"dark"}}/>
        {cData.dueDate&&<button onClick={()=>{updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,dueDate:null});return{...f,dueDate:null};});}} style={{...iconBtn,fontSize:9,padding:"2px 5px"}}>{"\u2715"}</button>}
      </div>
      {dl&&<span style={{fontSize:9,color:dl.color,fontWeight:600}}>{dl.text}</span>}
    </div>

    <div style={{display:"flex",gap:4,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
      <span style={{fontSize:9,opacity:.35,marginRight:2}}>TIME</span>
      {DUR_PRESETS.map(d=>{const act=(cData.duration||"")===d.v;return(
        <button key={d.v} onClick={()=>{updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,duration:act?null:d.v});return{...f,duration:act?null:d.v};});}}
          style={{padding:"3px 7px",fontSize:8,fontFamily:"inherit",cursor:"pointer",
            background:act?"rgba(77,150,255,.15)":"rgba(255,255,255,.02)",
            border:`1px solid ${act?"rgba(77,150,255,.35)":"rgba(255,255,255,.04)"}`,
            borderRadius:4,color:act?"#7bb8ff":"#556",fontWeight:act?700:400,transition:"all .1s"}}>{d.l}</button>);})}
      {cData.duration&&<button onClick={()=>{updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,duration:null});return{...f,duration:null};});}} style={{...iconBtn,fontSize:9,padding:"2px 5px",opacity:.4}}>{"\u2715"}</button>}
    </div>

    <div style={{display:"flex",gap:4,marginBottom:14}}>
      {Object.entries(IMP).map(([k,v])=>{const act=(cData.importance||"normal")===k;
        return <button key={k} onClick={()=>setFishImportance(k)} style={{flex:1,padding:"7px 2px",fontSize:9,fontFamily:"inherit",cursor:"pointer",background:act?(v.color?v.color+"18":"rgba(255,255,255,.06)"):"rgba(255,255,255,.02)",border:`1px solid ${act?(v.color||"rgba(255,255,255,.15)")+"44":"rgba(255,255,255,.04)"}`,borderRadius:6,color:act?(v.color||"#d0d8e4"):"#556",fontWeight:act?700:400,transition:"all .1s"}}>{v.badge?v.badge+" ":""}{v.label}</button>;})}
    </div>

    <Section title="CHECKLIST" count={(cData.checklist||[]).filter(c=>c.done).length} total={(cData.checklist||[]).length}>
      {(cData.checklist||[]).map(c=>(<div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.02)"}}>
        <div onClick={()=>toggleCheck(c.id)} style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${c.done?"#2ED573":"rgba(255,255,255,.15)"}`,background:c.done?"#2ED57322":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,fontSize:10,color:"#2ED573"}}>{c.done&&"\u2713"}</div>
        <span style={{flex:1,fontSize:11,textDecoration:c.done?"line-through":"none",opacity:c.done?.35:.8,wordBreak:"break-word"}}>{c.text}</span>
        <button onClick={()=>removeCheck(c.id)} style={{...iconBtn,fontSize:9,padding:"2px 5px",opacity:.3}}>{"\u2715"}</button></div>))}
      {addMode==="check"?(<div style={{display:"flex",gap:5,marginTop:6}}>
        <input autoFocus placeholder="Item\u2026" value={addVals.check||""} onChange={e=>setAddVals(p=>({...p,check:e.target.value}))}
          onKeyDown={e=>{if(e.key==="Enter"){addCheck(addVals.check||"");setAddVals(p=>({...p,check:""}));}if(e.key==="Escape")setAddMode(null);}} style={inputStyle}/>
        <button onClick={()=>{addCheck(addVals.check||"");setAddVals(p=>({...p,check:""}));}} style={smBtnAlt}>+</button></div>
      ):(<button onClick={()=>{setAddMode("check");setAddVals(p=>({...p,check:""}));}} style={addItemBtn}>+ Add item</button>)}
    </Section>

    <Section title="LINKS" count={(cData.links||[]).length}>
      {(cData.links||[]).map(l=>(<div key={l.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.02)"}}>
        <span style={{fontSize:11,opacity:.3,flexShrink:0}}>{"\uD83D\uDD17"}</span>
        <a href={l.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{flex:1,fontSize:10,color:"#4D96FF",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}}>{l.label||l.url}</a>
        <button onClick={()=>removeLink(l.id)} style={{...iconBtn,fontSize:9,padding:"2px 5px",opacity:.3}}>{"\u2715"}</button></div>))}
      {addMode==="link"?(<div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>
        <input autoFocus placeholder="URL\u2026" value={addVals.linkUrl||""} onChange={e=>setAddVals(p=>({...p,linkUrl:e.target.value}))} onKeyDown={e=>{if(e.key==="Escape")setAddMode(null);}} style={inputStyle}/>
        <div style={{display:"flex",gap:4}}>
          <input placeholder="Label (optional)" value={addVals.linkLabel||""} onChange={e=>setAddVals(p=>({...p,linkLabel:e.target.value}))}
            onKeyDown={e=>{if(e.key==="Enter"){addLink(addVals.linkUrl||"",addVals.linkLabel);setAddVals(p=>({...p,linkUrl:"",linkLabel:""}));setAddMode(null);}}} style={inputStyle}/>
          <button onClick={()=>{addLink(addVals.linkUrl||"",addVals.linkLabel);setAddVals(p=>({...p,linkUrl:"",linkLabel:""}));setAddMode(null);}} style={smBtnAlt}>+</button></div></div>
      ):(<button onClick={()=>{setAddMode("link");setAddVals(p=>({...p,linkUrl:"",linkLabel:""}));}} style={addItemBtn}>+ Add link</button>)}
    </Section>

    <Section title="ATTACHMENTS" count={(cData.attachments||[]).length}>
      {(cData.attachments||[]).map(a=>(<div key={a.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.02)"}}>
        <span style={{fontSize:11,opacity:.3,flexShrink:0}}>{"\uD83D\uDCCE"}</span>
        {a.url?(<a href={a.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{flex:1,fontSize:10,color:"#4D96FF",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}}>{a.name}</a>
        ):(<span style={{flex:1,fontSize:10,opacity:.6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</span>)}
        <button onClick={()=>removeAttach(a.id)} style={{...iconBtn,fontSize:9,padding:"2px 5px",opacity:.3}}>{"\u2715"}</button></div>))}
      {addMode==="attach"?(<div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>
        <input autoFocus placeholder="Name\u2026" value={addVals.attName||""} onChange={e=>setAddVals(p=>({...p,attName:e.target.value}))} onKeyDown={e=>{if(e.key==="Escape")setAddMode(null);}} style={inputStyle}/>
        <div style={{display:"flex",gap:4}}>
          <input placeholder="Link (optional)" value={addVals.attUrl||""} onChange={e=>setAddVals(p=>({...p,attUrl:e.target.value}))}
            onKeyDown={e=>{if(e.key==="Enter"){addAttach(addVals.attName||"",addVals.attUrl);setAddVals({});setAddMode(null);}}} style={inputStyle}/>
          <button onClick={()=>{addAttach(addVals.attName||"",addVals.attUrl);setAddVals({});setAddMode(null);}} style={smBtnAlt}>+</button></div></div>
      ):(<button onClick={()=>{setAddMode("attach");setAddVals({});}} style={addItemBtn}>+ Add attachment</button>)}
    </Section>

    <div style={{display:"flex",gap:8,marginTop:16,paddingBottom:8}}>
      <button onClick={releaseFish} style={{flex:1,padding:"12px 0",background:"linear-gradient(135deg,#4D96FF,#3a7bd5)",border:"none",borderRadius:8,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"inherit",letterSpacing:1}}>{"\u21A9"} RELEASE</button>
    </div>
    <button onClick={removeFish} style={{width:"100%",padding:"8px 0",background:"transparent",border:"1px solid rgba(255,70,70,.1)",borderRadius:6,color:"#884444",cursor:"pointer",fontSize:9,fontFamily:"inherit",letterSpacing:1.5,marginTop:4,marginBottom:4,opacity:.6,transition:"opacity .15s"}}
      onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.6}>{"\uD83D\uDDD1"} REMOVE FROM TANK</button>
  </div>);
}

export default function CaughtPanel({ cData, nukeId, isMobile, fishActions, releaseFish }) {
  if(!cData||nukeId)return null;
  return(<>
    <div onClick={releaseFish} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.4)",zIndex:28}}/>
    {isMobile?(
      <div style={{position:"absolute",bottom:0,left:0,right:0,maxHeight:"78vh",background:"rgba(8,12,24,.97)",borderRadius:"16px 16px 0 0",zIndex:30,display:"flex",flexDirection:"column",boxShadow:"0 -8px 40px rgba(0,0,0,.5)",animation:"slideUp .25s ease-out",backdropFilter:"blur(10px)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"8px 0 4px"}}><div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,.1)"}}/></div>
        <CaughtContent cData={cData} fishActions={fishActions}/>
      </div>
    ):(
      <div style={{position:"absolute",top:0,right:0,bottom:0,width:"min(340px, 35vw)",background:"rgba(8,12,24,.97)",zIndex:30,display:"flex",flexDirection:"column",boxShadow:"-8px 0 40px rgba(0,0,0,.5)",animation:"fadeIn .2s ease-out",backdropFilter:"blur(10px)",borderLeft:"1px solid rgba(255,255,255,.04)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
          <span style={{fontSize:9,opacity:.3,letterSpacing:3}}>{"\uD83C\uDFA3"} CAUGHT</span>
          <button onClick={releaseFish} style={{...iconBtn,fontSize:10}}>{"\u2715"}</button>
        </div>
        <CaughtContent cData={cData} fishActions={fishActions}/>
      </div>
    )}
  </>);
}
