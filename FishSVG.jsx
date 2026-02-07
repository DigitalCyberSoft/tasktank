const FishSVG=({color,size=44})=>(
  <svg width={size} height={size*0.55} viewBox="0 0 100 55" style={{display:"block",overflow:"visible"}}>
    <polygon points="2,12 2,43 22,27.5" fill={color} opacity=".55"/>
    <ellipse cx="50" cy="27.5" rx="32" ry="18" fill={color}/>
    <ellipse cx="42" cy="20" rx="16" ry="9" fill="rgba(255,255,255,.08)"/>
    <circle cx="68" cy="21" r="5" fill="white" opacity=".9"/>
    <circle cx="70" cy="20" r="2.5" fill="#080c1a"/>
    <path d="M80 29Q84 31 80 33" stroke="rgba(255,255,255,.12)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
  </svg>
);

export default FishSVG;
