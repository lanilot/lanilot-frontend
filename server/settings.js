import {defaultCosts,calculateProfit} from './domain.js';
import {onboardingOptions} from './onboarding.js';
import {defaultBranding,validateBranding} from './branding.js';
// Company-wide settings: profile and requisites, fleet and workflow (pre-filled from sign-up) and trip costs.
export const companyProfileFields={name:120,legalName:160,businessType:40,mc:10,dot:10,contactName:100,email:160,phone:40,website:200,address:200,city:100,timezone:60};
export const defaultSettings={company:{name:'Lanilot Cargo',legalName:'',businessType:'fleet',mc:'',dot:'',contactName:'Alex Dispatch',email:'dispatch@example.com',phone:'+1 312 555 0100',website:'',address:'',city:'Chicago, IL',timezone:'America/Chicago'},operations:{fleetSize:'',equipment:[],loadBoards:[],eld:'',goals:[]},branding:{...defaultBranding},costs:{...defaultCosts}};
// Older rows lack the newer fields; missing ones read as empty, not as demo values.
export const normalizeSettings=s=>({...s,company:{...Object.fromEntries(Object.keys(companyProfileFields).map(k=>[k,''])),businessType:'',...s.company},operations:{...defaultSettings.operations,...s.operations},branding:{...defaultBranding,...s.branding},costs:s.costs});
export const timezones=['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Asia/Tashkent','UTC'];
export function validateSettings(body){
 const company=body?.company,costs=body?.costs;
 if(!company||!costs)throw Error('Заполните профиль и расходы');
 const clean={};
 for(const [key,max] of Object.entries(companyProfileFields)){const v=company[key]??'';if(typeof v!=='string'||v.trim().length>max)throw Error('Проверьте поля профиля');clean[key]=v.trim()}
 clean.mc=clean.mc.replace(/^MC-?/i,'');clean.dot=clean.dot.replace(/^DOT-?/i,'');
 if(clean.mc&&!/^\d+$/.test(clean.mc)||clean.dot&&!/^\d+$/.test(clean.dot))throw Error('MC и DOT: только цифры');
 if(clean.businessType&&!onboardingOptions.role.includes(clean.businessType))throw Error('Выберите тип деятельности из списка');
 if(clean.website&&!/^(https?:\/\/)?[^\s.]+\.[^\s]+$/i.test(clean.website))throw Error('Укажите корректный адрес сайта');
 const ops=body.operations??{},operations={},one=(v,list)=>v===''||v===undefined||list.includes(v),many=(v,list)=>v===undefined||Array.isArray(v)&&v.every(x=>list.includes(x));
 if(!one(ops.fleetSize,onboardingOptions.fleetSize)||!one(ops.eld,onboardingOptions.eld)||!many(ops.equipment,onboardingOptions.equipment)||!many(ops.loadBoards,onboardingOptions.loadBoards)||!many(ops.goals,onboardingOptions.goals))throw Error('Проверьте автопарк и способ работы');
 operations.fleetSize=ops.fleetSize??'';operations.eld=ops.eld??'';for(const k of ['equipment','loadBoards','goals'])operations[k]=[...new Set(ops[k]??[])];
 if(!clean.name)throw Error('Укажите название компании');
 if(clean.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email))throw Error('Укажите корректный email');
 if(!timezones.includes(clean.timezone))throw Error('Выберите часовой пояс из списка');
 const normalized=Object.fromEntries(Object.keys(defaultCosts).map(k=>[k,costs[k]]));calculateProfit(1000,100,0,normalized);
 if(normalized.fuelPrice>100||normalized.mpg>100||normalized.driverPerMile>100||normalized.tolls>100000||normalized.other>100000)throw Error('Проверьте допустимые пределы расходов');
 return {company:clean,operations,branding:validateBranding(body.branding),costs:normalized};
}
