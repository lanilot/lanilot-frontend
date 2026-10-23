import {__,lang,fmtDate} from './i18n.js';
export const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
export const number=v=>new Intl.NumberFormat('en-US').format(v);
export const date=v=>fmtDate(new Date(v+'T12:00:00'),{day:'numeric',month:'short'},'date');
export const offerLabels={draft:__("Черновик"),awaiting:__("Ожидает ответа"),accepted:__("Подтверждено"),rejected:__("Отклонено"),cancelled:__("Отменено")};
export const tripLabels={planned:__("Запланирован"),in_transit:__("В пути"),delivered:__("Доставлен"),completed:__("Завершён"),cancelled:__("Отменён")};
export const nextStatus={planned:'in_transit',in_transit:'delivered',delivered:'completed'};
export const nextLabel={planned:__("Начать рейс"),in_transit:__("Отметить доставку"),delivered:__("Завершить рейс")};
export const factor={approved:[__("Одобрен"),'green'],unknown:[__("Нет данных"),'gray'],declined:[__("Отказ"),'red']};

// Number + noun. Russian needs three forms; other languages use singular for 1 (French also for 0) and the plural form otherwise.
export const counted=(n,one,few,many)=>`${n} ${lang==='ru'?(n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many):(n===1||lang==='fr'&&n===0?one:many)}`;

// Broker registry record for a load's broker name (DNU, FreightGuard, factoring).
export const brokerRecord=(state,name,type='broker')=>state.brokers?.find(b=>b.type===type&&b.name.trim().toLowerCase()===String(name||'').trim().toLowerCase())??null;
// Trip economics use the assigned driver's own per-mile pay when it is set in the fleet.
export const driverRecord=(state,name)=>state.drivers?.find(d=>d.name.trim().toLowerCase()===String(name||'').trim().toLowerCase())??null;
export const tripCosts=(t,state)=>{const pay=driverRecord(state,t.driver)?.pay_per_mile;return pay?{...t.offer.costs,driverPerMile:pay}:t.offer.costs};
