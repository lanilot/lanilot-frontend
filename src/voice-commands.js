// Voice commands for the AI assistant page: Russian, English and Spanish speech is mapped to in-app actions only.
import {parseDemoRequest,emptyCriteria} from './assistant-demo.js';
export const voiceLangs=[['ru','ru-RU','RU'],['en','en-US','EN'],['es','es-ES','ES']];
// Accents are dropped so "configuración" and "configuracion" match; й/ё are folded the same way on both sides.
export const normalize=text=>String(text).toLowerCase().replace(/ё/g,'е').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
// Order matters: the first section whose word appears wins ("карта автопарка" is the map, "грузовики" is the fleet).
const pages=[
 ['assistant',['помощник','ассистент','ии','assistant','ai','asistente','ia']],
 ['eld',['карт','eld','map','mapa','gps']],
 ['fleet',['автопарк','флит','трак','фур','водител','грузовик','тягач','техник','fleet','driver','truck','flota','conductor','camion','vehiculo']],
 ['radar',['радар','radar']],
 ['chat',['переписк','чаты','месседж','мессендж','инбокс','сообщени','входящ','inbox','message','conversation','mensaje','bandeja','conversacion']],
 ['offers',['предложени','оффер','офер','офир','offer','oferta','propuesta']],
 ['finances',['финанс','файнэнс','бухгалтер','деньг','доход','расход','finance','money','revenue','finanza','dinero','ingreso']],
 ['lanes',['выделен','лейн','лэйн','лини','контракт','lane','dedicated','ruta','carril','linea','contrato']],
 ['brokers',['брокер','broker','corredor']],
 ['telegram',['телеграм','telegram']],
 ['integrations',['интеграц','integration','integracion']],
 ['settings',['настройк','сеттинг','опци','параметр','setting','preference','ajuste','configuracion']],
 ['users',['пользовател','сотрудник','команд','user','team','staff','employee','usuario','equipo','empleado']],
 ['help',['справк','помощ','help','support','ayuda','soporte']],
 ['overview',['обзор','овервью','оверви','домой','старт','главн','дашборд','сводк','overview','dashboard','home','summary','resumen','inicio','principal','tablero']],
 ['trips',['рейс','трип','диспетч','поездк','маршрут','trip','route','viaje','recorrido']],
 ['loads',['груз','лоуд','лоад','лод','load','freight','carga','flete']],
].map(([page,words])=>[page,words.map(normalize)]);
const has=(q,words)=>words.some(w=>q.split(' ').some(t=>t.startsWith(w))||w.includes(' ')&&q.includes(w));
// One wrong, missing or extra letter is tolerated for longer words ("оферы", "настройкы", "setings").
function close(a,b){if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue}if(++edits>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++}}return edits+(a.length-i)+(b.length-j)<=1}
const fuzzy=(q,words)=>words.some(w=>w.length>=5&&!w.includes(' ')&&q.split(' ').some(t=>t.length>=w.length-1&&[w.length-1,w.length,w.length+1].some(n=>close(t.slice(0,n),w))))
const exact=(q,list)=>list.map(normalize).includes(q);
const stop=['стоп','хватит','отмена','замолчи','stop','cancel','enough','quiet','para','basta','cancelar','detente','alto'];
const back=['назад','вернись','вернуться','вернись назад','выйти','выход','закрой','закрыть','закрой помощник','back','go back','exit','close','close assistant','volver','atras','regresar','salir','cerrar'];
const skills=['что ты умеешь','что умеешь','какие команды','команды','помоги','what can you do','commands','what can i say','que puedes hacer','que sabes hacer','comandos','que puedo decir'];
const scroll={top:['наверх','в начало','в самый верх','to the top','scroll to top','top','al principio','arriba del todo','al inicio de la pagina'],up:['вверх','выше','up','higher','arriba','sube'],down:['вниз','ниже','листай','прокрути','down','scroll','lower','abajo','baja','desplaza']};
const newChat=['новый чат','новый запрос','начни заново','очисти чат','new chat','new conversation','start over','clear chat','nuevo chat','nueva conversacion','empezar de nuevo','borrar chat'];
// Returns {type:'stop'|'back'|'skills'|'newChat'|'unknown'} | {type:'scroll',dir:'top'|'up'|'down'} | {type:'openLoad',id,load} | {type:'navigate',page} | {type:'search',text,criteria}.
export function parseVoiceCommand(text,loads=[]){
 const q=normalize(text);if(!q)return {type:'empty'};
 if(exact(q,stop))return {type:'stop'};
 if(exact(q,skills)||has(q,skills.filter(s=>s.includes(' ')).map(normalize)))return {type:'skills'};
 if(has(q,newChat.map(normalize)))return {type:'newChat'};
 if(exact(q,back))return {type:'back'};
 // Scrolling stays within the current section; "scroll up" is checked before the bare "scroll".
 for(const [dir,words] of Object.entries(scroll))if(exact(q,words)||has(q,words.filter(w=>w.includes(' ')).map(normalize))||q.split(' ').length<=4&&has(q,words.filter(w=>!w.includes(' ')).map(normalize)))return {type:'scroll',dir};
 // "груз 2046", "load LD-2046", "carga número 2046": a load number opens that load.
 const number=q.match(/(?:^|\s)(?:ld|груз\S*|load\S*|carga\S*|номер\S*|number|numero|n)\s*-?\s*(?:ld\s*-?\s*)?(\d{3,6})(?:\s|$)/)||q.match(/(?:^|\s)ld\s*-?\s*(\d{3,6})(?:\s|$)/);
 if(number){const load=loads.find(l=>String(l.id).replace(/\D/g,'').endsWith(number[1]));return {type:'openLoad',id:number[1],load:load||null}}
 // Cities, equipment or limits make it a load search for the chat; a bare section name is navigation.
 const criteria=parseDemoRequest(text,loads),filtered=Object.keys(emptyCriteria).some(k=>criteria[k]!==emptyCriteria[k]);
 if(!filtered){for(const [page,words] of pages)if(has(q,words))return {type:'navigate',page};for(const [page,words] of pages)if(fuzzy(q,words))return {type:'navigate',page}}
 return filtered?{type:'search',text:String(text).trim(),criteria}:{type:'unknown'};
}
// Language of the phrase itself, so the reply matches what the user actually said whatever the selected recognition language.
export function spokenLang(text,selected='en'){const t=String(text).toLowerCase();if(/[а-яё]/.test(t))return 'ru';if(/[ñ¿¡áéíóú]/.test(t)||/(^|\s)(abre|abrir|ir|ve|vamos|mostrar|muestra|ver|los|las|el|la|del|de|desde|hacia|para|cargas?|viajes?|ajustes|configuracion|finanzas|ofertas|flota|mapa|volver|basta|ayuda|nuevo)(\s|$)/.test(t))return 'es';return selected==='es'&&!/[a-z]/.test(t)?'es':'en'}
// True when the heard phrase is mostly words of our last spoken reply (the speakers leaking into the microphone).
export function isEcho(heard,reply){const h=normalize(heard).split(' ').filter(w=>w.length>2),r=new Set(normalize(reply).split(' '));if(!h.length)return false;const hits=h.filter(w=>r.has(w)||[...r].some(x=>x.length>3&&(x.startsWith(w)||w.startsWith(x)))).length;return hits/h.length>=.6}
