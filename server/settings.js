import {defaultCosts,calculateProfit} from './domain.js';
export const defaultSettings={company:{name:'Lanilot Cargo',contactName:'Alex Dispatch',email:'dispatch@example.com',phone:'+1 312 555 0100',city:'Chicago, IL',timezone:'America/Chicago'},costs:{...defaultCosts}};
export const timezones=['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Asia/Tashkent','UTC'];
export function validateSettings(body){
 const company=body?.company,costs=body?.costs;
 if(!company||!costs)throw Error('Заполните профиль и расходы');
 const limits={name:120,contactName:100,email:160,phone:40,city:100,timezone:60},clean={};
 for(const [key,max] of Object.entries(limits)){if(typeof company[key]!=='string'||company[key].trim().length>max)throw Error('Проверьте поля профиля');clean[key]=company[key].trim()}
 if(!clean.name)throw Error('Укажите название компании');
 if(clean.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email))throw Error('Укажите корректный email');
 if(!timezones.includes(clean.timezone))throw Error('Выберите часовой пояс из списка');
 const normalized=Object.fromEntries(Object.keys(defaultCosts).map(k=>[k,costs[k]]));calculateProfit(1000,100,0,normalized);
 if(normalized.fuelPrice>100||normalized.mpg>100||normalized.driverPerMile>100||normalized.tolls>100000||normalized.other>100000)throw Error('Проверьте допустимые пределы расходов');
 return {company:clean,costs:normalized};
}
