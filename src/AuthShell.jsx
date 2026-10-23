import React from 'react';
import {Route} from 'lucide-react';
import {__,translateDeep} from './i18n.js';
import LangSwitch from './LangSwitch.jsx';
import './auth.css';

// Shared frame of the sign-in, sign-up, setup and invitation screens.
export async function post(path,body){const r=await fetch('/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error?translateDeep(data.error):__('Ошибка сервера'));return data}
export function Shell({company,icon:Icon,title,subtitle,children,wide}){
 return <div className="auth-page"><div className="auth-main">
  <header className="auth-top"><div className="auth-brand"><span className="sidebar-logo"><Route size={20}/></span><strong>{company?.name||'Lanilot'}</strong></div><LangSwitch/></header>
  <section className={wide?"auth-card wide":"auth-card"} aria-labelledby="auth-title">
   <span className="auth-icon"><Icon size={20}/></span><h1 id="auth-title">{title}</h1>{subtitle&&<p className="auth-subtitle">{subtitle}</p>}{children}
  </section><p className="auth-footer">Lanilot · {__('Рабочее место диспетчера')}</p>
 </div><AuthVisual/></div>;
}
// Right half of the sign-in screens: a product picture, hidden on narrow screens.
function AuthVisual(){
 const route='M70 250 C150 180 230 210 300 160 S430 90 520 120';
 return <aside className="auth-visual" aria-hidden="true">
  <div className="auth-visual-copy"><h2>{__('Грузы, водители и прибыль — в одном окне')}</h2><p>{__('Lanilot находит выгодные грузы, считает прибыль рейса и ведёт переписку с брокерами.')}</p></div>
  <div className="auth-scene">
   <svg viewBox="0 0 590 330" className="auth-map">
    <defs><pattern id="auth-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#ffffff2e"/></pattern>
     <linearGradient id="auth-route" x1="0" x2="1"><stop offset="0" stopColor="#9fc0ff"/><stop offset="1" stopColor="#ffffff"/></linearGradient></defs>
    <path d="M40 120 L120 70 L250 60 L330 40 L420 55 L500 40 L560 90 L545 170 L500 230 L470 300 L420 270 L330 280 L260 300 L200 260 L120 250 L60 210 Z" fill="url(#auth-dots)" stroke="#ffffff40" strokeWidth="1.5"/>
    <path d={route} fill="none" stroke="#ffffff30" strokeWidth="10" strokeLinecap="round"/>
    <path d={route} fill="none" stroke="url(#auth-route)" strokeWidth="3" strokeLinecap="round" strokeDasharray="8 8" className="auth-route-line"/>
    <path d="M130 120 C210 100 260 230 360 230" fill="none" stroke="#ffffff55" strokeWidth="2" strokeDasharray="4 7"/>
    {[[70,250],[520,120],[130,120],[360,230]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="11" fill="#ffffff26"/><circle cx={x} cy={y} r="5" fill="#fff"/></g>)}
    <g className="auth-truck"><rect x="-17" y="-10" width="34" height="20" rx="6" fill="#fff"/><path d="M-8 0h12m-4-4 4 4-4 4" stroke="#2858ef" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>
   </svg>
   <div className="auth-float auth-float-load"><small>LD-2046 · {__('В пути')}</small><strong>Chicago, IL → Dallas, TX</strong><span><i style={{width:'64%'}}/></span></div>
   <div className="auth-float auth-float-profit"><small>{__('Прибыль рейса')}</small><strong>+$1,240</strong><em>$3.18 / mi</em></div>
   <div className="auth-float auth-float-broker"><small>{__('Брокер проверен')}</small><strong>C.H. Robinson</strong><em>{__('Факторинг одобрен')}</em></div>
  </div>
 </aside>;
}
export function Field({label,...props}){return <label className="form-label">{label}<input {...props}/></label>}

