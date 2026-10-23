// Company (tenant) management until the admin panel exists.
//   node scripts/tenant.mjs list
//   node scripts/tenant.mjs create --slug acme --name "Acme Trucking" --owner owner@acme.com [--demo]
//   node scripts/tenant.mjs invite --slug acme --email user@acme.com [--role dispatcher]
//   node scripts/tenant.mjs suspend|activate --slug acme
//   node scripts/tenant.mjs demo [--password Secret123]   demo company with owner/dispatcher/viewer accounts
import {existsSync,mkdirSync} from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const {createApp}=await import('../server/app.js');
const {companyBySlug,listCompanies,RESERVED_SLUGS,asCompany}=await import('../server/tenancy.js');
const {hashPassword}=await import('../server/auth.js');

const [command,...rest]=process.argv.slice(2),args={};
for(let i=0;i<rest.length;i++){if(rest[i].startsWith('--')){const key=rest[i].slice(2),next=rest[i+1];args[key]=next&&!next.startsWith('--')?(i++,next):true}}
const base=process.env.LANILOT_BASE_DOMAIN||'lanilot.com',url=(slug,path='')=>`https://${slug}.${base}${path}`;
const fail=m=>{console.error(m);process.exit(1)};

mkdirSync('data',{recursive:true});
const {db,seedCompany,access}=createApp(process.env.LANILOT_DB||'data/lanilot.sqlite');
try{
 if(command==='list'){for(const c of listCompanies(db))console.log(`${c.slug.padEnd(18)} ${c.status.padEnd(10)} ${c.plan.padEnd(8)} ${c.demo?'demo ':'     '} ${c.name}  ${url(c.slug)}`)}
 else if(command==='create'){
  const slug=String(args.slug||'').toLowerCase();
  if(!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(slug))fail('--slug: 3–32 latin letters, digits or hyphens');
  if(RESERVED_SLUGS.has(slug))fail(`--slug "${slug}" is reserved`);
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
 else if(command==='demo'){
  // Re-running resets the demo passwords; the demo data is seeded once.
  const password=typeof args.password==='string'?args.password:'Demo-'+crypto.randomUUID().slice(0,8);
  if(password.length<8)fail('--password: at least 8 characters');
  let c=companyBySlug(db,'demo');
  if(!c){db.raw.prepare("INSERT INTO companies(id,slug,name,demo,created_at) VALUES('co-demo','demo','Lanilot Demo',1,?)").run(new Date().toISOString());c=companyBySlug(db,'demo');seedCompany(c);asCompany(c.id,()=>{const st=JSON.parse(db.prepare("SELECT data FROM settings WHERE id='workspace'").get().data);st.company.name=c.name;db.prepare("UPDATE settings SET data=? WHERE id='workspace'").run(JSON.stringify(st))})}
  const now=new Date().toISOString(),hash=hashPassword(password);
  console.log(`Demo company "${c.name}": sign in at https://app.${base} (or ${url(c.slug)}) — password for all accounts: ${password}`);
  for(const [role,name] of [['owner','Demo Owner'],['dispatcher','Demo Dispatcher'],['viewer','Demo Viewer']]){
   const email=`${role}@demo.lanilot.com`,user=db.raw.prepare('SELECT id FROM users WHERE email=?').get(email),id=user?.id??'usr-demo-'+role;
   if(user)db.raw.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,id);else db.raw.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,email,name,hash,now);
   db.raw.prepare('INSERT INTO memberships VALUES(?,?,?,?) ON CONFLICT(user_id,company_id) DO UPDATE SET role=excluded.role').run(id,c.id,role,now);
   db.raw.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
   console.log(`  ${role.padEnd(10)} ${email}`);
  }
 }
 else fail('Commands: list | create | invite | suspend | activate | demo (see the header of scripts/tenant.mjs)');
}finally{db.close()}
