// Interface language. Russian source strings are the dictionary keys; English is the default language.
// The language is fixed per page load (switching reloads), so module-level labels translate too.
export const LANGS=[['en','English'],['es','Español'],['fr','Français'],['it','Italiano'],['ru','Русский'],['uz','Oʻzbekcha']];
const STORAGE_KEY='lanilot-app-lang';
const known=code=>LANGS.some(([c])=>c===code);
function detect(){
 try{const fromUrl=new URLSearchParams(window.location.search).get('lang');if(known(fromUrl))return fromUrl;const saved=localStorage.getItem(STORAGE_KEY);if(known(saved))return saved}catch{/* storage blocked */}
 return 'en';
}
// Outside the browser (server tests importing shared UI helpers) strings stay as written.
export const lang=typeof window==='undefined'?'ru':detect();
export const appLocale={en:'en-US',es:'es-ES',fr:'fr-FR',it:'it-IT',ru:'ru-RU',uz:'uz-Latn-UZ'}[lang];
let dict={};
export async function loadLocale(){if(lang!=='ru')dict=(await import(`./locales/${lang}.json`)).default}
// __('Найдено {0} груза',[n]) — positional {0} or named {name} placeholders.
export function __(key,vars){let s=lang==='ru'?key:dict[key]??key;if(vars)s=s.replace(/\{(\w+)\}/g,(m,k)=>vars[k]??m);return s}
// Server data (seed texts, status labels, error messages) arrives in Russian; translate exact matches only,
// so anything the user typed stays as typed.
export function translateDeep(value){
 if(lang==='ru')return value;
 if(typeof value==='string')return dict[value]??value;
 if(Array.isArray(value))return value.map(translateDeep);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,translateDeep(v)]));
 return value;
}
export function setLang(code){
 if(!known(code))return;
 try{localStorage.setItem(STORAGE_KEY,code)}catch{/* still switch for this visit */}
 const url=new URL(window.location.href);if(code==='en')url.searchParams.delete('lang');else url.searchParams.set('lang',code);
 window.location.replace(url.toString());
}
// Browsers have no Uzbek month names in Intl ("M10 23"), so Uzbek dates are built by hand; others use Intl.
const UZ_MONTHS=['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
const UZ_MONTHS_SHORT=['yan','fev','mar','apr','may','iyn','iyl','avg','sen','okt','noy','dek'];
const UZ_WEEKDAYS=['Ya','Du','Se','Ch','Pa','Ju','Sh'];
const defaults={date:{day:'2-digit',month:'2-digit',year:'numeric'},time:{hour:'2-digit',minute:'2-digit'},datetime:{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}};
export function fmtDate(value,opts,kind='datetime'){
 const d=value instanceof Date?value:new Date(value);
 if(lang!=='uz')return kind==='date'?d.toLocaleDateString(appLocale,opts):kind==='time'?d.toLocaleTimeString(appLocale,opts):d.toLocaleString(appLocale,opts);
 const o=opts||defaults[kind],pad=n=>String(n).padStart(2,'0'),parts=[];
 if(o.weekday)parts.push(UZ_WEEKDAYS[d.getDay()]);
 if(o.day||o.month)parts.push(o.month==='2-digit'||o.month==='numeric'?`${pad(d.getDate())}.${pad(d.getMonth()+1)}${o.year?'.'+d.getFullYear():''}`:`${d.getDate()}-${(o.month==='long'?UZ_MONTHS:UZ_MONTHS_SHORT)[d.getMonth()]}${o.year?' '+d.getFullYear():''}`);
 else if(o.year)parts.push(String(d.getFullYear()));
 if(o.hour||o.minute)parts.push(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
 return parts.join(', ');
}
