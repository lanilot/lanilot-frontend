import LoadingBoundary from './Loading.jsx';
import React,{useEffect,useState} from 'react';
import {UserPlus,Trash2,Users as UsersIcon,Clock,IdCard} from 'lucide-react';
import StaffModal from './StaffModal.jsx';
import {__,translateDeep,fmtDate} from './i18n.js';
import {roleLabel} from './AuthGate.jsx';
import SearchSelect from './SearchSelect.jsx';

const roleKeys=['owner','dispatcher','updater','viewer'];
async function request(path,method='GET',body){const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error?translateDeep(d.error):__('Ошибка сервера'));return d}

// Who does what: the dispatcher books loads and runs them until pickup, the updater keeps the broker posted after that.
const roleDuties={owner:__('Всё, включая настройки, интеграции и пользователей.'),dispatcher:__('Договаривается о ставке и бронирует грузы, предлагает их водителям и ведёт рейс до погрузки.'),updater:__('После погрузки держит брокера в курсе: ETA водителя, пробки, поломка машины, здоровье водителя. Сообщает по email, Microsoft Teams и Telegram.'),viewer:__('Только просмотр.')};
// Company members and invitations (owner only).
export default function Users({session,onToast}){
 const [data,setData]=useState(null),[staff,setStaff]=useState([]),[error,setError]=useState(''),[modal,setModal]=useState(null),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false);
 const load=()=>Promise.all([request('/users'),request('/users/staff')]).then(([d,s])=>{setData(d);setStaff(s)}).catch(e=>setError(e.message));
 const card=email=>staff.find(s=>s.email.toLowerCase()===email.toLowerCase());
 const fullName=c=>[c.lastName,c.firstName].join(' ');
 const cardButton=(email,member)=>{const c=card(email);return <button className="icon-button" title={c?__('Карточка сотрудника'):__('Заполнить данные сотрудника')} aria-label={(c?__('Карточка сотрудника'):__('Заполнить данные сотрудника'))+' '+email} onClick={()=>setModal(c?{id:c.id}:{email,member})}><IdCard size={15}/></button>};
 useEffect(()=>{load()},[]);
 const act=async(fn,message)=>{setBusy(true);setError('');try{await fn();await load();if(message)onToast(message)}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <LoadingBoundary loadKey="users" busy={!data&&!error}><section className="users-page">
 <section className="panel users-toolbar"><div className="settings-heading"><UsersIcon size={18}/><div><h2>{__('Сотрудники и доступ')}</h2><p>{__('Карточки сотрудников с документами и приглашения в кабинет.')}</p></div></div><button className="button primary" onClick={()=>setModal({})}><UserPlus size={14}/>{__('Пригласить')}</button></section>
 {error&&<p className="chat-error" role="alert">{error}</p>}
 {data&&<section className="panel"><div className="dense-table-wrap"><table className="dense-table users-table"><thead><tr><th>{__('Пользователь')}</th><th>Email</th><th>{__('Роль')}</th><th>{__('В компании с')}</th><th/></tr></thead><tbody>
  {data.members.map(m=><tr key={m.id}><td><strong>{card(m.email)?fullName(card(m.email)):m.name}</strong>{m.id===session.user?.id&&<small> · {__('это вы')}</small>}{card(m.email)?.position&&<small className="users-position">{card(m.email).position}</small>}</td><td className="muted">{m.email}</td>
   <td className="users-role"><SearchSelect aria-label={__('Роль пользователя {0}',[m.name])} value={m.role} disabled={busy} onChange={e=>act(()=>request('/users/'+m.id,'PATCH',{role:e.target.value}),__('Роль изменена'))}>{roleKeys.map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}</SearchSelect></td>
   <td className="muted">{fmtDate(m.created_at,{day:'numeric',month:'short',year:'numeric'},'date')}</td>
   <td className="row-actions">{cardButton(m.email,true)}{confirm===m.id?<span className="lane-confirm">{__('Удалить из компании?')}<button className="text-button danger" disabled={busy} onClick={()=>{setConfirm(null);act(()=>request('/users/'+m.id,'DELETE'),__('Пользователь удалён из компании'))}}>{__('Да')}</button><button className="text-button" onClick={()=>setConfirm(null)}>{__('Нет')}</button></span>:<button className="icon-button" aria-label={__('Удалить {0} из компании',[m.name])} disabled={busy} onClick={()=>setConfirm(m.id)}><Trash2 size={14}/></button>}</td></tr>)}
 </tbody></table></div><div className="pagination"><span><UsersIcon size={12}/> {data.members.length}</span></div><dl className="role-guide">{roleKeys.map(r=><div key={r}><dt>{roleLabel(r)}</dt><dd>{roleDuties[r]}</dd></div>)}</dl></section>}
 {data?.invites.length>0&&<section className="panel"><div className="dense-table-wrap"><table className="dense-table"><thead><tr><th>{__('Ожидают принятия')}</th><th>{__('Роль')}</th><th>{__('Действует до')}</th><th/></tr></thead><tbody>
  {data.invites.map(i=><tr key={i.id}><td><Clock size={12}/> {card(i.email)?<><strong>{fullName(card(i.email))}</strong> · </>:null}{i.email}</td><td>{roleLabel(i.role)}</td><td className="muted">{fmtDate(i.expires_at,{day:'numeric',month:'short'},'date')}</td><td className="row-actions">{cardButton(i.email,false)}<button className="text-button danger" disabled={busy} onClick={()=>act(()=>request('/users/invites/'+i.id,'DELETE'),__('Приглашение отозвано'))}>{__('Отозвать')}</button></td></tr>)}
 </tbody></table></div></section>}
 {modal&&<StaffModal {...modal} onClose={()=>{setModal(null);load()}} onDone={message=>{if(message){setModal(null);onToast(message)}load()}}/>}
 </section></LoadingBoundary>;
}
