import React from 'react';
import LogoMark from './LogoMark.jsx';
import {__,translateDeep} from './i18n.js';
import LangSwitch from './LangSwitch.jsx';
import './auth.css';

// Shared frame of the sign-in, sign-up, setup and invitation screens.
export async function post(path,body){const r=await fetch('/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error?translateDeep(data.error):__('Ошибка сервера'));return data}
export function Shell({company,icon:Icon,title,subtitle,children,wide}){
 return <div className="auth-page"><div className="auth-main">
  <header className="auth-top"><div className="auth-brand">{company?.brand?.logo?<img className="auth-brand-logo" src={company.brand.logo} alt={company.brand.name}/>:<><span className="sidebar-logo"><LogoMark color={company?undefined:'#2563eb'}/></span><strong>{company?.brand?.name||company?.name||'Lanilot'}</strong></>}</div><LangSwitch/></header>
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


// "Continue with Google / Apple". Apple is offered on Apple devices only; providers come from the server config.
const appleDevice=()=>/Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform||navigator.platform||navigator.userAgent);
const googleIcon=<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-3.9 7-9.8 7-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>;
const appleIcon=<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.97.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.05-.52 2.68-1.28z"/></svg>;
export function SocialButtons({providers=[],start='/api/auth/oauth/{p}/start'}){
 const list=providers.filter(p=>p==='google'||p==='apple'&&appleDevice());
 if(!list.length)return null;
 return <div className="auth-social">{list.map(p=><a key={p} className={'auth-social-btn '+p} href={start.replace('{p}',p)}>{p==='google'?googleIcon:appleIcon}{p==='google'?__('Продолжить с Google'):__('Продолжить с Apple')}</a>)}<div className="auth-divider"><span>{__('или')}</span></div></div>;
}
