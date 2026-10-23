import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
test('documents upload, download and review persist; invalid files and duplicate retries are handled',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lanilot-docs-'));let db,server;
 try{let app;({app,db}=createApp(join(dir,'test.sqlite')));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
 const json=async(p,m='GET',b)=>{const r=await fetch(base+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return {status:r.status,data:await r.json()}};
 const pdf=readFileSync(new URL('../output/pdf/seed-rc.pdf',import.meta.url)),upload=async(overrides={},data=pdf,mime='application/pdf',load='LD-2041')=>{const query=new URLSearchParams({kind:'rc',filename:'test-rc.pdf',clientId:'upload-doc-test-001',...overrides});const r=await fetch(base+'/loads/'+load+'/documents?'+query,{method:'POST',headers:{'Content-Type':mime},body:data});return {status:r.status,data:await r.json()}};
 const initial=(await json('/state')).data;assert.equal(initial.documents.length,9);assert.ok(initial.documents.every(d=>!('data' in d)&&!('content_hash' in d)));const seeded=initial.documents.find(d=>d.id==='seed-document-LD-2047-pod');assert.equal(seeded.is_demo,1);
 for(const overrides of [{kind:'other'},{filename:'../bad.pdf'},{filename:'a'.repeat(201)},{clientId:'bad'}])assert.equal((await upload(overrides)).status,400);
 assert.equal((await upload({},pdf,'application/pdf','missing')).status,404);assert.equal((await upload({},Buffer.from('<html>bad</html>'))).status,415);assert.equal((await upload({},pdf,'image/png')).status,415);assert.equal((await upload({},Buffer.alloc(0))).status,415);assert.equal((await upload({},Buffer.alloc(10*1024*1024+1,65))).status,413);
 const added=await upload();assert.equal(added.status,201);assert.equal(added.data.reviewed,0);assert.equal(added.data.is_demo,0);assert.equal((await upload()).status,200);assert.equal((await upload({kind:'pod'})).status,409);assert.equal((await upload({},pdf,'application/pdf','LD-2042')).status,409);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');assert.equal((await upload({filename:'proof.png',kind:'pod',clientId:'upload-doc-test-png'},png,'image/png')).status,201);
 const response=await fetch(base+'/documents/'+added.data.id+'/file');assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-disposition'),/^inline/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
 const download=await fetch(base+'/documents/'+added.data.id+'/file?download=1');assert.match(download.headers.get('content-disposition'),/^attachment/);assert.equal((await fetch(base+'/documents/missing/file')).status,404);
 assert.equal((await json('/documents/'+added.data.id,'PATCH',{reviewed:true})).status,200);assert.equal((await json('/documents/'+added.data.id,'PATCH',{reviewed:'true'})).status,400);assert.equal((await json('/documents/missing','PATCH',{reviewed:true})).status,404);
 await json('/documents/'+seeded.id,'PATCH',{reviewed:true});await new Promise(r=>server.close(r));server=null;db.close();({db}=createApp(join(dir,'test.sqlite')));assert.equal(db.prepare('SELECT count(*) n FROM documents').get().n,11);assert.equal(db.prepare('SELECT reviewed FROM documents WHERE id=?').get(seeded.id).reviewed,1);const saved=db.prepare('SELECT * FROM documents WHERE id=?').get(added.data.id);assert.equal(saved.reviewed,1);assert.deepEqual(Buffer.from(saved.data),pdf);
 }finally{if(server)await new Promise(r=>server.close(r));db?.close();rmSync(dir,{recursive:true,force:true})}
});
