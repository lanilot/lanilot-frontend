import React from 'react';
import {Route,LogIn,Phone,Mail,Globe,MapPin,Truck,ShieldCheck} from 'lucide-react';
import {__} from './i18n.js';
import LangSwitch from './LangSwitch.jsx';
import {label} from './Onboarding.jsx';

// Public page of a company on its own subdomain (white-label): logo, pitch, fleet, contacts and the way into the workspace.
export default function CompanyLanding({company}){
 const b=company.brand,l=b.landing,site=l.website&&(/^https?:\/\//.test(l.website)?l.website:'https://'+l.website);
 const facts=[l.mc&&['MC',l.mc],l.dot&&['DOT',l.dot],l.fleetSize&&[__('Автопарк'),label('fleetSize',l.fleetSize)],l.city&&[__('База'),l.city]].filter(Boolean);
 return <div className="company-landing">
  <header className="cl-top"><div className="cl-brand">{b.logo?<img src={b.logo} alt={b.name}/>:<><span className="sidebar-logo"><Route size={20}/></span><strong>{b.name}</strong></>}</div><div className="cl-top-actions"><LangSwitch/><a className="button primary" href="/login"><LogIn size={14}/>{__('Войти')}</a></div></header>
  <section className="cl-hero">
   <span className="cl-eyebrow"><Truck size={14}/>{__('Грузоперевозки по США')}</span>
   <h1>{l.headline||b.name}</h1>
   {l.description&&<p>{l.description}</p>}
   <div className="cl-cta">{l.phone&&<a className="button primary" href={'tel:'+l.phone.replace(/[^\d+]/g,'')}><Phone size={15}/>{l.phone}</a>}{l.email&&<a className="button secondary" href={'mailto:'+l.email}><Mail size={15}/>{__('Написать')}</a>}</div>
   {facts.length>0&&<dl className="cl-facts">{facts.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
  </section>
  {l.equipment?.length>0&&<section className="cl-section"><h2>{__('Техника')}</h2><div className="cl-equipment">{l.equipment.map(e=><span key={e}><Truck size={16}/>{e}</span>)}</div></section>}
  <section className="cl-section cl-contacts"><h2>{__('Контакты')}</h2><div>
   {l.phone&&<a href={'tel:'+l.phone.replace(/[^\d+]/g,'')}><Phone size={16}/>{l.phone}</a>}
   {l.email&&<a href={'mailto:'+l.email}><Mail size={16}/>{l.email}</a>}
   {site&&<a href={site} target="_blank" rel="noreferrer"><Globe size={16}/>{l.website}</a>}
   {l.city&&<span><MapPin size={16}/>{l.city}</span>}
  </div></section>
  <footer className="cl-footer"><span><ShieldCheck size={13}/>{__('Кабинет для сотрудников и партнёров компании')}</span><a href="/login">{__('Вход для сотрудников')}</a></footer>
 </div>;
}
