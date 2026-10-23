export const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
export const number=v=>new Intl.NumberFormat('en-US').format(v);
export const date=v=>new Date(v+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
export const offerLabels={draft:'Черновик',awaiting:'Ожидает ответа',accepted:'Подтверждено',rejected:'Отклонено',cancelled:'Отменено'};
export const tripLabels={planned:'Запланирован',in_transit:'В пути',delivered:'Доставлен',completed:'Завершён',cancelled:'Отменён'};
export const nextStatus={planned:'in_transit',in_transit:'delivered',delivered:'completed'};
export const nextLabel={planned:'Начать рейс',in_transit:'Отметить доставку',delivered:'Завершить рейс'};
export const factor={approved:['Одобрен','green'],unknown:['Нет данных','gray'],declined:['Отказ','red']};

export const counted=(n,one,few,many)=>`${n} ${n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many}`;
