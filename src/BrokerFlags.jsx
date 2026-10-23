import React from 'react';
import {ShieldX,AlertTriangle,ShieldCheck} from 'lucide-react';
import {brokerRecord,counted} from './ui.js';
// Compact chips for tables/cards, or a full warning block for the load card.
export default function BrokerFlags({state,name,full=false,onCheck}){
 const b=brokerRecord(state,name);
 if(!b||!b.dnu&&!b.freightguard)return full&&onCheck?<button type="button" className="text-button broker-check-link" onClick={()=>onCheck(name)}><ShieldCheck size={13}/>Проверить брокера через факторинг</button>:null;
 if(!full)return <span className="broker-flags">{b.dnu&&<span className="broker-flag dnu" title={'DNU: '+b.dnu_reason}><ShieldX size={11}/>DNU</span>}{b.freightguard>0&&<span className="broker-flag fg" title={'FreightGuard: '+b.freightguard_note}><AlertTriangle size={11}/>FG {b.freightguard}</span>}</span>;
 return <div className="broker-warning" role="alert">{b.dnu&&<p><ShieldX size={15}/><span><strong>Брокер в вашем списке DNU</strong>{b.dnu_reason}</span></p>}{b.freightguard>0&&<p><AlertTriangle size={15}/><span><strong>FreightGuard: {counted(b.freightguard,'жалоба','жалобы','жалоб')}</strong>{b.freightguard_note}</span></p>}{onCheck&&<button type="button" className="text-button" onClick={()=>onCheck(name)}><ShieldCheck size={13}/>Открыть проверку брокера</button>}</div>;
}
