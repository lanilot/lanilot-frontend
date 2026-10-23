import express from 'express';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const meta='id,message_id,load_id,filename,mime,size,is_demo';
export function installAttachments(db){db.exec(`CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES messages(id),load_id TEXT NOT NULL REFERENCES loads(id),filename TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,data BLOB NOT NULL,hash TEXT NOT NULL,client_key TEXT UNIQUE,is_demo INTEGER NOT NULL DEFAULT 0)`)}
export function seedAttachments(db){const message=db.prepare("SELECT * FROM messages WHERE load_id='LD-2046' ORDER BY created_at LIMIT 1").get();if(!message)return;const data=readFileSync(new URL('../output/pdf/seed-rc.pdf',import.meta.url));db.prepare('INSERT OR IGNORE INTO attachments VALUES(?,?,?,?,?,?,?,?,?,?)').run('seed-chat-rc',message.id,message.load_id,'Rate-confirmation-DEMO.pdf','application/pdf',data.length,data,createHash('sha256').update(data).digest('hex'),'seed-chat-rc',1);const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#e4ecff"/><text x="50" y="150" font-size="40" fill="#172554">LANILOT · DEMO</text><text x="50" y="210" font-size="24" fill="#334155">Loading dock / sample attachment</text></svg>');db.prepare('INSERT OR IGNORE INTO attachments VALUES(?,?,?,?,?,?,?,?,?,?)').run('seed-chat-image',message.id,message.load_id,'Loading-dock-DEMO.svg','image/svg+xml',svg.length,svg,createHash('sha256').update(svg).digest('hex'),'seed-chat-image',1)}
export const attachmentState=db=>db.prepare(`SELECT ${meta} FROM attachments`).all();
export function registerAttachmentRoutes(app,db){
 app.post('/api/loads/:id/attachments',express.raw({type:()=>true,limit:'25mb'}),(req,res)=>{
  if(!db.prepare('SELECT id FROM loads WHERE id=?').get(req.params.id))return res.status(404).json({error:'Груз не найден'});
  const {filename,clientId,caption=''}=req.query;
  if(typeof filename!=='string'||!filename.trim()||filename.length>200||/[\x00-\x1f\x7f/\\]/.test(filename)||typeof clientId!=='string'||clientId.length<8||clientId.length>100||typeof caption!=='string'||caption.length>5000)return res.status(400).json({error:'Проверьте имя файла и подпись'});
  if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'Пустой файл'});
  const data=req.body,hash=createHash('sha256').update(data).digest('hex'),old=db.prepare('SELECT * FROM attachments WHERE client_key=?').get(clientId);
  if(old){const message=db.prepare('SELECT * FROM messages WHERE id=?').get(old.message_id);return old.hash===hash&&old.load_id===req.params.id&&old.filename===filename&&message.body===(caption.trim()||filename)?res.json({id:old.id}):res.status(409).json({error:'Ключ загрузки уже использован'})}
  // Only passive, recognized media types render inline. Every other file is download-only.
  let mime='application/octet-stream';const declared=req.get('content-type')?.split(';')[0];
  if(data.subarray(0,5).toString()==='%PDF-')mime='application/pdf';
  else if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
  else if(data[0]===255&&data[1]===216&&data[2]===255)mime='image/jpeg';
  else if(/^GIF8[79]a/.test(data.subarray(0,6).toString()))mime='image/gif';
  else if(data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP')mime='image/webp';
  else if(data.subarray(4,8).toString()==='ftyp'&&['video/mp4','audio/mp4','video/quicktime'].includes(declared))mime=declared;
  else if(data.subarray(0,3).toString()==='ID3'||data[0]===255&&(data[1]&224)===224)mime='audio/mpeg';
  else if(data.subarray(0,4).toString()==='OggS')mime='audio/ogg';
  else if(data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WAVE')mime='audio/wav';
  else if(data.subarray(0,4).equals(Buffer.from([26,69,223,163]))&&['video/webm','audio/webm'].includes(declared))mime=declared;
  const id=crypto.randomUUID(),messageId=crypto.randomUUID(),now=new Date().toISOString();db.exec('BEGIN');try{db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)').run(messageId,req.params.id,null,'dispatcher',caption.trim()||filename,null,now,now);db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,messageId,req.params.id,filename,mime,data.length,data,hash,clientId,0);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}res.status(201).json({id,messageId});
 });
 app.get('/api/attachments/:id/file',(req,res)=>{const f=db.prepare('SELECT * FROM attachments WHERE id=?').get(req.params.id);if(!f)return res.status(404).json({error:'Файл не найден'});const inline=f.mime!=='application/octet-stream'&&req.query.download!=='1';res.set({'Content-Type':f.mime,'Content-Disposition':`${inline?'inline':'attachment'}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(f.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox",'Cache-Control':'no-store'});res.send(Buffer.from(f.data))});
}
