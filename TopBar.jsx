import { SPD } from "./constants.js";
import { iconBtn } from "./styles.js";

export default function TopBar({ showSingle, setDrawer, stStatus, setJoinModal, actTank, headerEdit, headerName, setHeaderName, setHeaderEdit, saveHeaderName, effectiveZoom, cycleZoom, tanks, setListView, setShareModal, cycleSpeed, openPurge }) {
  return(
    <div style={{padding:"8px 12px",display:"flex",alignItems:"center",gap:8,background:"rgba(5,9,18,.96)",borderBottom:"1px solid rgba(255,255,255,.03)",zIndex:20,flexShrink:0}}>
      {showSingle&&<button onClick={()=>setDrawer(true)} style={iconBtn}>{"\u2630"}</button>}
      <span style={{fontSize:9,fontWeight:700,letterSpacing:3,color:"#4D96FF",marginRight:2,flexShrink:0}}>TASKTANK</span>
      <span onClick={()=>setJoinModal(true)} title={`Sync: ${stStatus} · Tap to join`} style={{fontSize:8,cursor:"pointer",flexShrink:0,padding:"1px 5px",borderRadius:3,background:stStatus==="connected"?"rgba(46,213,115,.08)":"rgba(255,255,255,.02)",border:`1px solid ${stStatus==="connected"?"rgba(46,213,115,.2)":"rgba(255,255,255,.04)"}`,color:stStatus==="connected"?"#2ED573":"#556"}}>{stStatus==="connected"?"\u26A1":"\u25CB"}</span>
      {showSingle&&actTank?(headerEdit?(
        <input autoFocus value={headerName} onChange={e=>setHeaderName(e.target.value)}
          onBlur={saveHeaderName} onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setHeaderEdit(false);}}
          style={{flex:1,padding:"2px 6px",background:"rgba(0,0,0,.3)",border:"1px solid rgba(77,150,255,.3)",borderRadius:4,color:"#d0d8e4",fontSize:11,fontFamily:"inherit",textAlign:"center",minWidth:0}}/>
      ):(
        <span onClick={()=>{setHeaderEdit(true);setHeaderName(actTank.name);}} style={{flex:1,fontSize:11,fontWeight:600,letterSpacing:1.5,color:"#7bb8ff",textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"text",borderBottom:"1px dashed rgba(123,184,255,.15)",paddingBottom:1}}>
          {actTank.name.toUpperCase()} <span style={{fontSize:8,opacity:.25}}>{"\u270F"}</span>
        </span>
      )):(<span style={{flex:1}}/>)}
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        {/* Zoom controls */}
        {tanks.length>1&&(<div style={{display:"flex",alignItems:"center",gap:1,background:"rgba(255,255,255,.03)",borderRadius:5,padding:"1px 2px",border:"1px solid rgba(255,255,255,.04)"}}>
          <button onClick={()=>cycleZoom(1)} title="Zoom out (see more tanks)" style={{...iconBtn,fontSize:10,padding:"3px 5px",opacity:effectiveZoom>=6?0.2:0.7}}>{"\uD83D\uDD0D\u207B"}</button>
          <span style={{fontSize:7,opacity:.3,minWidth:14,textAlign:"center",fontWeight:700}}>{effectiveZoom===1?"1":effectiveZoom===0?"A":effectiveZoom}</span>
          <button onClick={()=>cycleZoom(-1)} title="Zoom in (see fewer tanks)" style={{...iconBtn,fontSize:10,padding:"3px 5px",opacity:effectiveZoom<=1?0.2:0.7}}>{"\uD83D\uDD0D\u207A"}</button>
        </div>)}
        {actTank&&showSingle&&<button onClick={()=>setListView(true)} style={iconBtn} title="List view">{"\u2630"}</button>}
        {actTank&&showSingle&&<button onClick={()=>setShareModal(actTank.id)} style={{...iconBtn,fontSize:11}} title="Share tank">{"\uD83D\uDD17"}</button>}
        {actTank&&showSingle&&<button onClick={()=>cycleSpeed(actTank.id)} style={iconBtn} title={SPD[actTank.speedIdx??2].label}>{SPD[actTank.speedIdx??2].icon}</button>}
        {actTank&&(actTank.fishes||[]).length>0&&<button onClick={openPurge} style={{...iconBtn,color:"#FF4757",fontSize:11}}>{"\u2622"}</button>}
      </div>
    </div>);
}
