// Company (tenant) management until the admin panel exists.
//   node scripts/tenant.mjs list
//   node scripts/tenant.mjs create --slug acme --name "Acme Trucking" --owner owner@acme.com [--demo]
//   node scripts/tenant.mjs invite --slug acme --email user@acme.com [--role dispatcher]
//   node scripts/tenant.mjs suspend|activate --slug acme
import {existsSync,mkdirSync} from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const {createApp}=await import('../server/app.js');
const {companyBySlug,listCompanies}=await import('../server/tenancy.js');

const [command,...rest]=process.argv.slice(2),args={};
for(let i=0;i<rest.length;i++){if(rest[i].startsWith('--')){const key=rest[i].slice(2),next=rest[i+1];args[key]=next&&!next.startsWith('--')?(i++,next):true}}
const base=process.env.LANILOT_BASE_DOMAIN||'lanilot.com',url=(slug,path='')=>`https://${slug}.${base}${path}`;
const RESERVED=new Set(['app','www','admin','api','mail','static','assets','status','help','docs']);
const fail=m=>{console.error(m);process.exit(1)};

mkdirSync('data',{recursive:true});
const {db,seedCompany,access}=createApp(process.env.LANILOT_DB||'data/lanilot.sqlite');
try{
 if(command==='list'){for(const c of listCompanies(db))console.log(`${c.slug.padEnd(18)} ${c.status.padEnd(10)} ${c.plan.padEnd(8)} ${c.demo?'demo ':'     '} ${c.name}  ${url(c.slug)}`)}
 else if(command==='create'){
  const slug=String(args.slug||'').toLowerCase();
  if(!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(slug))fail('--slug: 3–32 latin letters, digits or hyphens');
  if(RESERVED.has(slug))fail(`--slug "${slug}" is reserved`);
  if(companyBySlug(db,slug))fail(`Company "${slug}" already exists`);
  if(typeof args.name!=='string'||!args.name.trim())fail('--name is required');
  if(typeof args.owner!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.owner))fail('--owner email is required');
  const id='co-'+crypto.randomUUID();
  db.raw.prepare('INSERT INTO companies(id,slug,name,demo,created_at) VALUES(?,?,?,?,?)').run(id,slug,args.name.trim(),args.demo?1:0,new Date().toISOString());
  seedCompany({id,demo:args.demo?1:0});
  console.log(`Created ${args.name.trim()} → ${url(slug)}`);
  console.log(`Owner invitation for ${args.owner} (valid 7 days):\n  ${url(slug,access.createInvite(id,args.owner,'owner'))}`);
 }
 else if(command==='invite'){
  const c=companyBySlug(db,String(args.slug||''));if(!c)fail('Unknown --slug');
  const role=args.role||'dispatcher';if(!['owner','dispatcher','viewer'].includes(role))fail('--role: owner, dispatcher or viewer');
  if(typeof args.email!=='string')fail('--email is required');
  console.log(url(c.slug,access.createInvite(c.id,args.email,role)));
 }
 else if(command==='suspend'||command==='activate'){
  const c=companyBySlug(db,String(args.slug||''));if(!c)fail('Unknown --slug');
  db.raw.prepare('UPDATE companies SET status=? WHERE id=?').run(command==='suspend'?'suspended':'active',c.id);
  if(command==='suspend')db.raw.prepare('DELETE FROM sessions WHERE company_id=?').run(c.id);
  console.log(`${c.slug}: ${command==='suspend'?'suspended':'active'}`);
 }
 else fail('Commands: list | create | invite | suspend | activate (see the header of scripts/tenant.mjs)');
}finally{db.close()}
