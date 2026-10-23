import React,{useEffect,useRef,useState} from 'react';
import {fmtDate} from '../i18n.js';

// Hand-built SVG charts for the admin: one series in the brand color, the previous period as a gray dashed line.
const shortDate=d=>fmtDate(new Date(d+'T12:00:00'),{day:'numeric',month:'short'},'date');
function useWidth(){const ref=useRef(null),[width,setWidth]=useState(600);useEffect(()=>{const el=ref.current;if(!el)return;const ro=new ResizeObserver(([e])=>setWidth(Math.max(240,e.contentRect.width)));ro.observe(el);return()=>ro.disconnect()},[]);return [ref,width]}
const niceMax=v=>{if(v<=0)return 4;const p=10**Math.floor(Math.log10(v)),m=v/p;return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p};

export function AreaChart({dates,current,previous,format=v=>v,label,previousLabel,height=260}){
 const [ref,width]=useWidth(),[hover,setHover]=useState(null);
 const pad={l:40,r:12,t:12,b:26},w=width-pad.l-pad.r,h=height-pad.t-pad.b,n=dates.length;
 const max=niceMax(Math.max(...current,...(previous||[]),1)),x=i=>pad.l+(n<2?w/2:i*w/(n-1)),y=v=>pad.t+h-v/max*h;
 const path=vals=>vals.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
 const ticks=[0,.25,.5,.75,1].map(f=>max*f),every=Math.max(1,Math.ceil(n/7));
 const move=e=>{const r=e.currentTarget.getBoundingClientRect(),i=Math.round((e.clientX-r.left-pad.l)/w*(n-1));setHover(i<0||i>=n?null:i)};
 return <div className="ad-chart" ref={ref}>
  <svg width={width} height={height} role="img" aria-label={label} onMouseMove={move} onMouseLeave={()=>setHover(null)}>
   {ticks.map(t=><g key={t}><line x1={pad.l} x2={width-pad.r} y1={y(t)} y2={y(t)} className="ad-grid"/><text x={pad.l-8} y={y(t)+4} className="ad-axis" textAnchor="end">{format(Math.round(t*100)/100)}</text></g>)}
   {dates.map((d,i)=>i%every===0&&<text key={d} x={x(i)} y={height-6} className="ad-axis" textAnchor="middle">{shortDate(d)}</text>)}
   {previous&&<path d={path(previous)} className="ad-line-prev"/>}
   <path d={`${path(current)}L${x(n-1)},${pad.t+h}L${x(0)},${pad.t+h}Z`} className="ad-area"/>
   <path d={path(current)} className="ad-line"/>
   {hover!==null&&<g><line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t+h} className="ad-cross"/><circle cx={x(hover)} cy={y(current[hover])} r="4.5" className="ad-dot"/></g>}
   <rect x={pad.l} y={pad.t} width={w} height={h} fill="transparent"/>
  </svg>
  {hover!==null&&<div className="ad-tip" style={{left:Math.min(Math.max(x(hover)-80,0),width-170),top:4}}>
   <strong>{shortDate(dates[hover])}</strong>
   <span><i className="ad-key"/>{label}: <b>{format(current[hover])}</b></span>
   {previous&&<span><i className="ad-key prev"/>{previousLabel}: <b>{format(previous[hover])}</b></span>}
  </div>}
 </div>;
}

// Horizontal bars with the value and an optional share; hover shows the exact numbers.
export function BarList({rows,format=v=>v,empty}){
 const max=Math.max(...rows.map(r=>r.value),1);
 if(!rows.length)return <p className="ad-empty">{empty}</p>;
 return <div className="ad-bars">{rows.map(r=><div className="ad-bar-row" key={r.key??r.label} title={`${r.label}: ${format(r.value)}${r.hint?' · '+r.hint:''}`}>
  <span className="ad-bar-label">{r.label}</span>
  <span className="ad-bar-track"><i style={{width:`${Math.max(r.value/max*100,r.value?2:0)}%`}}/></span>
  <span className="ad-bar-value">{format(r.value)}{r.hint&&<small>{r.hint}</small>}</span>
 </div>)}</div>;
}

// Daily columns for a 30-day activity strip.
export function MiniColumns({dates,values,label}){
 const max=Math.max(...values,1);
 return <div className="ad-columns" role="img" aria-label={label}>{values.map((v,i)=><span key={dates[i]} title={`${shortDate(dates[i])}: ${v}`}><i style={{height:`${v?Math.max(v/max*100,8):0}%`}}/></span>)}</div>;
}
