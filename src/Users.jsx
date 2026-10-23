import LoadingBoundary from './Loading.jsx';
import React,{useEffect,useState} from 'react';
import {UserPlus,Copy,Trash2,Users as UsersIcon,Clock} from 'lucide-react';
import {__,translateDeep,fmtDate} from './i18n.js';
import {roleLabel} from './AuthGate.jsx';
import SearchSelect from './SearchSelect.jsx';

const roleKeys=['owner','dispatcher','viewer'];
async function request(path,method='GET',body){const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error?translateDeep(d.error):__('Ошибка сервера'));return d}

// Company members and invitations (owner only).
export default function Users({session,onToast}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[email,setEmail]=useState(''),[role,setRole]=useState('dispatcher'),[link,setLink]=useState(''),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false);
 const load=()=>request('/users').then(setData).catch(e=>setError(e.message));
 useEffect(()=>{load()},[]);
 const act=async(fn,message)=>{setBusy(true);setError('');try{await fn();await load();if(message)onToast(message)}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <LoadingBoundary loadKey="users" busy={!data&&!error}><section className="users-page">
 <section className="panel"><div className="settings-heading" style={{padding:'16px 16px 0'}}><UserPlus size={18}/><div><h2>{__('Пригласить в компанию')}</h2><p>{__('Ссылка действует 7 дней. Отправьте её сотруднику любым удобным способом.')}</p></div></div>
  <form className="users-invite" onSubmit={async e=>{e.preventDefault();await act(async()=>{const r=await request('/users/invites','POST',{email,role});setLink(window.location.origin+r.path);setEmail('')},__('Приглашение создано'))}}>
   <label className="form-label">Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="dispatcher@company.com"/></label>
   <label className="form-label">{__('Роль')}<SearchSelect aria-label={__('Роль')} value={role} onChange={e=>setRole(e.target.value)}>{roleKeys.map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}</SearchSelect></label>
   <button className="button primary" disabled={busy}><UserPlus size={14}/>{__('Создать приглашение')}</button>
  </form>
  {link&&<div className="users-link"><code>{link}</code><button className="button secondary tiny" onClick={async()=>{try{await navigator.clipboard.writeText(link);onToast(__('Ссылка скопирована'))}catch{onToast(__('Скопируйте ссылку вручную'))}}}><Copy size={12}/>{__('Скопировать')}</button></div>}
 </section>
 {error&&<p className="chat-error" role="alert">{error}</p>}
 {data&&<section className="panel"><div className="dense-table-wrap"><table className="dense-table users-table"><thead><tr><th>{__('Пользователь')}</th><th>Email</th><th>{__('Роль')}</th><th>{__('В компании с')}</th><th/></tr></thead><tbody>
  {data.members.map(m=><tr key={m.id}><td><strong>{m.name}</strong>{m.id===session.user?.id&&<small> · {__('это вы')}</small>}</td><td className="muted">{m.email}</td>
   <td className="users-role"><SearchSelect aria-label={__('Роль пользователя {0}',[m.name])} value={m.role} disabled={busy} onChange={e=>act(()=>request('/users/'+m.id,'PATCH',{role:e.target.value}),__('Роль изменена'))}>{roleKeys.map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}</SearchSelect></td>
   <td className="muted">{fmtDate(m.created_at,{day:'numeric',month:'short',year:'numeric'},'date')}</td>
   <td className="row-actions">{confirm===m.id?<span className="lane-confirm">{__('Удалить из компании?')}<button className="text-button danger" disabled={busy} onClick={()=>{setConfirm(null);act(()=>request('/users/'+m.id,'DELETE'),__('Пользователь удалён из компании'))}}>{__('Да')}</button><button className="text-button" onClick={()=>setConfirm(null)}>{__('Нет')}</button></span>:<button className="icon-button" aria-label={__('Удалить {0} из компании',[m.name])} disabled={busy} onClick={()=>setConfirm(m.id)}><Trash2 size={14}/></button>}</td></tr>)}
 </tbody></table></div><div className="pagination"><span><UsersIcon size={12}/> {data.members.length}</span><span className="toolbar-muted">{__('Владелец — всё, включая настройки и пользователей · Диспетчер — работа с грузами и рейсами · Наблюдатель — только просмотр')}</span></div></section>}
 {data?.invites.length>0&&<section className="panel"><div className="dense-table-wrap"><table className="dense-table"><thead><tr><th>{__('Ожидают принятия')}</th><th>{__('Роль')}</th><th>{__('Действует до')}</th><th/></tr></thead><tbody>
  {data.invites.map(i=><tr key={i.id}><td><Clock size={12}/> {i.email}</td><td>{roleLabel(i.role)}</td><td className="muted">{fmtDate(i.expires_at,{day:'numeric',month:'short'},'date')}</td><td className="row-actions"><button className="text-button danger" disabled={busy} onClick={()=>act(()=>request('/users/invites/'+i.id,'DELETE'),__('Приглашение отозвано'))}>{__('Отозвать')}</button></td></tr>)}
 </tbody></table></div></section>}
 </section></LoadingBoundary>;
}
