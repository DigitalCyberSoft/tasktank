// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
export const MAX_TANKS = 6;
export const COLORS = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF6B9D","#C9B1FF","#00D2FF","#FF8C42","#95E1D3","#F38181","#7B68EE","#2ED573","#1E90FF","#FFA502","#E056A0","#56E0C4","#AB47BC","#26C6DA"];
export const SPD = [{v:0,icon:"\u23F8",label:"Frozen"},{v:0.25,icon:"\uD83D\uDC0C",label:"Slow"},{v:1,icon:"\uD83D\uDC20",label:"Normal"},{v:2.2,icon:"\u26A1",label:"Fast"}];
export const IMP = {
  normal:{label:"Normal",badge:"",color:null,scale:1,glow:0},
  important:{label:"Important",badge:"\u2B50",color:"#FFD93D",scale:1.15,glow:6},
  critical:{label:"Critical",badge:"\uD83D\uDD25",color:"#FF4757",scale:1.28,glow:14},
};
export const pick=a=>a[~~(Math.random()*a.length)];
export const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
export const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
export const todayStr=()=>new Date().toISOString().slice(0,10);
export const daysBetween=(a,b)=>Math.round((new Date(b)-new Date(a))/864e5);
export const fmtDate=d=>{if(!d)return"";try{return new Date(d+"T00:00:00").toLocaleDateString();}catch{return d;}};
export const getGrid=n=>{if(n<=1)return{c:1,r:1};if(n<=2)return{c:2,r:1};if(n<=3)return{c:3,r:1};if(n<=4)return{c:2,r:2};return{c:3,r:2};};
export const getZoomGrid=(zoom,totalCards)=>{
  // When zoom is set, lay out to fit that many visible tanks
  if(zoom<=1)return{c:1,r:1};
  if(zoom<=2)return{c:2,r:1};
  if(zoom<=3)return{c:3,r:1};
  if(zoom<=4)return{c:2,r:2};
  return{c:3,r:2};
};
const getDeviceId=()=>{let d=null;try{d=localStorage.getItem("tt-did");}catch{}if(!d){try{const m=document.cookie.match(/(?:^|; )tt-did=([^;]+)/);if(m)d=m[1];}catch{}}if(!d){d=uid()+"-"+uid();}try{localStorage.setItem("tt-did",d);}catch{}try{document.cookie=`tt-did=${d};max-age=${60*60*24*365*5};path=/;SameSite=Lax`;}catch{}return d;};
export const DEVICE_ID=typeof window!=="undefined"?getDeviceId():"unknown";
export const nowISO=()=>new Date().toISOString();

// Priority Y bands: where fish naturally swim based on importance
export const DEPTH_BAND={critical:{min:3,max:22},important:{min:15,max:42},normal:{min:38,max:74},completed:{min:70,max:94}};

// Duration presets: value stored on fish, label shown in UI
export const DUR_PRESETS=[
  {v:"5m",l:"5m"},{v:"15m",l:"15m"},{v:"30m",l:"30m"},
  {v:"1h",l:"1h"},{v:"2h",l:"2h"},{v:"4h",l:"4h"},
  {v:"1d",l:"1d"},{v:"3d",l:"3d"},{v:"1w",l:"1w"},
];
export const durLabel=(v)=>{if(!v)return null;const p=DUR_PRESETS.find(d=>d.v===v);if(p)return p.l;return v;};

export const db={
  async load(){try{const r=localStorage.getItem("tasktank-v5");return r?JSON.parse(r):null;}catch{return null;}},
  async save(d){try{localStorage.setItem("tasktank-v5",JSON.stringify(d));}catch{}},
};

export const NOSTR_RELAYS=[
  "wss://relay.damus.io","wss://nos.lol","wss://relay.snort.social",
  "wss://relay.primal.net","wss://nostr.mom","wss://nostr.einundzwanzig.space",
  "wss://yabu.me","wss://nostr.oxtr.dev","wss://relay.mostr.pub",
  "wss://soloco.nl","wss://nostr.data.haus","wss://relay.nostr.net",
  "wss://relay.noswhere.com",
];
export const SYNC_CODE_VERSION=2;
export const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];
export const RTC_CONFIG = { iceServers: STUN_SERVERS };
export const SIGNALING_KIND = 20078;
export const PRESENCE_INTERVAL = 30000;
export const PRESENCE_TIMEOUT = 90000;
export const NOSTR_PUSH_INTERVAL_CONNECTED = 30000;
export const MAX_SYNC_DEVICES = 20;
export const DEVICE_PAIR_CODE_VERSION = 1;
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const FILE_CHUNK_SIZE = 64 * 1024;      // 64KB

// Export task lists as text
export const exportPlain=(fishes,includeCompleted)=>{
  const list=includeCompleted?fishes:fishes.filter(f=>!f.completed);
  return list.map(f=>f.task).join("\n");
};
export const exportRich=(fishes,includeCompleted)=>{
  const td=todayStr();
  const list=includeCompleted?fishes:fishes.filter(f=>!f.completed);
  return list.map(f=>{
    let line=f.task;
    const imp=f.importance||"normal";
    if(imp!=="normal")line+=` [${imp}]`;
    if(f.dueDate){
      const diff=daysBetween(td,f.dueDate);
      if(diff<0)line+=` (${fmtDate(f.dueDate)}, ${-diff}d overdue)`;
      else if(diff===0)line+=` (due today)`;
      else if(diff===1)line+=` (tomorrow)`;
      else line+=` (${fmtDate(f.dueDate)}, ${diff}d left)`;
    }
    if(f.duration)line+=` ~${durLabel(f.duration)}`;
    const cl=f.checklist||[];
    if(cl.length>0)line+=` [${cl.filter(c=>c.done).length}/${cl.length} done]`;
    if(f.completed)line+=` [completed]`;
    return line;
  }).join("\n");
};
