import React from 'react';
import {Route,LogIn,Phone,Mail,Globe,MapPin,Truck,ShieldCheck,Snowflake,Package,Zap,Repeat,Radar,Search,Handshake,FileCheck,Headphones,Navigation,ArrowRight,CheckCircle2,UserRound,CalendarClock} from 'lucide-react';
import {__} from './i18n.js';
import LangSwitch from './LangSwitch.jsx';
import {label} from './Onboarding.jsx';
import './company-landing.css';

// Public site of a company on <slug>.<domain>: hero, services by business type, equipment, lanes, process, contacts.
const typeProfile=t=>({
 owner_operator:{eyebrow:__('Owner-operator · перевозки по США'),headline:__('Ваш груз — под личную ответственность владельца'),lead:__('Владелец сам ведёт рейс: прямая связь, гибкий график и внимание к каждому грузу.')},
 dispatch_service:{eyebrow:__('Диспетчерская служба для перевозчиков'),headline:__('Диспетчеризация, которая держит грузовики загруженными'),lead:__('Находим выгодные грузы, договариваемся о ставке и ведём документы — водители просто едут.')},
 broker:{eyebrow:__('Брокер грузоперевозок'),headline:__('Надёжные перевозчики для ваших грузов по всей стране'),lead:__('Подбираем проверенных перевозчиков, держим вас в курсе и ведём груз до доставки.')}
}[t]||{eyebrow:__('Перевозчик · грузоперевозки по США'),headline:__('Грузоперевозки, на которые можно положиться'),lead:__('Собственный автопарк, опытные водители и прозрачная связь на каждом рейсе.')});

function services(type,equipment){
 const has=e=>equipment.includes(e),list=[];
 if(type==='dispatch_service')return [
  [Search,__('Поиск грузов'),__('Грузы с площадок и напрямую от брокеров под вашу технику и направления.')],
  [Handshake,__('Переговоры о ставке'),__('Добиваемся лучшей ставки за милю и выгодных условий оплаты.')],
  [FileCheck,__('Документы и оплаты'),__('Rate confirmation, BOL, POD и счета — всё под контролем.')],
  [ShieldCheck,__('Проверка брокеров'),__('Работаем только с проверенными брокерами без истории неоплат.')],
  [Headphones,__('Связь с водителями'),__('На связи на каждом этапе рейса: погрузка, дорога, выгрузка.')]];
 if(type==='broker')list.push([Search,__('Подбор перевозчиков'),__('Находим машину под ваш груз, маршрут и сроки.')],[ShieldCheck,__('Проверка перевозчиков'),__('MC/DOT, страховка и история работы — до подтверждения рейса.')]);
 else list.push([Truck,__('Полная загрузка (FTL)'),__('Машина под ваш груз от погрузки до доставки без перегрузов.')]);
 list.push([Repeat,__('Выделенные линии'),__('Регулярные рейсы по вашим направлениям по согласованному графику.')]);
 if(has('Reefer'))list.push([Snowflake,__('Температурный режим'),__('Рефрижераторы с контролем температуры на всём пути.')]);
 if(has('Flatbed'))list.push([Package,__('Открытые платформы'),__('Стройматериалы, оборудование и грузы, которые грузят сверху или сбоку.')]);
 if(has('Box Truck')||has('Cargo Van'))list.push([Zap,__('Срочная доставка'),__('Небольшие партии и срочные заказы на фургонах.')]);
 if(has('Power Only'))list.push([Truck,'Power Only',__('Тягач с водителем для вашего прицепа.')]);
 if(type==='owner_operator')list.push([UserRound,__('Прямая связь с владельцем'),__('Вы говорите с тем, кто отвечает за груз, — без посредников.')]);
 list.push([Radar,__('Статус и ETA'),__('Сообщаем статус рейса и время прибытия, документы — сразу после доставки.')]);
 return list.slice(0,6);
}
const equipmentText=()=>({'Dry Van':__('Сухие грузы в закрытом прицепе 53 ft.'),Reefer:__('Продукты и грузы с температурным режимом.'),Flatbed:__('Открытая платформа для габаритных грузов.'),'Box Truck':__('Городская и региональная доставка.'),'Cargo Van':__('Срочные небольшие отправки.'),'Power Only':__('Тягач для вашего прицепа.')});

function HeroVisual({l,name}){
 const route='M60 230 C140 160 220 200 290 150 S420 80 510 110';
 const lane=l.lanes?.[0];
 return <div className="clx-visual" aria-hidden="true">
  <svg viewBox="0 0 570 320" className="clx-map">
   <defs><pattern id="clx-dots" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="#ffffff38"/></pattern></defs>
   <path d="M34 110 L112 62 L240 52 L320 34 L410 48 L490 34 L548 82 L534 160 L490 220 L460 290 L410 262 L322 272 L252 292 L192 252 L112 242 L54 202 Z" fill="url(#clx-dots)" stroke="#ffffff45" strokeWidth="1.5"/>
   <path d={route} fill="none" stroke="#ffffff30" strokeWidth="10" strokeLinecap="round"/>
   <path d={route} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray="8 8" className="clx-route"/>
   {[[60,230],[510,110],[180,120],[350,225]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="11" fill="#ffffff26"/><circle cx={x} cy={y} r="5" fill="#fff"/></g>)}
   <g className="clx-truck"><rect x="-17" y="-10" width="34" height="20" rx="6" fill="#fff"/><path d="M-8 0h12m-4-4 4 4-4 4" stroke="var(--brand)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>
  </svg>
  <div className="clx-float clx-float-a"><small>{name}</small><strong>{lane?`${lane.origin.split(',')[0]} → ${lane.destination.split(',')[0]}`:(l.city||__('Перевозки по США'))}</strong><span><i/></span></div>
  {l.equipment?.length>0&&<div className="clx-float clx-float-b"><small>{__('Техника')}</small><strong>{l.equipment.slice(0,2).join(' · ')}</strong><em><CheckCircle2 size={12}/>{__('Готовы к погрузке')}</em></div>}
  {(l.mc||l.dot)&&<div className="clx-float clx-float-c"><small>{l.mc?'MC':'DOT'}</small><strong>{l.mc||l.dot}</strong></div>}
 </div>;
}

export default function CompanyLanding({company,urls}){
 const b=company.brand,l=b.landing,p=typeProfile(l.businessType),eq=l.equipment||[],lanes=l.lanes||[];
 const signIn=(urls?.dash||'')+'/login',tel=l.phone&&'tel:'+l.phone.replace(/[^\d+]/g,''),site=l.website&&(/^https?:\/\//.test(l.website)?l.website:'https://'+l.website);
 const quote=l.email?`mailto:${l.email}?subject=${encodeURIComponent(__('Запрос ставки'))}`:tel;
 const stats=[l.trucks>0&&[l.trucks,__('грузовиков в парке')],!l.trucks&&l.fleetSize&&[label('fleetSize',l.fleetSize),__('размер автопарка')],eq.length>0&&[eq.length,__('типов техники')],lanes.length>0&&[lanes.length,__('выделенных линий')],l.city&&[l.city.split(',')[0],__('база')]].filter(Boolean);
 const svc=services(l.businessType,eq),eqText=equipmentText();
 const nav=[['services',__('Услуги')],eq.length&&['equipment',__('Техника')],lanes.length&&['lanes',__('Линии')],['contact',__('Контакты')]].filter(Boolean);
 return <div className="clx">
  <header className="clx-top"><a className="clx-brand" href="#top">{b.logo?<img src={b.logo} alt={b.name}/>:<><span className="clx-mark"><Route size={18}/></span><strong>{b.name}</strong></>}</a>
   <nav className="clx-nav">{nav.map(([id,t])=><a key={id} href={'#'+id}>{t}</a>)}</nav>
   <div className="clx-top-actions"><LangSwitch/><a className="button secondary clx-signin" href={signIn}><LogIn size={14}/>{__('Войти')}</a></div></header>

  <section className="clx-hero" id="top">
   <div className="clx-hero-copy">
    <span className="clx-eyebrow"><Truck size={14}/>{p.eyebrow}</span>
    <h1>{l.headline||p.headline}</h1>
    <p>{l.description||p.lead}</p>
    <div className="clx-cta">{quote&&<a className="button primary" href={quote}>{__('Запросить ставку')}<ArrowRight size={16}/></a>}{tel&&<a className="button secondary" href={tel}><Phone size={15}/>{l.phone}</a>}</div>
    {(l.mc||l.dot)&&<p className="clx-trust"><ShieldCheck size={14}/>{[l.mc&&`MC ${l.mc}`,l.dot&&`DOT ${l.dot}`].filter(Boolean).join(' · ')}</p>}
   </div>
   <HeroVisual l={l} name={b.name}/>
  </section>

  {stats.length>0&&<section className="clx-stats">{stats.map(([v,t])=><div key={t}><strong>{v}</strong><span>{t}</span></div>)}</section>}

  <section className="clx-section" id="services"><div className="clx-head"><span>{__('Услуги')}</span><h2>{__('Чем мы можем помочь')}</h2></div>
   <div className="clx-services">{svc.map(([Icon,t,d])=><article key={t}><i><Icon size={20}/></i><h3>{t}</h3><p>{d}</p></article>)}</div></section>

  {eq.length>0&&<section className="clx-section" id="equipment"><div className="clx-head"><span>{__('Техника')}</span><h2>{__('Автопарк под ваши грузы')}</h2></div>
   <div className="clx-equipment">{eq.map(e=><article key={e}><Truck size={22}/><div><h3>{e}</h3><p>{eqText[e]||''}</p></div></article>)}</div></section>}

  {lanes.length>0&&<section className="clx-section" id="lanes"><div className="clx-head"><span>{__('Линии')}</span><h2>{__('Регулярные направления')}</h2></div>
   <div className="clx-lanes">{lanes.map((x,i)=><article key={i}><div className="clx-lane-route"><MapPin size={16}/><strong>{x.origin}</strong><ArrowRight size={16}/><strong>{x.destination}</strong></div><span><Navigation size={13}/>{x.equipment}</span><span><CalendarClock size={13}/>{__('{0} рейс(а) в неделю',[x.perWeek])}</span></article>)}</div></section>}

  <section className="clx-section"><div className="clx-head"><span>{__('Как мы работаем')}</span><h2>{__('От запроса до доставки')}</h2></div>
   <ol className="clx-steps">{[[__('Запрос'),__('Расскажите о грузе: маршрут, даты и тип техники.')],[__('Предложение'),__('Подтвердим ставку и время погрузки.')],[__('Перевозка'),__('Держим в курсе: статус и ETA на каждом этапе.')],[__('Доставка'),__('POD и документы сразу после выгрузки.')]].map(([t,d],i)=><li key={t}><b>{i+1}</b><h3>{t}</h3><p>{d}</p></li>)}</ol></section>

  <section className="clx-contact" id="contact"><div><h2>{__('Нужна машина под груз?')}</h2><p>{__('Напишите или позвоните — ответим и предложим ставку.')}</p></div>
   <div className="clx-contact-links">{tel&&<a href={tel}><Phone size={16}/>{l.phone}</a>}{l.email&&<a href={'mailto:'+l.email}><Mail size={16}/>{l.email}</a>}{site&&<a href={site} target="_blank" rel="noreferrer"><Globe size={16}/>{l.website}</a>}{l.city&&<span><MapPin size={16}/>{l.city}</span>}</div></section>

  <footer className="clx-footer"><span>© {new Date().getFullYear()} {b.name}{l.mc?` · MC ${l.mc}`:''}{l.dot?` · DOT ${l.dot}`:''}</span><a href={signIn}>{__('Вход для сотрудников и партнёров')}</a><small>{__('Работает на Lanilot')}</small></footer>
 </div>;
}
