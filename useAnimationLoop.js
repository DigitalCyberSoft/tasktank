import { useRef, useEffect, useCallback } from "react";
import { DEPTH_BAND, SPD, IMP, clamp, todayStr, daysBetween } from "./constants.js";

export default function useAnimationLoop(tanks, caught, showGrid, showSingle, effectiveZoom) {
  const pR=useRef({});const fE=useRef({});const fB=useRef({});const fL=useRef({});
  const tE=useRef({});const surfT=useRef({});const tR=useRef(tanks);const cR=useRef(caught);
  const flR=useRef(null);const raf=useRef(null);
  const modeR=useRef({showGrid,showSingle,effectiveZoom});

  useEffect(()=>{modeR.current={showGrid,showSingle,effectiveZoom};},[showGrid,showSingle,effectiveZoom]);
  useEffect(()=>{tR.current=tanks;},[tanks]);
  useEffect(()=>{cR.current=caught;},[caught]);

  const initP=useCallback((id,importance)=>{
    const band=DEPTH_BAND[importance||"normal"]||DEPTH_BAND.normal;
    const a=Math.random()*Math.PI*2;
    pR.current[id]={x:8+Math.random()*76,y:band.min+Math.random()*(band.max-band.min),
      targetY:band.min+Math.random()*(band.max-band.min),
      dx:Math.cos(a)*(0.01+Math.random()*0.022),dy:0,
      wb:Math.random()*Math.PI*2,ws:0.014+Math.random()*0.016,
      wa:0.04+Math.random()*0.06,sz:46+Math.random()*16,glow:0,
      surfZ:0.1+Math.random()*0.2};
  },[]);

  // ANIMATION LOOP
  // Y-axis = priority position (critical=top, normal=middle, completed=bottom)
  // Z-axis (surfZ) = proximity to glass (0=far/tiny/blurry, 1=pressed against glass/huge/bright)
  // Surface timer periodically brings fish close to say hi
  useEffect(()=>{
    const tick=()=>{
      const all=tR.current;const cur=cR.current;const fl=flR.current;const td=todayStr();
      const mode=modeR.current;
      const nt=all.length;
      const sAdj=mode.showSingle?1:(mode.effectiveZoom<=2?1.5:mode.effectiveZoom<=3?1.15:0.9);

      all.forEach(tank=>{
        const te=tE.current[tank.id];if(!te)return;
        const sz={w:te.clientWidth,h:te.clientHeight};
        const cid=cur?.tankId===tank.id?cur.fishId:null;
        const swim=(tank.fishes||[]).filter(f=>f.id!==cid);
        const tSpd=SPD[tank.speedIdx??2].v;
        const chaos=(1+Math.max(0,swim.length-4)*0.015)*tSpd;
        const isFl=fl&&fl.tankId===tank.id;
        let flT=0;if(isFl)flT=Math.min((Date.now()-fl.start)/fl.dur,1);

        // Surface timer — periodically fish swim toward the glass (get bigger/brighter)
        if(tSpd>0&&!isFl){
          if(!surfT.current[tank.id])surfT.current[tank.id]=220+Math.random()*320;
          surfT.current[tank.id]-=tSpd*0.6;
          if(surfT.current[tank.id]<=0){
            const far=swim.filter(f=>{const p=pR.current[f.id];return p&&p.surfZ<0.3&&!f.completed;});
            if(far.length){const cnt=Math.min(far.length,1+~~(Math.random()*2));
              [...far].sort(()=>Math.random()-.5).slice(0,cnt).forEach(df=>{
                const p=pR.current[df.id];if(p){p.surfZ=0.85+Math.random()*0.15;p.glow=0.8;}});}
            surfT.current[tank.id]=280+Math.random()*400;
          }
        }

        swim.forEach(f=>{
          const p=pR.current[f.id];if(!p)return;
          const imp=IMP[f.importance||"normal"];
          let urgency=0;
          if(f.dueDate&&!f.completed){const diff=daysBetween(td,f.dueDate);if(diff<0)urgency=3;else if(diff===0)urgency=2;else if(diff<=2)urgency=1;}
          const isComp=!!f.completed;
          p.wb+=p.ws;

          // surfZ drift: naturally recedes, urgent/critical fish come closer more often
          if(tSpd>0){
            p.surfZ=Math.max(0.05,p.surfZ-0.0008*tSpd); // slow drift back
            if(!isComp&&urgency>=3&&Math.random()<0.006){p.surfZ=Math.min(1,p.surfZ+0.5);p.glow=0.7;}
            else if(!isComp&&urgency>=2&&Math.random()<0.003){p.surfZ=Math.min(1,p.surfZ+0.4);p.glow=0.5;}
            else if(!isComp&&f.importance==="critical"&&Math.random()<0.004){p.surfZ=Math.min(1,p.surfZ+0.35);p.glow=0.4;}
            if(isComp)p.surfZ=Math.max(0.05,p.surfZ*0.998); // completed fish stay far back
          }

          // Compute target depth band based on priority + urgency
          const bandKey=isComp?"completed":(f.importance||"normal");
          const band=DEPTH_BAND[bandKey]||DEPTH_BAND.normal;
          let tgtY=p.targetY||((band.min+band.max)/2);
          // Overdue/urgent fish get pushed higher (lower Y)
          if(urgency>=3)tgtY=Math.min(tgtY,12+Math.random()*8);
          else if(urgency>=2)tgtY=Math.min(tgtY,18+Math.random()*10);
          else if(urgency>=1)tgtY=Math.min(tgtY,band.min+5);
          // Re-target occasionally within band
          if(Math.random()<0.001){p.targetY=band.min+Math.random()*(band.max-band.min);}

          if(isFl&&fl.doomed.has(f.id)){
            const sp=fl.sp[f.id];if(!sp)return;
            const e=flT*flT*flT;const sw=flT*Math.PI*14;const r=(1-e)*15;
            p.x=sp.x+(50-sp.x)*e+Math.cos(sw)*r;
            p.y=sp.y+(95-sp.y)*e+Math.sin(sw)*r*0.2;
          }else if(tSpd===0){
            // frozen
          }else{
            // Horizontal wandering
            if(Math.random()<0.003*chaos){const a=Math.random()*Math.PI*2;p.dx=Math.cos(a)*(0.01+Math.random()*0.022)*Math.min(chaos,1.6)*(isComp?0.3:1);}

            // Vertical: gently pull toward target band
            const pull=0.0008*(isComp?0.4:1)*tSpd;
            if(p.y<tgtY-3)p.dy+=pull;
            else if(p.y>tgtY+3)p.dy-=pull;
            else p.dy*=0.96; // dampen near target

            // Clamp vertical speed
            p.dy=clamp(p.dy,-0.06,0.04);

            p.x+=p.dx*chaos;p.y+=p.dy*chaos+Math.sin(p.wb)*p.wa*0.006;
            if(p.x<3||p.x>89){p.dx*=-1;p.x=clamp(p.x,3,89);}
            p.y=clamp(p.y,2,94);
            if(p.glow>0)p.glow=Math.max(0,p.glow-0.004);
          }

          const el=fE.current[f.id];if(!el)return;
          const bd=fB.current[f.id];const lb=fL.current[f.id];

          if(isFl&&fl.doomed.has(f.id)){
            const e=flT*flT*flT;
            el.style.transform=`translate(${(p.x/100)*sz.w}px,${(p.y/100)*sz.h}px)`;
            el.style.opacity=Math.max(0,1-e*1.2);el.style.zIndex=200;
            if(bd)bd.style.transform=`scale(${Math.max(0,1-e*1.4)}) rotate(${flT*1080}deg)`;
            if(lb)lb.style.opacity=0;return;
          }

          // Rendering: Y-axis = priority position, surfZ = how close to the glass
          const depthFrac=p.y/100;
          const zProx=clamp(p.surfZ||0.15,0.05,1); // z-proximity to viewer
          const zScale=0.5+zProx*0.7; // far=0.5x, pressed-against-glass=1.2x
          const zOp=clamp(0.25+zProx*0.75,0.2,1); // far=dim, close=bright
          const zBlur=zProx<0.15?(0.15-zProx)*40:0; // far=blurry
          const dScale=zScale*imp.scale*sAdj*(isComp?0.82:1);
          const dOp=zOp*(isComp?0.35:1);
          const glR2=isComp?1:(2+zProx*6+p.glow*12+imp.glow);
          const gc=urgency>=3?"#FF4757":urgency>=2?"#FFD93D":(imp.color||f.color);
          const desat=isComp?"grayscale(.7) ":"";

          el.style.transform=`translate(${(p.x/100)*sz.w}px,${tSpd===0?(p.y/100)*sz.h+Math.sin(p.wb)*1.2:(p.y/100)*sz.h}px)`;
          el.style.opacity=dOp;el.style.zIndex=isComp?0:~~(zProx*100+((1-depthFrac)*10));
          el.style.filter=desat+(zBlur>0.3?`blur(${zBlur.toFixed(1)}px) drop-shadow(0 0 ${glR2}px ${gc}30)`:`drop-shadow(0 0 ${glR2.toFixed(1)}px ${gc}${p.glow>0.1?"66":"30"})`);
          if(bd){const flip=p.dx>=0?1:-1;const bob=Math.sin(p.wb*1.2)*1.3;bd.style.transform=`scaleX(${flip}) scale(${dScale.toFixed(3)}) rotate(${bob.toFixed(1)}deg)`;}
          if(lb){const lo=clamp(0.35+zProx*0.5,0.3,0.85);lb.style.opacity=lo;lb.style.transform=`scale(${clamp(0.6+zProx*0.5,0.6,1.1).toFixed(2)})`;}
        });
      });
      raf.current=requestAnimationFrame(tick);
    };
    raf.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf.current);
  },[]);

  return { pR, fE, fB, fL, tE, surfT, flR, initP };
}
