import React from 'react';

// Lanilot mark "lane L": a road shaped as an L with its centre line. Fills its box; the tile follows the brand color.
export const LANE_PATH='M22 13V40Q22 49 31 49H51';
export default function LogoMark({color='var(--brand, #2563eb)',title}){
 return <svg viewBox="0 0 64 64" width="100%" height="100%" role={title?'img':undefined} aria-label={title} aria-hidden={title?undefined:true} focusable="false" style={{display:'block'}}>
  <rect width="64" height="64" rx="16" fill={color}/>
  <path d={LANE_PATH} fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
  <path d={LANE_PATH} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="4.5 4.5"/>
 </svg>;
}
