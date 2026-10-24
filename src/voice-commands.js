// Voice commands for the AI assistant page: Russian, English and Spanish speech is mapped to in-app actions only.
import {parseDemoRequest,emptyCriteria} from './assistant-demo.js';
export const voiceLangs=[['ru','ru-RU','RU'],['en','en-US','EN'],['es','es-ES','ES']];
// Accents are dropped so "configuración" and "configuracion" match; й/ё are folded the same way on both sides.
export const normalize=text=>String(text).toLowerCase().replace(/ё/g,'е').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
// Order matters: the first section whose word appears wins ("карта автопарка" is the map, "грузовики" is the fleet).
const pages=[
 ['assistant',['помощник','ассистент','ии','assistant','ai','asistente','ia']],
 ['eld',['карт','eld','map','mapa','gps']],
 ['fleet',['автопарк','водител','грузовик','тягач','техник','fleet','driver','truck','flota','conductor','camion','vehiculo']],
 ['radar',['радар','radar']],
 ['chat',['переписк','сообщени','входящ','inbox','message','conversation','mensaje','bandeja','conversacion']],
 ['offers',['предложени','оффер','offer','oferta','propuesta']],
 ['finances',['финанс','деньг','доход','расход','finance','money','revenue','finanza','dinero','ingreso']],
 ['lanes',['выделен','лини','контракт','lane','dedicated','ruta','carril','linea','contrato']],
 ['brokers',['брокер','broker','corredor']],
 ['telegram',['телеграм','telegram']],
 ['integrations',['интеграц','integration','integracion']],
 ['settings',['настройк','параметр','setting','preference','ajuste','configuracion']],
 ['users',['пользовател','сотрудник','команд','user','team','staff','employee','usuario','equipo','empleado']],
 ['help',['справк','помощ','help','support','ayuda','soporte']],
 ['overview',['обзор','главн','дашборд','сводк','overview','dashboard','home','summary','resumen','inicio','principal','tablero']],
 ['trips',['рейс','поездк','маршрут','trip','route','viaje','recorrido']],
 ['loads',['груз','load','freight','carga','flete']],
].map(([page,words])=>[page,words.map(normalize)]);
const has=(q,words)=>words.some(w=>q.split(' ').some(t=>t.startsWith(w))||w.includes(' ')&&q.includes(w));
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
 if(!filtered)for(const [page,words] of pages)if(has(q,words))return {type:'navigate',page};
 return filtered?{type:'search',text:String(text).trim(),criteria}:{type:'unknown'};
}
