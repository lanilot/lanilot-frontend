import React,{useEffect,useState} from 'react';
import {LayoutDashboard,Boxes,Handshake,Fuel,ShieldCheck,Smartphone,Lock,Check,ArrowRight,ArrowLeft,LogOut,Clock,Sparkles} from 'lucide-react';
import {__,translateDeep} from './i18n.js';
import LogoMark from './LogoMark.jsx';
import BrandLogo,{hasBrandLogo,PoweredBy} from './BrandLogo.jsx';
import LangSwitch from './LangSwitch.jsx';
import './products.css';

// Names, descriptions and icons of the products (prices and access come from /api/products).
export const productMeta=id=>({
 dash:{name:__('Диспетчерская'),text:__('Грузы, рейсы, брокеры, автопарк и финансы рейсов'),icon:LayoutDashboard,tone:'#2563eb'},
 erp:{name:'ERP',text:__('Бухгалтерия, счета, расходы и отчёты компании'),icon:Boxes,tone:'#7c3aed'},
 crm:{name:'CRM',text:__('Брокеры, грузоотправители, сделки и история общения'),icon:Handshake,tone:'#0f766e'},
 fuel:{name:__('Топливный отдел'),text:__('Топливные карты, заправки, расход и IFTA'),icon:Fuel,tone:'#c2410c'},
 safety:{name:__('Безопасность'),text:__('Документы водителей, инспекции, ДТП и соответствие FMCSA'),icon:ShieldCheck,tone:'#be123c'},
 driver:{name:__('Приложение водителя'),text:__('Рейсы, документы и связь с диспетчером в телефоне'),icon:Smartphone,tone:'#0369a1'},
})[id]??{name:id,text:'',icon:Boxes,tone:'#2563eb'};
const api=async(path,body)=>{const r=await fetch('/api'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(data.error?translateDeep(data.error):__('Ошибка сервера')),{data});return data};
const signOut=async()=>{await fetch('/api/auth/logout',{method:'POST'});window.location.replace('/')};
const money=n=>'$'+n.toLocaleString('en-US');

function Top({company,user}){
 return <header className="pp-top"><div className="pp-brand">{hasBrandLogo(company?.brand)?<BrandLogo src={company.brand.logo} text={company.brand.logoText} alt={company.brand.name}/>:<><span className="sidebar-logo"><LogoMark/></span><strong>{company?.brand?.name||company?.name||'Lanilot'}</strong></>}</div>
  <div className="pp-top-right"><LangSwitch/>{user&&<span className="pp-user">{user.name}</span>}<button type="button" className="pp-link" onClick={signOut}><LogOut size={15}/>{__('Выйти')}</button></div></header>;
}

// Required after every sign-in: which Lanilot product to open. Products the company has not bought show plans to
// the owner and "ask your administrator" to everyone else; the company's access is what all its members get.
export function ProductPicker({session,locked,autoEnter,onEnter}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[open,setOpen]=useState(null),[going,setGoing]=useState(null),[sent,setSent]=useState(null),[busy,setBusy]=useState(false);
 const load=()=>api('/products').then(setData).catch(e=>setError(e.message));
 useEffect(()=>{load()},[]);
 // The list (/products) and each product's plans (/products/<id>) are browser history entries. A guard entry under the
 // list keeps Back on the list instead of returning to the sign-in provider's pages.
 useEffect(()=>{
  const initial=locked||window.location.pathname.match(/^\/products\/([a-z]+)\/?$/)?.[1]||null;
  window.history.replaceState({pp:'guard'},'','/products');window.history.pushState({pp:'list'},'','/products');
  if(initial){window.history.pushState({pp:initial},'','/products/'+initial);setOpen(initial)}
  const back=e=>{const s=e.state?.pp;if(s==='guard'){window.history.pushState({pp:'list'},'','/products');setOpen(null)}else if(s){setOpen(s==='list'?null:s);setSent(null)}};
  window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);
 },[]);
 const show=id=>{window.history.pushState({pp:id},'','/products/'+id);setOpen(id)};
 const leave=id=>{window.history.replaceState(null,'','/');onEnter(id)};
 // Opens a product the company has: on this host, or via a one-time handoff to <product>.<company>.<domain>
 // (its HTTPS address may still be getting ready right after the company is created).
 const enter=async id=>{setError('');setGoing(id);
  for(let i=0;i<60;i++){try{const r=await api('/products/choose',{product:id});if(r.url)return window.location.replace(r.url);if(!r.pending){setGoing(null);return leave(id)}}catch(e){setGoing(null);if(e.data?.code==='no_access')return show(id);return setError(e.message)}await new Promise(r=>setTimeout(r,3000))}
  setGoing(null);setError(__('Адрес продукта ещё готовится. Попробуйте через минуту.'))};
 useEffect(()=>{if(autoEnter&&data)enter(autoEnter)},[autoEnter,!!data]);
 const buy=async(product,plan)=>{setBusy(true);setError('');try{await api('/products/request',{product,plan});setSent({product,plan});await load()}catch(e){setError(e.message)}setBusy(false)};
 const company=session?.company,products=data?.products??[],selected=products.find(p=>p.id===open),meta=selected&&productMeta(selected.id);
 if(going)return <div className="pp-page"><Top company={company} user={session?.user}/><main className="pp-main pp-going"><div className="auth-loading" aria-label={__('Загрузка')}/><h1>{__('Открываем «{0}»',[productMeta(going).name])}</h1><p>{__('Переходим на адрес {0}…',[`${going}.${company?.slug}`])}</p>
  {going==='dash'&&<button type="button" className="pp-link" onClick={()=>{try{sessionStorage.setItem('lanilot-stay-on-app','1')}catch{}setGoing(null);leave('dash')}}>{__('Остаться на app.lanilot.com')}</button>}</main></div>;
 return <div className="pp-page"><Top company={company} user={session?.user}/>
  <main className="pp-main">
   {!selected?<>
    <h1>{__('Куда вы хотите войти?')}</h1><p className="pp-lead">{__('Выберите продукт Lanilot для компании {0}.',[company?.name??''])}</p>
    {error&&<p className="pp-error" role="alert">{error}</p>}
    {!data&&!error?<div className="pp-grid">{Array.from({length:6},(_,i)=><div key={i} className="pp-card pp-skeleton"/>)}</div>:
    <div className="pp-grid">{products.map(p=>{const m=productMeta(p.id),Icon=m.icon;return <button type="button" key={p.id} className={'pp-card'+(p.access?'':' is-locked')} style={{'--tone':m.tone}} onClick={()=>p.access?enter(p.id):show(p.id)} aria-label={m.name+' — '+(p.access?(p.live?__('Подключено'):__('Подключено · скоро')):__('Не подключено'))}>
     <span className="pp-icon"><Icon size={22}/></span><strong>{m.name}</strong><span className="pp-text">{m.text}</span>
     <span className={'pp-chip'+(p.access?' is-on':'')}>{p.access?<><Check size={12}/>{p.live?__('Подключено'):__('Подключено · скоро')}</>:p.requested?<><Clock size={12}/>{__('Заявка отправлена')}</>:<><Lock size={12}/>{__('Не подключено')}</>}</span>
     {p.access&&<ArrowRight className="pp-go" size={18}/>}
    </button>})}</div>}
   </>:<section className="pp-detail" style={{'--tone':meta.tone}}>
    <button type="button" className="pp-link pp-back" onClick={()=>window.history.back()}><ArrowLeft size={15}/>{__('Все продукты')}</button>
    <span className="pp-icon big"><meta.icon size={26}/></span><h1>{meta.name}</h1><p className="pp-lead">{meta.text}</p>
    {error&&<p className="pp-error" role="alert">{error}</p>}
    {!data.canBuy?<div className="pp-locked"><Lock size={18}/><div><strong>{__('У вашей компании нет доступа к этому продукту')}</strong><p>{data.owner?__('Обратитесь к администратору компании: {0} ({1}).',[data.owner.name,data.owner.email]):__('Обратитесь к администратору компании.')}</p></div></div>:
    sent?.product===selected.id||selected.requested?<div className="pp-sent"><Check size={18}/><div><strong>{__('Заявка на подключение отправлена')}</strong><p>{__('Мы пришлём счёт на почту владельца и откроем «{0}» для всех сотрудников сразу после оплаты.',[meta.name])}</p></div></div>:
    <><h2>{__('Выберите тариф')}</h2><div className="pp-plans">{['starter','pro','enterprise'].map(plan=>{const limits=data.plans[plan];return <article key={plan} className={'pp-plan'+(plan==='pro'?' is-best':'')}>
      {plan==='pro'&&<span className="pp-best"><Sparkles size={12}/>{__('Популярный')}</span>}<h3>{limits.name}</h3><p className="pp-price"><strong>{money(selected.prices[plan])}</strong><span>{__('/ мес')}</span></p>
      <ul><li><Check size={14}/>{limits.trucks?__('До {0} грузовиков',[limits.trucks]):__('Без ограничений по грузовикам')}</li><li><Check size={14}/>{limits.users?__('До {0} пользователей',[limits.users]):__('Без ограничений по пользователям')}</li><li><Check size={14}/>{__('Доступ для всех сотрудников компании')}</li></ul>
      <button type="button" className="pp-pay" disabled={busy} onClick={()=>buy(selected.id,plan)}>{__('Оплатить')}</button></article>})}</div>
     <p className="pp-note">{__('После оплаты продукт откроется для вас и всех сотрудников компании.')}</p></>}
   </section>}
  </main><footer className="pp-footer footer-powered"><PoweredBy/></footer></div>;
}

// Products that are not built yet: an animated "coming soon" page on their own address.
export function ComingSoon({session,product}){
 const m=productMeta(product),Icon=m.icon;
 const other=async()=>{await fetch('/api/products/reset',{method:'POST'});window.location.reload()};
 return <div className="cs-page" style={{'--tone':m.tone}}>
  <div className="cs-sky" aria-hidden="true"><i/><i/><i/><span className="cs-ring r1"/><span className="cs-ring r2"/><span className="cs-ring r3"/>{Array.from({length:14},(_,i)=><b key={i} style={{'--i':i}}/>)}</div>
  <Top company={session?.company} user={session?.user}/>
  <main className="cs-main"><span className="cs-icon"><Icon size={34}/></span>
   <p className="cs-kicker">{m.name}</p><h1 className="cs-title">{__('Скоро')}</h1>
   <p className="cs-text">{__('Мы готовим «{0}» для компании {1}. Как только продукт будет готов, он откроется по этому адресу.',[m.name,session?.company?.name??''])}</p>
   <div className="cs-progress" aria-hidden="true"><span/></div>
   <button type="button" className="cs-button" onClick={other}><ArrowLeft size={16}/>{__('Выбрать другой продукт')}</button>
  </main><footer className="cs-footer footer-powered"><PoweredBy/></footer></div>;
}
