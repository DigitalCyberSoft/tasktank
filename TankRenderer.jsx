import FishSVG from "./FishSVG.jsx";
import { IMP, durLabel } from "./constants.js";

export default function TankRenderer({ tank, caught, showSingle, effectiveZoom, flushTid, catchFish, pR, fE, fB, fL, tE, dueLabel, truncLen }) {
  const stress=Math.min((tank.fishes||[]).length/10,1);
  return(
    <div ref={el=>{if(el)tE.current[tank.id]=el;}} style={{flex:1,position:"relative",overflow:"hidden",minHeight:0,
      background:stress>.7?"linear-gradient(180deg,var(--ws1) 0%,var(--ws2) 50%,var(--ws3) 100%)":"linear-gradient(180deg,var(--w1) 0%,var(--w2) 50%,var(--w3) 100%)",transition:"background 3s"}}>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",background:"radial-gradient(ellipse 60% 16% at 42% 0%,var(--wsurf) 0%,transparent 100%)"}}/>
      <div style={{position:"absolute",top:0,left:0,right:0,height:"8%",background:"linear-gradient(to bottom,rgba(100,180,255,.04),transparent)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:"22%",background:"linear-gradient(to top,var(--wbot),transparent)",pointerEvents:"none"}}/>
      {[12,40,72,88].map((l,i)=>(<div key={`w${i}`} style={{position:"absolute",bottom:0,left:`${l}%`,width:4,height:`${14+i*6}%`,background:"linear-gradient(to top,var(--wsea1),var(--wsea2))",borderRadius:"40% 60% 0 0",transformOrigin:"bottom center",animation:`sway ${2+i*.35}s ${i*.3}s ease-in-out infinite`,pointerEvents:"none",opacity:0.28}}/>))}
      {[0,1,2].map(i=>(<div key={`b${i}`} style={{position:"absolute",left:`${15+i*35}%`,bottom:0,width:2+i,height:2+i,borderRadius:"50%",border:"1px solid rgba(255,255,255,.05)",animation:`rise ${7+i*3}s ${i*2}s linear infinite`,pointerEvents:"none"}}/>))}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",borderTop:"1px solid var(--brd2,rgba(255,255,255,.03))"}}/>

      {(tank.fishes||[]).filter(f=>caught?.fishId!==f.id).map(fish=>{
        const imp=IMP[fish.importance||"normal"];const dl=fish.completed?null:dueLabel(fish.dueDate);const fc=!!fish.completed;
        return(<div key={fish.id} ref={el=>{if(el)fE.current[fish.id]=el;}} className="fhit"
          onClick={e=>{e.stopPropagation();catchFish(tank.id,fish.id);}}
          style={{position:"absolute",left:0,top:0}}>
          <div ref={el=>{if(el)fB.current[fish.id]=el;}} style={{transformOrigin:"center center",position:"relative"}}>
            <FishSVG color={fish.color} size={pR.current[fish.id]?.sz||46}/>
            {fc&&<span style={{position:"absolute",top:-2,right:-2,fontSize:9,pointerEvents:"none",background:"#2ED573",color:"#fff",borderRadius:"50%",width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,lineHeight:1,boxShadow:"0 0 4px #2ED57366"}}>{"\u2713"}</span>}
            {!fc&&imp.badge&&<span style={{position:"absolute",top:-4,right:-4,fontSize:10,pointerEvents:"none",animation:fish.importance==="critical"?"impP 1.4s ease-in-out infinite":"none"}}>{imp.badge}</span>}
            {dl&&<span style={{position:"absolute",top:-2,left:-2,fontSize:6,pointerEvents:"none",color:dl.color,fontWeight:700,textShadow:"0 1px 3px rgba(0,0,0,.9)"}}>{"\u25CF"}</span>}
          </div>
          <div ref={el=>{if(el)fL.current[fish.id]=el;}} style={{
            textAlign:"center",fontSize:showSingle?10:10,lineHeight:1.2,
            color:fc?"rgba(46,213,115,.5)":(dl?.color||(imp.color?imp.color+"dd":"var(--fish-text)")),
            marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
            maxWidth:showSingle?120:110,textShadow:"0 1px 5px rgba(0,0,0,.95)",pointerEvents:"none",
            letterSpacing:.3,background:"rgba(0,0,0,.4)",padding:"2px 6px",borderRadius:4,transformOrigin:"center top",
            textDecoration:fc?"line-through":"none"}}>
            {fish.task.length>truncLen?fish.task.slice(0,truncLen-2)+"\u2026":fish.task}
            {fish.duration&&<span style={{display:"block",fontSize:showSingle?7:8,opacity:.55,marginTop:1,color:"#7bb8ff",letterSpacing:.5}}>{"\u23F1"}{durLabel(fish.duration)}</span>}
          </div></div>);
      })}

      {(tank.fishes||[]).length===0&&(
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
          <div style={{fontSize:showSingle?36:28,opacity:.12,marginBottom:4}}>{"\uD83D\uDC20"}</div>
          <div style={{fontSize:showSingle?9:10,opacity:.1,letterSpacing:2,fontWeight:600}}>EMPTY</div></div>)}

      {flushTid===tank.id&&(
        <div style={{position:"absolute",bottom:"2%",left:"50%",transform:"translateX(-50%)",width:44,height:44,pointerEvents:"none",zIndex:160}}>
          <div style={{width:"100%",height:"100%",borderRadius:"50%",background:"conic-gradient(from 0deg,transparent,rgba(77,150,255,.35),transparent,rgba(77,150,255,.2),transparent)",animation:"vSpin .6s linear infinite"}}/>
          <div style={{position:"absolute",inset:"22%",borderRadius:"50%",background:"radial-gradient(circle,rgba(0,0,0,.5),transparent)",animation:"vPulse .4s ease-in-out infinite"}}/>
        </div>)}
    </div>);
}
