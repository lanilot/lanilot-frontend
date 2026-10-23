import express from 'express';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const documentKinds={rc:'Rate Confirmation',bol:'Bill of Lading (BOL)',pod:'Proof of Delivery (POD)'};
export const documentMetadata='id,load_id,kind,filename,mime,size,created_at,reviewed,is_demo';
export function installDocuments(db){db.exec(`CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,load_id TEXT NOT NULL REFERENCES loads(id),kind TEXT NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,data BLOB NOT NULL,content_hash TEXT NOT NULL,request_key TEXT UNIQUE,created_at TEXT NOT NULL,reviewed INTEGER NOT NULL DEFAULT 0,is_demo INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS load_documents ON documents(load_id,created_at);`)}
export function seedDocuments(db){
 for(const [loadId,kinds] of [['LD-2044',['rc']],['LD-2046',['rc','bol']],['LD-2047',['rc','bol','pod']],['LD-2048',['rc','bol','pod']]])for(const kind of kinds){
  if(!db.prepare('SELECT id FROM loads WHERE id=?').get(loadId))continue;
  const id=`seed-document-${loadId}-${kind}`;if(db.prepare('SELECT id FROM documents WHERE id=?').get(id))continue;
  const data=readFileSync(new URL(`../output/pdf/seed-${kind}.pdf`,import.meta.url));
  db.prepare('INSERT OR IGNORE INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,loadId,kind,`${loadId}-${kind}.pdf`,'application/pdf',data.length,data,createHash('sha256').update(data).digest('hex'),null,new Date().toISOString(),kind==='pod'?0:1,1);
 }
}
function mimeOf(data){if(data.subarray(0,5).toString()==='%PDF-')return 'application/pdf';if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';if(data.subarray(0,3).equals(Buffer.from([255,216,255])))return 'image/jpeg';return null}
export function registerDocumentRoutes(app,db){
 app.post('/api/loads/:id/documents',express.raw({type:['application/pdf','image/png','image/jpeg'],limit:'10mb'}),(req,res)=>{
  if(!db.prepare('SELECT id FROM loads WHERE id=?').get(req.params.id))return res.status(404).json({error:'Груз не найден'});
  const {kind,filename,clientId}=req.query;
  if(typeof kind!=='string'||!Object.hasOwn(documentKinds,kind))return res.status(400).json({error:'Выберите тип документа'});
  if(typeof filename!=='string'||!filename.trim()||filename.length>200||/[\x00-\x1f\x7f/\\]/.test(filename))return res.status(400).json({error:'Некорректное имя файла (до 200 символов, без путей)'});
  if(typeof clientId!=='string'||clientId.length<8||clientId.length>100)return res.status(400).json({error:'Некорректный ключ загрузки'});
  const data=req.body;if(!Buffer.isBuffer(data)||!data.length)return res.status(415).json({error:'Выберите PDF, PNG или JPEG'});
  const mime=mimeOf(data),declared=req.get('content-type')?.split(';')[0];
  if(!mime||mime!==declared||!(mime==='application/pdf'?/\.pdf$/i:mime==='image/png'?/\.png$/i:/\.jpe?g$/i).test(filename))return res.status(415).json({error:'Содержимое, расширение и формат файла должны соответствовать PDF, PNG или JPEG'});
  const hash=createHash('sha256').update(data).digest('hex'),existing=db.prepare('SELECT * FROM documents WHERE request_key=?').get(clientId);
  if(existing){if(existing.load_id!==req.params.id||existing.kind!==kind||existing.content_hash!==hash||existing.filename!==filename.trim())return res.status(409).json({error:'Ключ загрузки уже использован для другого файла'});return res.json(db.prepare(`SELECT ${documentMetadata} FROM documents WHERE id=?`).get(existing.id))}
  const id=crypto.randomUUID();db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,req.params.id,kind,filename.trim(),mime,data.length,data,hash,clientId,new Date().toISOString(),0,0);res.status(201).json(db.prepare(`SELECT ${documentMetadata} FROM documents WHERE id=?`).get(id));
 });
 app.get('/api/documents/:id/file',(req,res)=>{
  const doc=db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);if(!doc)return res.status(404).json({error:'Документ не найден'});
  res.set({'Content-Type':doc.mime,'Content-Length':String(doc.size),'Content-Disposition':`${req.query.download==='1'?'attachment':'inline'}; filename="document${doc.mime==='application/pdf'?'.pdf':doc.mime==='image/png'?'.png':'.jpg'}"; filename*=UTF-8''${encodeURIComponent(doc.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.send(Buffer.from(doc.data));
 });
 app.patch('/api/documents/:id',(req,res)=>{
  if(typeof req.body?.reviewed!=='boolean')return res.status(400).json({error:'Укажите статус проверки документа'});
  if(!db.prepare('SELECT id FROM documents WHERE id=?').get(req.params.id))return res.status(404).json({error:'Документ не найден'});db.prepare('UPDATE documents SET reviewed=? WHERE id=?').run(Number(req.body.reviewed),req.params.id);res.json({ok:true});
 });
}
