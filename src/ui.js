export const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
export const number=v=>new Intl.NumberFormat('en-US').format(v);
export const date=v=>new Date(v+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
export const offerLabels={draft:'Черновик',awaiting:'Ожидает ответа',accepted:'Подтверждено',rejected:'Отклонено',cancelled:'Отменено'};
export const tripLabels={planned:'Запланирован',in_transit:'В пути',delivered:'Доставлен',completed:'Завершён',cancelled:'Отменён'};
export const nextStatus={planned:'in_transit',in_transit:'delivered',delivered:'completed'};
export const nextLabel={planned:'Начать рейс',in_transit:'Отметить доставку',delivered:'Завершить рейс'};
export const factor={approved:['Одобрен','green'],unknown:['Нет данных','gray'],declined:['Отказ','red']};

export const counted=(n,one,few,many)=>`${n} ${n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many}`;

// Broker registry record for a load's broker name (DNU, FreightGuard, factoring).
export const brokerRecord=(state,name,type='broker')=>state.brokers?.find(b=>b.type===type&&b.name.trim().toLowerCase()===String(name||'').trim().toLowerCase())??null;
// Trip economics use the assigned driver's own per-mile pay when it is set in the fleet.
export const driverRecord=(state,name)=>state.drivers?.find(d=>d.name.trim().toLowerCase()===String(name||'').trim().toLowerCase())??null;
export const tripCosts=(t,state)=>{const pay=driverRecord(state,t.driver)?.pay_per_mile;return pay?{...t.offer.costs,driverPerMile:pay}:t.offer.costs};
