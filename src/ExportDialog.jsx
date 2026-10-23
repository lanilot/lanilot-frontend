import {__} from './i18n.js';
import React,{useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {Download,X,FileSpreadsheet,FileText} from 'lucide-react';
import useDialog from './useDialog.js';
import {calculateProfit} from '../server/domain.js';
import {money,counted,tripLabels,brokerRecord,tripCosts} from './ui.js';
import {toCSV,toXLSX,download} from './export.js';

const iso=d=>d.toISOString().slice(0,10);
const year=new Date().getFullYear();
const presets=[['year',__("Этот год"),`${year}-01-01`,`${year}-12-31`],['last',__("Прошлый год"),`${year-1}-01-01`,`${year-1}-12-31`],['quarter',__("Этот квартал"),iso(new Date(Date.UTC(year,Math.floor(new Date().getMonth()/3)*3,1))),iso(new Date(Date.UTC(year,Math.floor(new Date().getMonth()/3)*3+3,0)))],['all',__("Всё время"),'','']];
const round=v=>Math.round(v*100)/100;

// Trip history for taxes (actual amounts from Finances where saved) or the current load board.
export default function ExportDialog({state,boardRows,onClose}){
 useDialog(true,onClose);
 const [scope,setScope]=useState('history'),[preset,setPreset]=useState('year'),[from,setFrom]=useState(presets[0][2]),[to,setTo]=useState(presets[0][3]),[includeOpen,setIncludeOpen]=useState(false),[format,setFormat]=useState('xlsx'),[error,setError]=useState('');
 const pick=key=>{const p=presets.find(x=>x[0]===key);setPreset(key);setFrom(p[2]);setTo(p[3])};
 const finances=useMemo(()=>Object.fromEntries((state.finances||[]).map(f=>[f.tripId,f])),[state.finances]);
 const trips=state.trips.filter(t=>t.status!=='cancelled'&&(includeOpen||['delivered','completed'].includes(t.status))).filter(t=>(!from||t.load.delivery>=from)&&(!to||t.load.delivery<=to)).sort((a,b)=>a.load.delivery.localeCompare(b.load.delivery));
 const historyColumns=[[__("Груз"),'text'],[__("Дата погрузки"),'date'],[__("Дата доставки"),'date'],[__("Статус"),'text'],[__("Откуда"),'text'],[__("Куда"),'text'],[__("Техника"),'text'],[__("Брокер"),'text'],[__("MC брокера"),'text'],[__("Источник груза"),'text'],[__("Водитель"),'text'],[__("Машина"),'text'],[__("Мили с грузом"),'int'],[__("Пустой пробег (DH)"),'int'],[__("Всего миль"),'int'],[__("Доход"),'money'],[__("Топливо"),'money'],[__("Оплата водителя"),'money'],[__("Платные дороги"),'money'],[__("Факторинг"),'money'],[__("Прочие расходы"),'money'],[__("Все расходы"),'money'],[__("Прибыль"),'money'],[__("Номер счёта"),'text'],[__("Статус оплаты"),'text'],[__("Оплачено"),'money'],[__("Задолженность"),'money'],[__("Суммы"),'text']];
 const historyRows=trips.map(t=>{const f=finances[t.id],c=calculateProfit(t.offer.rate,t.load.miles,t.load.deadhead,tripCosts(t,state)),actual=f&&!f.estimated;
  const v=f?{income:f.income,fuel:f.fuel,driver:f.driver,tolls:f.tolls,factoring:f.factoring,other:f.other,expenses:f.expenses,profit:f.profit,paid:f.paidAmount,outstanding:f.outstanding}:{income:t.offer.rate,fuel:c.fuel,driver:c.driver,tolls:t.offer.costs.tolls,factoring:c.factoring,other:t.offer.costs.other,expenses:c.expenses,profit:c.profit,paid:0,outstanding:t.offer.rate};
  return [t.load.id,t.load.pickup,t.load.delivery,tripLabels[t.status],t.load.origin,t.load.destination,t.load.equipment,t.load.broker,brokerRecord(state,t.load.broker)?.mc||'',t.load.source,t.driver,t.truck,t.load.miles,t.load.deadhead,t.load.miles+t.load.deadhead,round(v.income),round(v.fuel),round(v.driver),round(v.tolls),round(v.factoring),round(v.other),round(v.expenses),round(v.profit),f?.invoice||'',f?state.paymentStatuses?.[f.paymentStatus]??f.paymentStatus:'',round(v.paid),round(v.outstanding),actual?__("Фактические"):__("Расчётные")]});
 const boardColumns=[[__("Груз"),'text'],[__("Источник"),'text'],[__("Возраст, мин"),'int'],[__("Дата погрузки"),'date'],[__("Откуда"),'text'],[__("Куда"),'text'],[__("Техника"),'text'],[__("Мили"),'int'],['DH','int'],[__("Ставка"),'money'],['RPM','number'],[__("Расчётная прибыль"),'money'],[__("Брокер"),'text'],[__("Факторинг"),'text'],['DNU / FreightGuard','text']];
 const boardData=boardRows.map(l=>{const c=calculateProfit(l.rate,l.miles,l.deadhead,state.defaultCosts),b=brokerRecord(state,l.broker);return [l.id,l.source,l.age,l.pickup,l.origin,l.destination,l.equipment,l.miles,l.deadhead,l.rate,round(c.rpm),round(c.profit),l.broker,{approved:__("Одобрен"),unknown:__("Нет данных"),declined:__("Отказ")}[l.factoring],[b?.dnu&&'DNU',b?.freightguard>0&&'FreightGuard '+b.freightguard].filter(Boolean).join(', ')]});
 const columns=(scope==='history'?historyColumns:boardColumns).map(([label,type])=>({label,type}));
 const rows=scope==='history'?historyRows:boardData;
 const totals=scope==='history'?[12,13,14,15,16,17,18,19,20,21,22,25,26]:[];
 const sum=i=>historyRows.reduce((n,r)=>n+r[i],0);
 const save=()=>{
  setError('');if(!rows.length){setError(__("Нет данных за выбранный период"));return}
  if(from&&to&&to<from){setError(__("Дата окончания раньше начала"));return}
  const stamp=scope==='history'?`lanilot-trips-${from||'start'}_${to||iso(new Date())}`:`lanilot-loads-${iso(new Date())}`;
  if(format==='csv')download(stamp+'.csv',toCSV(columns,rows),'text/csv;charset=utf-8');
  else download(stamp+'.xlsx',toXLSX(columns,rows,{sheetName:scope==='history'?'Trips':'Loads',totals,totalsLabel:__("Итого")}),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  onClose();
 };
 return createPortal(<div className="load-filters-backdrop" onClick={onClose}><section className="load-filters-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={e=>e.stopPropagation()}><header><span className="load-filters-symbol"><Download size={19}/></span><h2 id="export-title">{__("Экспорт в Excel / CSV")}</h2><button className="icon-button" aria-label={__("Закрыть экспорт")} onClick={onClose}><X size={19}/></button></header>
 <form onSubmit={e=>{e.preventDefault();save()}}><div className="load-filters-body">
  <fieldset className="export-choice"><legend>{__("Данные")}</legend>{[['history',__("История рейсов"),__("Для налогов и бухгалтерии: доход, расходы, прибыль, оплата")],['board',__("Грузы на доске"),counted(boardRows.length,__("груз"),__("груза"),__("грузов"))+__(" по текущим фильтрам")]].map(([key,label,hint])=><label key={key} className={scope===key?'active':''}><input type="radio" name="scope" value={key} checked={scope===key} onChange={()=>setScope(key)}/><span><strong>{label}</strong><small>{hint}</small></span></label>)}</fieldset>
  {scope==='history'&&<><fieldset className="export-choice compact"><legend>{__("Период по дате доставки")}</legend>{presets.map(([key,label])=><label key={key} className={preset===key?'active':''}><input type="radio" name="preset" checked={preset===key} onChange={()=>pick(key)}/><span><strong>{label}</strong></span></label>)}</fieldset>
  <div className="load-filter-grid"><label>{__("С")}<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPreset('custom')}}/></label><label>{__("По")}<input type="date" value={to} onChange={e=>{setTo(e.target.value);setPreset('custom')}}/></label></div>
  <div className="load-filter-checks"><label><input type="checkbox" checked={includeOpen} onChange={e=>setIncludeOpen(e.target.checked)}/>{__("Включить рейсы в работе (запланированные и в пути)")}</label></div>
  <div className="export-summary"><span>{counted(historyRows.length,__("рейс"),__("рейса"),__("рейсов"))}</span><span>{__("Доход")} <strong>{money(sum(15))}</strong></span><span>{__("Расходы")} <strong>{money(sum(21))}</strong></span><span>{__("Прибыль")} <strong>{money(sum(22))}</strong></span></div>
  <p className="detail-disclaimer">{__("Суммы берутся из раздела «Финансы», если они сохранены; иначе — расчёт по ставке и расходам. Отменённые рейсы не включаются.")}</p></>}
  <fieldset className="export-choice compact"><legend>{__("Формат")}</legend>{[['xlsx','Excel (.xlsx)',FileSpreadsheet],['csv','CSV',FileText]].map(([key,label,Icon])=><label key={key} className={format===key?'active':''}><input type="radio" name="format" checked={format===key} onChange={()=>setFormat(key)}/><span><strong><Icon size={14}/>{label}</strong></span></label>)}</fieldset>
  {error&&<p className="chat-error" role="alert">{error}</p>}
 </div><footer><span>{counted(rows.length,__("строка"),__("строки"),__("строк"))}</span><button type="submit" className="button primary"><Download size={14}/>{__("Скачать")}</button></footer></form></section></div>,document.body);
}
