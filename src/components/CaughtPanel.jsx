import { useState, useRef, useEffect } from "react";
import FishSVG from "./FishSVG.jsx";
import { IMP, DUR_PRESETS, durLabel, todayStr, daysBetween, fmtDate, uid, MAX_FILE_SIZE } from "../constants.js";
import { iconBtn, inputStyle, smBtnAlt, addItemBtn } from "../styles.js";
import { getFile } from "../sync/fileStore.js";

export function Section({title,count,total,children}){
  return(<div style={{marginBottom:12}}>
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
      <span style={{fontSize:8,fontWeight:700,letterSpacing:2,opacity:.3}}>{title}</span>
      {(total??count)>0&&<span style={{fontSize:8,opacity:.2}}>{total!=null?`${count}/${total}`:count}</span>}
    </div>{children}
  </div>);
}

function fmtSize(bytes){if(!bytes)return"";if(bytes<1024)return bytes+"B";if(bytes<1048576)return(bytes/1024).toFixed(1)+"KB";return(bytes/1048576).toFixed(1)+"MB";}
function fileIcon(mime){if(!mime)return"\uD83D\uDCCE";if(mime.startsWith("image/"))return"\uD83D\uDDBC\uFE0F";if(mime.startsWith("video/"))return"\uD83C\uDFA5";if(mime.startsWith("audio/"))return"\uD83C\uDFB5";if(mime.includes("pdf"))return"\uD83D\uDCC4";if(mime.includes("zip")||mime.includes("tar")||mime.includes("rar"))return"\uD83D\uDCE6";return"\uD83D\uDCCE";}

function CoverImage({attachments}){
  const [url,setUrl]=useState(null);
  const img=(attachments||[]).find(a=>a.mimeType?.startsWith("image/")&&a.hasLocalBlob&&a.fileId);
  useEffect(()=>{
    if(!img)return;
    let revoke=null;
    getFile(img.fileId).then(rec=>{
      if(rec?.blob){const u=URL.createObjectURL(rec.blob);setUrl(u);revoke=u;}
    }).catch(()=>{});
    return()=>{if(revoke)URL.revokeObjectURL(revoke);};
  },[img?.fileId]);
  if(!url)return null;
  return(<div style={{width:"100%",height:160,overflow:"hidden",borderRadius:"12px 12px 0 0",flexShrink:0}}>
    <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
  </div>);
}

function AttachmentThumb({att}){
  const [url,setUrl]=useState(null);
  useEffect(()=>{
    if(!att.mimeType?.startsWith("image/")||!att.hasLocalBlob||!att.fileId)return;
    let revoke=null;
    getFile(att.fileId).then(rec=>{
      if(rec?.blob){const u=URL.createObjectURL(rec.blob);setUrl(u);revoke=u;}
    }).catch(()=>{});
    return()=>{if(revoke)URL.revokeObjectURL(revoke);};
  },[att.fileId]);
  if(!url)return null;
  return <img src={url} alt="" style={{width:48,height:48,objectFit:"cover",borderRadius:4,flexShrink:0}}/>;
}

function ChecklistProgressBar({checklist}){
  const cl=checklist||[];
  if(cl.length===0)return null;
  const done=cl.filter(c=>c.done).length;
  const pct=Math.round((done/cl.length)*100);
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
      <span style={{fontSize:9,opacity:.4,flexShrink:0}}>{pct}%</span>
      <div style={{flex:1,height:4,borderRadius:2,background:"var(--brd,rgba(255,255,255,.06))",overflow:"hidden"}}>
        <div style={{height:"100%",borderRadius:2,background:"#2ED573",width:`${pct}%`,transition:"width .3s ease"}}/>
      </div>
      <span style={{fontSize:8,opacity:.3,flexShrink:0}}>{done}/{cl.length}</span>
    </div>
  );
}

function CaughtContent({ cData, fishActions, isReadonly, fileTransferStatus, onAttachFile, onRequestFile, tankId, isMobile }) {
  const { toggleComplete, updateCaughtFish, setFishImportance, releaseFish, removeFish, log } = fishActions;
  const [editField,setEditField]=useState(null);
  const [editVal,setEditVal]=useState("");
  const [descEdit,setDescEdit]=useState(false);
  const [descVal,setDescVal]=useState("");
  const [addMode,setAddMode]=useState(null);
  const [addVals,setAddVals]=useState({});
  const [dragOver,setDragOver]=useState(false);
  const [fileError,setFileError]=useState("");
  const fileInputRef=useRef(null);

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

  const saveDesc=()=>{updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,description:descVal});return{...f,description:descVal};});setDescEdit(false);};

  // Sidebar content (desktop: right column, mobile: inline)
  const sidebarContent=(<>
    {/* Status toggle */}
    {isReadonly?(
      <div style={{padding:"8px 10px",marginBottom:8,borderRadius:6,
        background:"rgba(77,150,255,.06)",border:"1px solid rgba(77,150,255,.15)",textAlign:"center"}}>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:2,color:"#4D96FF"}}>VIEW ONLY</span>
      </div>
    ):(
      <div onClick={toggleComplete} style={{display:"flex",alignItems:"center",gap:6,
        padding:"8px 10px",marginBottom:8,borderRadius:6,cursor:"pointer",
        background:isComp?"rgba(46,213,115,.08)":"rgba(255,150,50,.06)",
        border:`1px solid ${isComp?"rgba(46,213,115,.2)":"rgba(255,150,50,.15)"}`,
        transition:"all .15s"}}>
        <div style={{width:16,height:16,borderRadius:4,
          border:`1.5px solid ${isComp?"#2ED573":"rgba(255,255,255,.2)"}`,
          background:isComp?"#2ED573":"transparent",
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
          fontSize:9,color:"#fff"}}>{isComp&&"\u2713"}</div>
        <span style={{fontSize:10,fontWeight:600,color:isComp?"#2ED573":"#e8a44a"}}>
          {isComp?"Complete":"Incomplete"}</span>
      </div>
    )}

    {/* Importance */}
    {!isReadonly?(
      <div style={{marginBottom:10}}>
        <div style={{fontSize:8,opacity:.3,letterSpacing:1.5,fontWeight:700,marginBottom:4}}>PRIORITY</div>
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {Object.entries(IMP).map(([k,v])=>{const act=(cData.importance||"normal")===k;
            return <button key={k} onClick={()=>setFishImportance(k)} style={{padding:"5px 8px",fontSize:9,fontFamily:"inherit",cursor:"pointer",textAlign:"left",
              background:act?(v.color?v.color+"18":"var(--inp,rgba(255,255,255,.06))"):"transparent",
              border:`1px solid ${act?(v.color||"var(--brd3)")+"44":"var(--brd,rgba(255,255,255,.04))"}`,
              borderRadius:5,color:act?(v.color||"var(--tx,#d0d8e4)"):"var(--tx3,#556)",fontWeight:act?700:400,transition:"all .1s"}}>{v.badge?v.badge+" ":""}{v.label}</button>;})}
        </div>
      </div>
    ):(
      <div style={{marginBottom:10}}>
        <div style={{fontSize:8,opacity:.3,letterSpacing:1.5,fontWeight:700,marginBottom:4}}>PRIORITY</div>
        <span style={{fontSize:10,color:IMP[cData.importance||"normal"].color||"var(--tx)"}}>{IMP[cData.importance||"normal"].badge||""} {IMP[cData.importance||"normal"].label}</span>
      </div>
    )}

    {/* Due date */}
    <div style={{marginBottom:10}}>
      <div style={{fontSize:8,opacity:.3,letterSpacing:1.5,fontWeight:700,marginBottom:4}}>DUE DATE</div>
      {!isReadonly?(
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <input type="date" value={cData.dueDate||""} min={td}
            onChange={e=>{const v=e.target.value||null;updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,dueDate:v});return{...f,dueDate:v};});}}
            style={{flex:1,padding:"4px 5px",background:"var(--inp,rgba(255,255,255,.04))",border:"1px solid var(--brd,rgba(255,255,255,.08))",borderRadius:4,color:"var(--tx,#d0d8e4)",fontSize:9,fontFamily:"inherit",colorScheme:"inherit",minWidth:0}}/>
          {cData.dueDate&&<button onClick={()=>{updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,dueDate:null});return{...f,dueDate:null};});}} style={{...iconBtn,fontSize:8,padding:"2px 4px"}}>{"\u2715"}</button>}
        </div>
      ):(
        cData.dueDate?<span style={{fontSize:10,color:"var(--tx,#d0d8e4)"}}>{fmtDate(cData.dueDate)}</span>
        :<span style={{fontSize:9,opacity:.25}}>None</span>
      )}
      {dl&&<div style={{fontSize:9,color:dl.color,fontWeight:600,marginTop:3}}>{dl.text}</div>}
    </div>

    {/* Duration */}
    <div style={{marginBottom:10}}>
      <div style={{fontSize:8,opacity:.3,letterSpacing:1.5,fontWeight:700,marginBottom:4}}>DURATION</div>
      {!isReadonly?(
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          {DUR_PRESETS.map(d=>{const act=(cData.duration||"")===d.v;return(
            <button key={d.v} onClick={()=>{updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,duration:act?null:d.v});return{...f,duration:act?null:d.v};});}}
              style={{padding:"3px 6px",fontSize:8,fontFamily:"inherit",cursor:"pointer",
                background:act?"rgba(77,150,255,.15)":"var(--inp,rgba(255,255,255,.02))",
                border:`1px solid ${act?"rgba(77,150,255,.35)":"var(--brd,rgba(255,255,255,.04))"}`,
                borderRadius:3,color:act?"#7bb8ff":"var(--tx3,#556)",fontWeight:act?700:400}}>{d.l}</button>);})}
        </div>
      ):(
        cData.duration?<span style={{fontSize:10,color:"#7bb8ff"}}>{durLabel(cData.duration)}</span>
        :<span style={{fontSize:9,opacity:.25}}>None</span>
      )}
    </div>

    {/* Separator + actions */}
    <div style={{borderTop:"1px solid var(--brd,rgba(255,255,255,.06))",paddingTop:10,marginTop:6}}>
      <button onClick={releaseFish} style={{width:"100%",padding:"8px 0",background:"linear-gradient(135deg,#4D96FF,#3a7bd5)",border:"none",borderRadius:6,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:10,fontFamily:"inherit",letterSpacing:1,marginBottom:6}}>{"\u21A9"} Release</button>
      {!isReadonly&&<button onClick={removeFish} style={{width:"100%",padding:"6px 0",background:"transparent",border:"1px solid rgba(255,70,70,.1)",borderRadius:5,color:"#884444",cursor:"pointer",fontSize:8,fontFamily:"inherit",letterSpacing:1.5,opacity:.6,transition:"opacity .15s"}}
        onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.6}>{"\uD83D\uDDD1"} Remove</button>}
    </div>
  </>);

  // Main content (left column on desktop)
  const mainContent=(<>
    {/* Description */}
    <div style={{marginBottom:14}}>
      <div style={{fontSize:8,fontWeight:700,letterSpacing:2,opacity:.3,marginBottom:6}}>DESCRIPTION</div>
      {!isReadonly&&descEdit?(
        <div>
          <textarea autoFocus value={descVal} onChange={e=>setDescVal(e.target.value)}
            onKeyDown={e=>{if(e.key==="Escape"){setDescEdit(false);}}}
            onBlur={saveDesc}
            placeholder="Add a description..."
            style={{width:"100%",minHeight:60,padding:"8px",background:"var(--inp,rgba(255,255,255,.04))",
              border:"1px solid rgba(77,150,255,.3)",borderRadius:6,color:"var(--tx,#d0d8e4)",
              fontSize:11,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",lineHeight:1.5}}/>
        </div>
      ):(
        <div onClick={()=>{if(!isReadonly){setDescEdit(true);setDescVal(cData.description||"");}}}
          style={{fontSize:11,lineHeight:1.6,color:(cData.description)?"var(--tx,#d0d8e4)":"var(--tx3,#556)",
            cursor:isReadonly?"default":"text",padding:"6px 8px",borderRadius:6,
            background:cData.description?"transparent":"var(--inp,rgba(255,255,255,.02))",
            border:"1px solid transparent",minHeight:32,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
          {cData.description||(!isReadonly?"Add a description...":"No description")}
          {!isReadonly&&!cData.description&&<span style={{fontSize:9,opacity:.3,marginLeft:4}}>{"\u270F"}</span>}
        </div>
      )}
    </div>

    {/* Checklist */}
    <Section title="CHECKLIST" count={(cData.checklist||[]).filter(c=>c.done).length} total={(cData.checklist||[]).length}>
      <ChecklistProgressBar checklist={cData.checklist}/>
      {(cData.checklist||[]).map(c=>(<div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--brd2,rgba(255,255,255,.02))"}}>
        <div onClick={()=>{if(!isReadonly)toggleCheck(c.id);}} style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${c.done?"#2ED573":"rgba(255,255,255,.15)"}`,background:c.done?"#2ED57322":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:isReadonly?"default":"pointer",flexShrink:0,fontSize:10,color:"#2ED573"}}>{c.done&&"\u2713"}</div>
        <span style={{flex:1,fontSize:11,textDecoration:c.done?"line-through":"none",opacity:c.done?.35:.8,wordBreak:"break-word"}}>{c.text}</span>
        {!isReadonly&&<button onClick={()=>removeCheck(c.id)} style={{...iconBtn,fontSize:9,padding:"2px 5px",opacity:.3}}>{"\u2715"}</button>}</div>))}
      {!isReadonly&&(addMode==="check"?(<div style={{display:"flex",gap:5,marginTop:6}}>
        <input autoFocus placeholder="Item\u2026" value={addVals.check||""} onChange={e=>setAddVals(p=>({...p,check:e.target.value}))}
          onKeyDown={e=>{if(e.key==="Enter"){addCheck(addVals.check||"");setAddVals(p=>({...p,check:""}));}if(e.key==="Escape")setAddMode(null);}} style={inputStyle}/>
        <button onClick={()=>{addCheck(addVals.check||"");setAddVals(p=>({...p,check:""}));}} style={smBtnAlt}>+</button></div>
      ):(<button onClick={()=>{setAddMode("check");setAddVals(p=>({...p,check:""}));}} style={addItemBtn}>+ Add item</button>))}
    </Section>

    {/* Links */}
    <Section title="LINKS" count={(cData.links||[]).length}>
      {(cData.links||[]).map(l=>(<div key={l.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid var(--brd2,rgba(255,255,255,.02))"}}>
        <span style={{fontSize:11,opacity:.3,flexShrink:0}}>{"\uD83D\uDD17"}</span>
        <a href={l.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{flex:1,fontSize:10,color:"#4D96FF",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}}>{l.label||l.url}</a>
        {!isReadonly&&<button onClick={()=>removeLink(l.id)} style={{...iconBtn,fontSize:9,padding:"2px 5px",opacity:.3}}>{"\u2715"}</button>}</div>))}
      {!isReadonly&&(addMode==="link"?(<div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>
        <input autoFocus placeholder="URL\u2026" value={addVals.linkUrl||""} onChange={e=>setAddVals(p=>({...p,linkUrl:e.target.value}))} onKeyDown={e=>{if(e.key==="Escape")setAddMode(null);}} style={inputStyle}/>
        <div style={{display:"flex",gap:4}}>
          <input placeholder="Label (optional)" value={addVals.linkLabel||""} onChange={e=>setAddVals(p=>({...p,linkLabel:e.target.value}))}
            onKeyDown={e=>{if(e.key==="Enter"){addLink(addVals.linkUrl||"",addVals.linkLabel);setAddVals(p=>({...p,linkUrl:"",linkLabel:""}));setAddMode(null);}}} style={inputStyle}/>
          <button onClick={()=>{addLink(addVals.linkUrl||"",addVals.linkLabel);setAddVals(p=>({...p,linkUrl:"",linkLabel:""}));setAddMode(null);}} style={smBtnAlt}>+</button></div></div>
      ):(<button onClick={()=>{setAddMode("link");setAddVals(p=>({...p,linkUrl:"",linkLabel:""}));}} style={addItemBtn}>+ Add link</button>))}
    </Section>

    {/* Attachments */}
    <Section title="ATTACHMENTS" count={(cData.attachments||[]).length}>
      {!isReadonly&&<div
        onDragOver={e=>{e.preventDefault();e.stopPropagation();setDragOver(true);}}
        onDragLeave={e=>{e.preventDefault();setDragOver(false);}}
        onDrop={e=>{e.preventDefault();setDragOver(false);setFileError("");
          const file=e.dataTransfer.files?.[0];if(!file)return;
          if(file.size>MAX_FILE_SIZE){setFileError("File too large (max 50MB)");return;}
          onAttachFile?.(file);}}
        style={{padding:"10px 8px",marginBottom:6,borderRadius:6,border:`1.5px dashed ${dragOver?"rgba(77,150,255,.5)":"var(--brd,rgba(255,255,255,.06))"}`,background:dragOver?"rgba(77,150,255,.06)":"transparent",textAlign:"center",cursor:"pointer",transition:"all .15s"}}
        onClick={()=>fileInputRef.current?.click()}>
        <input ref={fileInputRef} type="file" style={{display:"none"}} onChange={e=>{setFileError("");const file=e.target.files?.[0];if(!file)return;
          if(file.size>MAX_FILE_SIZE){setFileError("File too large (max 50MB)");return;}
          onAttachFile?.(file);e.target.value="";}}/>
        <div style={{fontSize:9,opacity:.3}}>{"\uD83D\uDCCE"} Drop file or click to attach</div>
      </div>}
      {fileError&&<div style={{fontSize:9,color:"#FF4757",marginBottom:4}}>{"\u26A0"} {fileError}</div>}

      {/* Image thumbnails row */}
      {(()=>{const imgs=(cData.attachments||[]).filter(a=>a.mimeType?.startsWith("image/")&&a.hasLocalBlob);
        if(imgs.length===0)return null;
        return(<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {imgs.map(a=><AttachmentThumb key={a.id} att={a}/>)}
        </div>);
      })()}

      {(cData.attachments||[]).map(a=>{
        const transfer=fileTransferStatus?.[a.fileId];
        const isFile=!!a.fileId;
        const hasBlob=!!a.hasLocalBlob;
        const isTransferring=!!transfer;
        return(<div key={a.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0",borderBottom:"1px solid var(--brd2,rgba(255,255,255,.02))"}}>
          <span style={{fontSize:11,flexShrink:0}}>{isFile?fileIcon(a.mimeType):"\uD83D\uDD17"}</span>
          <div style={{flex:1,minWidth:0}}>
            {a.url&&!a.fileId?(<a href={a.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:"#4D96FF",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block",cursor:"pointer"}}>{a.name}</a>
            ):(<span style={{fontSize:10,color:"var(--tx,#d0d8e4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>{a.name}</span>)}
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:1}}>
              {a.size>0&&<span style={{fontSize:7,opacity:.3}}>{fmtSize(a.size)}</span>}
              {isFile&&hasBlob&&<span style={{fontSize:7,color:"#2ED573"}}>{"\u2713"} Local</span>}
              {isFile&&!hasBlob&&!isTransferring&&<span style={{fontSize:7,color:"#FFD93D"}}>{"\u2601"} Peer required</span>}
              {isTransferring&&<div style={{flex:1,maxWidth:80,height:3,borderRadius:2,background:"var(--brd,rgba(255,255,255,.06))",overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:2,background:"#4D96FF",width:`${(transfer.progress||0)*100}%`,transition:"width .2s"}}/>
              </div>}
            </div>
          </div>
          {isFile&&hasBlob&&<button onClick={async(e)=>{e.stopPropagation();const rec=await getFile(a.fileId);if(rec?.blob){const url=URL.createObjectURL(rec.blob);window.open(url,"_blank");setTimeout(()=>URL.revokeObjectURL(url),60000);}}} style={{...iconBtn,fontSize:9,padding:"2px 5px",color:"#4D96FF"}} title="Download">{"\u2B07"}</button>}
          {isFile&&!hasBlob&&!isTransferring&&<button onClick={()=>onRequestFile?.(a.fileId,cData.id,tankId)} disabled={!onRequestFile} style={{...iconBtn,fontSize:8,padding:"2px 5px",opacity:.4}} title="Request from peer">{"\u2B07"}</button>}
          {!isReadonly&&<button onClick={()=>removeAttach(a.id)} style={{...iconBtn,fontSize:9,padding:"2px 5px",opacity:.3}}>{"\u2715"}</button>}
        </div>);})}

      {!isReadonly&&(addMode==="attach"?(<div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>
        <input autoFocus placeholder="Name\u2026" value={addVals.attName||""} onChange={e=>setAddVals(p=>({...p,attName:e.target.value}))} onKeyDown={e=>{if(e.key==="Escape")setAddMode(null);}} style={inputStyle}/>
        <div style={{display:"flex",gap:4}}>
          <input placeholder="Link (optional)" value={addVals.attUrl||""} onChange={e=>setAddVals(p=>({...p,attUrl:e.target.value}))}
            onKeyDown={e=>{if(e.key==="Enter"){addAttach(addVals.attName||"",addVals.attUrl);setAddVals({});setAddMode(null);}}} style={inputStyle}/>
          <button onClick={()=>{addAttach(addVals.attName||"",addVals.attUrl);setAddVals({});setAddMode(null);}} style={smBtnAlt}>+</button></div></div>
      ):(<button onClick={()=>{setAddMode("attach");setAddVals({});}} style={{...addItemBtn,fontSize:8,opacity:.4}}>{"\uD83D\uDD17"} Add link attachment</button>))}
    </Section>
  </>);

  if(isMobile){
    // Mobile: single column, all stacked
    return(<div style={{flex:1,overflow:"auto",padding:"0 16px 16px"}}>
      {/* Fish icon + title */}
      <div style={{display:"flex",alignItems:"center",gap:10,margin:"8px 0 10px"}}>
        <div style={{filter:`drop-shadow(0 0 6px ${cData.color}44)${isComp?" grayscale(.5)":""}`,flexShrink:0}}><FishSVG color={cData.color} size={36}/></div>
        {!isReadonly&&editField==="task"?(<div style={{flex:1,display:"flex",gap:6}}>
          <input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&editVal.trim()){updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,task:editVal.trim()});return{...f,task:editVal.trim()};});setEditField(null);}if(e.key==="Escape")setEditField(null);}}
            style={inputStyle}/><button onClick={()=>{if(editVal.trim()){updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,task:editVal.trim()});return{...f,task:editVal.trim()};});setEditField(null);}}} style={smBtnAlt}>OK</button></div>
        ):(<div onClick={()=>{if(!isReadonly){setEditField("task");setEditVal(cData.task);}}} style={{flex:1,fontSize:14,lineHeight:1.4,wordBreak:"break-word",color:isComp?"#7a9a82":"var(--tx,#eef1f5)",cursor:isReadonly?"default":"text",textDecoration:isComp?"line-through":"none"}}>
          {cData.task} {!isReadonly&&<span style={{fontSize:9,opacity:.2}}>{"\u270F"}</span>}</div>)}
      </div>
      {sidebarContent}
      {mainContent}
    </div>);
  }

  // Desktop: two columns
  return(<div style={{flex:1,overflow:"auto",display:"flex",gap:16,padding:"0 20px 20px",minHeight:0}}>
    {/* Left: main content */}
    <div style={{flex:1,minWidth:0,overflow:"auto"}}>
      {/* Fish icon + title */}
      <div style={{display:"flex",alignItems:"center",gap:10,margin:"4px 0 12px"}}>
        <div style={{filter:`drop-shadow(0 0 6px ${cData.color}44)${isComp?" grayscale(.5)":""}`,flexShrink:0}}><FishSVG color={cData.color} size={40}/></div>
        {!isReadonly&&editField==="task"?(<div style={{flex:1,display:"flex",gap:6}}>
          <input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&editVal.trim()){updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,task:editVal.trim()});return{...f,task:editVal.trim()};});setEditField(null);}if(e.key==="Escape")setEditField(null);}}
            style={inputStyle}/><button onClick={()=>{if(editVal.trim()){updateCaughtFish(f=>{log("fish.edit",{fishId:f.id,task:editVal.trim()});return{...f,task:editVal.trim()};});setEditField(null);}}} style={smBtnAlt}>OK</button></div>
        ):(<div onClick={()=>{if(!isReadonly){setEditField("task");setEditVal(cData.task);}}} style={{flex:1,fontSize:16,lineHeight:1.4,wordBreak:"break-word",color:isComp?"#7a9a82":"var(--tx,#eef1f5)",cursor:isReadonly?"default":"text",textDecoration:isComp?"line-through":"none"}}>
          {cData.task} {!isReadonly&&<span style={{fontSize:9,opacity:.2}}>{"\u270F"}</span>}</div>)}
      </div>
      {mainContent}
    </div>
    {/* Right sidebar */}
    <div style={{width:150,flexShrink:0}}>
      {sidebarContent}
    </div>
  </div>);
}

export default function CaughtPanel({ cData, nukeId, isMobile, fishActions, releaseFish, isReadonly, fileTransferStatus, onAttachFile, onRequestFile, tankId }) {
  if(!cData||nukeId)return null;
  return(<>
    <div onClick={releaseFish} style={{position:"absolute",inset:0,background:"var(--ovl,rgba(0,0,0,.4))",zIndex:28}}/>
    {isMobile?(
      <div style={{position:"absolute",bottom:0,left:0,right:0,maxHeight:"85vh",background:"var(--surf,rgba(8,12,24,.97))",borderRadius:"16px 16px 0 0",zIndex:30,display:"flex",flexDirection:"column",boxShadow:"0 -8px 40px rgba(0,0,0,.5)",animation:"slideUp .25s ease-out",backdropFilter:"blur(10px)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px 4px",flexShrink:0}}>
          <div style={{width:36,height:4,borderRadius:2,background:"var(--brd3,rgba(255,255,255,.1))"}}/>
          <button onClick={releaseFish} style={{...iconBtn,fontSize:10,padding:"4px 8px"}}>{"\u2715"}</button>
        </div>
        <CaughtContent cData={cData} fishActions={fishActions} isReadonly={isReadonly} fileTransferStatus={fileTransferStatus} onAttachFile={onAttachFile} onRequestFile={onRequestFile} tankId={tankId} isMobile={true}/>
      </div>
    ):(
      <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
        width:"min(520px, 92vw)",maxHeight:"85vh",
        background:"var(--surf,rgba(8,12,24,.97))",borderRadius:12,zIndex:30,
        display:"flex",flexDirection:"column",
        boxShadow:"0 16px 48px rgba(0,0,0,.5)",animation:"scaleIn .2s ease-out",
        backdropFilter:"blur(10px)",border:"1px solid var(--brd,rgba(255,255,255,.06))"}}>
        <CoverImage attachments={cData.attachments}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px 8px",flexShrink:0,borderBottom:"1px solid var(--brd2,rgba(255,255,255,.03))"}}>
          <span style={{fontSize:9,opacity:.3,letterSpacing:3}}>{"\uD83C\uDFA3"} TASK DETAIL</span>
          <button onClick={releaseFish} style={{...iconBtn,fontSize:10}}>{"\u2715"}</button>
        </div>
        <CaughtContent cData={cData} fishActions={fishActions} isReadonly={isReadonly} fileTransferStatus={fileTransferStatus} onAttachFile={onAttachFile} onRequestFile={onRequestFile} tankId={tankId} isMobile={false}/>
      </div>
    )}
  </>);
}
