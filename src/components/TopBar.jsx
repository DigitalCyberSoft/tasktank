import { SPD } from "../constants.js";
import { iconBtn } from "../styles.js";

export default function TopBar({ showSingle, setDrawer, stStatus, setJoinModal, actTank, headerEdit, headerName, setHeaderName, setHeaderEdit, saveHeaderName, effectiveZoom, cycleZoom, tanks, setListView, setShareModal, cycleSpeed, openPurge, isReadonly, setSettingsOpen, peerConnStatus, viewMode, setViewMode }) {
  const isBoard=viewMode==="board";
  return(
    <div style={{padding:"8px 12px",display:"flex",alignItems:"center",gap:8,background:"var(--bar,rgba(5,9,18,.96))",borderBottom:"1px solid var(--brd2,rgba(255,255,255,.03))",zIndex:20,flexShrink:0}}>
      {showSingle&&<button onClick={()=>setDrawer(true)} style={iconBtn}>{"\u2630"}</button>}
      <span style={{fontSize:showSingle?9:12,fontWeight:700,letterSpacing:3,color:"#4D96FF",marginRight:2,flexShrink:0}}>TASKTANK</span>
      <span onClick={()=>setJoinModal(true)} title={`Sync: ${stStatus} · Tap to join`} style={{fontSize:showSingle?8:10,cursor:"pointer",flexShrink:0,padding:showSingle?"1px 5px":"2px 7px",borderRadius:4,background:stStatus==="connected"?"rgba(46,213,115,.08)":"var(--inp,rgba(255,255,255,.02))",border:`1px solid ${stStatus==="connected"?"rgba(46,213,115,.2)":"var(--brd,rgba(255,255,255,.04))"}`,color:stStatus==="connected"?"#2ED573":"var(--tx3,#556)"}}>{stStatus==="connected"?"\u26A1":"\u25CB"}</span>
      {(()=>{const n=Object.values(peerConnStatus||{}).filter(s=>s==="connected").length;if(!n)return null;return <span title={`${n} direct peer${n>1?"s":""}`} style={{fontSize:showSingle?8:9,padding:showSingle?"1px 4px":"2px 6px",borderRadius:3,background:"rgba(77,150,255,.12)",border:"1px solid rgba(77,150,255,.25)",color:"#4D96FF",fontWeight:700,flexShrink:0}}>{n} {"\u21C4"}</span>;})()}
      {showSingle&&actTank?(!isReadonly&&headerEdit?(
        <input autoFocus value={headerName} onChange={e=>setHeaderName(e.target.value)}
          onBlur={saveHeaderName} onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setHeaderEdit(false);}}
          style={{flex:1,padding:"2px 6px",background:"var(--inp,rgba(0,0,0,.3))",border:"1px solid rgba(77,150,255,.3)",borderRadius:4,color:"var(--tx,#d0d8e4)",fontSize:11,fontFamily:"inherit",textAlign:"center",minWidth:0}}/>
      ):(
        <span onClick={()=>{if(!isReadonly){setHeaderEdit(true);setHeaderName(actTank.name);}}} style={{flex:1,fontSize:11,fontWeight:600,letterSpacing:1.5,color:"#7bb8ff",textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:isReadonly?"default":"text",borderBottom:isReadonly?"none":"1px dashed rgba(123,184,255,.15)",paddingBottom:1}}>
          {actTank.name.toUpperCase()} {!isReadonly&&<span style={{fontSize:8,opacity:.25}}>{"\u270F"}</span>}{isReadonly&&<span style={{fontSize:7,opacity:.35,color:"#4D96FF",marginLeft:4}}>VIEW ONLY</span>}
        </span>
      )):(<span style={{flex:1}}/>)}
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        {/* View toggle (tank/board) */}
        {tanks.length>0&&(<div style={{display:"flex",alignItems:"center",background:"var(--inp,rgba(255,255,255,.03))",borderRadius:5,border:"1px solid var(--brd,rgba(255,255,255,.04))"}}>
          <button onClick={()=>setViewMode("tank")} title="Tank view" style={{...iconBtn,fontSize:showSingle?10:12,padding:showSingle?"3px 6px":"4px 8px",background:!isBoard?"rgba(77,150,255,.15)":"transparent",color:!isBoard?"#4D96FF":"var(--tx3,#556)",borderRadius:"5px 0 0 5px",border:"none"}}>{"\uD83D\uDC20"}</button>
          <button onClick={()=>setViewMode("board")} title="Board view (Ctrl+B)" style={{...iconBtn,fontSize:showSingle?10:12,padding:showSingle?"3px 6px":"4px 8px",background:isBoard?"rgba(77,150,255,.15)":"transparent",color:isBoard?"#4D96FF":"var(--tx3,#556)",borderRadius:"0 5px 5px 0",border:"none"}}>{"\u2630"}</button>
        </div>)}
        {/* Zoom controls (hidden in board mode) */}
        {!isBoard&&tanks.length>1&&(<div style={{display:"flex",alignItems:"center",gap:2,background:"var(--inp,rgba(255,255,255,.03))",borderRadius:5,padding:"2px 3px",border:"1px solid var(--brd,rgba(255,255,255,.04))"}}>
          <button onClick={()=>cycleZoom(1)} title="Zoom out (see more tanks)" style={{...iconBtn,fontSize:showSingle?10:12,padding:showSingle?"3px 5px":"4px 7px",opacity:effectiveZoom>=6?0.2:0.7}}>{"\uD83D\uDD0D\u207B"}</button>
          <span style={{fontSize:showSingle?7:10,opacity:.3,minWidth:showSingle?14:18,textAlign:"center",fontWeight:700}}>{effectiveZoom===1?"1":effectiveZoom===0?"A":effectiveZoom}</span>
          <button onClick={()=>cycleZoom(-1)} title="Zoom in (see fewer tanks)" style={{...iconBtn,fontSize:showSingle?10:12,padding:showSingle?"3px 5px":"4px 7px",opacity:effectiveZoom<=1?0.2:0.7}}>{"\uD83D\uDD0D\u207A"}</button>
        </div>)}
        {!isBoard&&actTank&&showSingle&&<button onClick={()=>setListView(true)} style={iconBtn} title="List view">{"\u2630"}</button>}
        {actTank&&showSingle&&<button onClick={()=>setShareModal(actTank.id)} style={{...iconBtn,fontSize:11}} title="Share tank">{"\uD83D\uDD17"}</button>}
        {actTank&&showSingle&&!isReadonly&&<button onClick={()=>cycleSpeed(actTank.id)} style={iconBtn} title={SPD[actTank.speedIdx??2].label}>{SPD[actTank.speedIdx??2].icon}</button>}
        {!isBoard&&actTank&&!isReadonly&&(actTank.fishes||[]).length>0&&<button onClick={openPurge} style={{...iconBtn,color:"#FF4757",fontSize:showSingle?11:14}}>{"\u2622"}</button>}
        <button onClick={()=>setSettingsOpen(p=>!p)} style={{...iconBtn,fontSize:showSingle?11:13}} title="Settings">{"\u2699\uFE0F"}</button>
      </div>
    </div>);
}
