// Multi-tenancy in one shared database.
// Every business table is stored physically as t_<name> with a company_id column; the app keeps using the
// plain name, which is a view filtered by current_company() (the request's company from AsyncLocalStorage).
// INSTEAD OF triggers stamp company_id on writes, so existing queries stay unchanged and a request without a
// company sees no rows and cannot write (fail closed).
import {AsyncLocalStorage} from 'node:async_hooks';

export const tenantContext=new AsyncLocalStorage();
export const currentTenant=()=>tenantContext.getStore()??null;
export const DEFAULT_COMPANY='workspace';
// Platform-level tables, never filtered by company (telegram tables carry their own company_id).
export const GLOBAL_TABLES=new Set(['companies','users','memberships','sessions','invites','telegram_settings','telegram_notifications','signup_leads','signup_events','activity','platform_admins','admin_sessions','demo_requests']);
// Server keys any company may use (public registries); all other provider keys belong to the primary company.
const SHARED_ENV=new Set(['LANILOT_FMCSA_WEBKEY']);

const q=name=>'"'+name.replace(/"/g,'""')+'"';
const isTenantTable=name=>!GLOBAL_TABLES.has(name)&&!name.startsWith('t_')&&!name.startsWith('sqlite_');

export function installTenancy(raw){
 // Without a request context there is no company (fail closed); only no-auth mode (tests, local scripts) falls back.
 let fallback=null;
 raw.function('current_company',{deterministic:false},()=>tenantContext.getStore()?.companyId??fallback);
 raw.exec(`CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),plan TEXT NOT NULL DEFAULT 'trial',demo INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)`);
 raw.prepare("INSERT OR IGNORE INTO companies(id,slug,name,demo,created_at) VALUES(?,?,?,1,?)").run(DEFAULT_COMPANY,'app','Lanilot Cargo',new Date().toISOString());
 const physical=name=>!!raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get('t_'+name);
 // Schema changes written against the plain names are redirected to the physical tables.
 const rewrite=sql=>sql
  .replace(/ALTER TABLE\s+(\w+)\s+ADD COLUMN/gi,(m,t)=>physical(t)?`ALTER TABLE t_${t} ADD COLUMN`:m)
  .replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+IF NOT EXISTS\s+(\w+)\s+ON\s+(\w+)\s*\(/gi,(m,u,i,t)=>physical(t)?`CREATE ${u||''}INDEX IF NOT EXISTS ${i} ON t_${t}(company_id,`:m);
 return {
  raw,
  prepare:sql=>raw.prepare(rewrite(sql)),
  exec:sql=>raw.exec(rewrite(sql)),
  function:(...args)=>raw.function(...args),
  close:()=>raw.close(),
  setFallbackCompany:id=>{fallback=id},
  get isOpen(){return raw.isOpen}
 };
}

// Convert plain business tables (fresh database or tables added in a release) into company-scoped storage.
export function tenantizeTables(db,companyId=DEFAULT_COMPANY){
 const raw=db.raw,tables=raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name).filter(isTenantTable);
 if(tables.length){
  raw.exec('PRAGMA foreign_keys=OFF');raw.exec('BEGIN IMMEDIATE');
  try{
   for(const name of tables){
    const cols=raw.prepare(`PRAGMA table_info(${q(name)})`).all();
    if(cols.some(c=>c.name==='company_id'))throw Error(`Table ${name} already has company_id; list it in GLOBAL_TABLES`);
    const pk=cols.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);if(!pk.length)throw Error(`Table ${name} needs a primary key`);
    const uniques=[],indexes=[];
    for(const idx of raw.prepare(`PRAGMA index_list(${q(name)})`).all()){
     if(idx.origin==='u')uniques.push(raw.prepare(`PRAGMA index_info(${q(idx.name)})`).all().map(r=>r.name));
     else if(idx.origin==='c'){const sql=raw.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name=?").get(idx.name)?.sql;if(sql)indexes.push(sql)}
    }
    const defs=cols.map(c=>`${q(c.name)} ${c.type}${c.notnull?' NOT NULL':''}${c.dflt_value!==null?' DEFAULT '+c.dflt_value:''}`);
    const list=cols.map(c=>q(c.name)).join(',');
    raw.exec(`CREATE TABLE ${q('t_'+name)}(company_id TEXT NOT NULL,${defs.join(',')},PRIMARY KEY(company_id,${pk.map(q).join(',')}))`);
    raw.prepare(`INSERT INTO ${q('t_'+name)}(company_id,${list}) SELECT ?,${list} FROM ${q(name)}`).run(companyId);
    raw.exec(`DROP TABLE ${q(name)}`);
    uniques.forEach((u,i)=>raw.exec(`CREATE UNIQUE INDEX ${q(`t_${name}_unique_${i}`)} ON ${q('t_'+name)}(company_id,${u.map(q).join(',')})`));
    for(const sql of indexes)raw.exec(sql.replace(new RegExp(`\\bON\\s+"?${name}"?\\s*\\(`,'i'),`ON ${q('t_'+name)}(company_id,`));
   }
   raw.exec('COMMIT');
  }catch(e){raw.exec('ROLLBACK');throw e}finally{raw.exec('PRAGMA foreign_keys=ON')}
 }
 refreshViews(db);
}

// Views and triggers are rebuilt on every start so they always match the physical columns.
export function refreshViews(db){
 const raw=db.raw;
 for(const {name:physical} of raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 't\\_%' ESCAPE '\\'").all()){
  const name=physical.slice(2),cols=raw.prepare(`PRAGMA table_info(${q(physical)})`).all().filter(c=>c.name!=='company_id');
  const pk=cols.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name),list=cols.map(c=>q(c.name)).join(',');
  const match=`company_id=current_company() AND ${pk.map(c=>`${q(c)}=OLD.${q(c)}`).join(' AND ')}`;
  const value=c=>c.dflt_value!==null?`COALESCE(NEW.${q(c.name)},${c.dflt_value})`:`NEW.${q(c.name)}`;
  raw.exec(`DROP VIEW IF EXISTS ${q(name)};
   CREATE VIEW ${q(name)} AS SELECT ${list} FROM ${q(physical)} WHERE company_id=current_company();
   CREATE TRIGGER ${q(name+'__insert')} INSTEAD OF INSERT ON ${q(name)} BEGIN INSERT INTO ${q(physical)}(company_id,${list}) VALUES(current_company(),${cols.map(value).join(',')}); END;
   CREATE TRIGGER ${q(name+'__update')} INSTEAD OF UPDATE ON ${q(name)} BEGIN UPDATE ${q(physical)} SET ${cols.map(c=>`${q(c.name)}=NEW.${q(c.name)}`).join(',')} WHERE ${match}; END;
   CREATE TRIGGER ${q(name+'__delete')} INSTEAD OF DELETE ON ${q(name)} BEGIN DELETE FROM ${q(physical)} WHERE ${match}; END;`);
 }
}

export const companyBySlug=(db,slug)=>db.raw.prepare('SELECT * FROM companies WHERE slug=?').get(slug)??null;
export const companyById=(db,id)=>db.raw.prepare('SELECT * FROM companies WHERE id=?').get(id)??null;
// Subdomains kept for the platform itself.
export const RESERVED_SLUGS=new Set(['app','www','admin','api','mail','static','assets','status','help','docs','demo','login','signup']);
// Free subdomain from a company name: "Acme Trucking LLC" → acme-trucking-llc, acme-trucking-llc-2, …
export function uniqueSlug(db,name){
 const base=String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,28).replace(/-+$/,'');
 const root=base.length>=3&&!RESERVED_SLUGS.has(base)?base:`company-${base||'new'}`.slice(0,28).replace(/-+$/,'');
 for(let n=1;;n++){const slug=n===1?root:`${root}-${n}`;if(!companyBySlug(db,slug))return slug}
}
export const listCompanies=db=>db.raw.prepare('SELECT * FROM companies ORDER BY created_at').all();

// Run work as a company (startup seeding, scripts, request handling).
export const asCompany=(companyId,work,extra={})=>tenantContext.run({companyId,role:'owner',system:true,...extra},work);

// Provider credentials from the server environment belong to the primary company only.
export function tenantEnv(base){
 const allowed=key=>SHARED_ENV.has(key)||(tenantContext.getStore()?.companyId??DEFAULT_COMPANY)===DEFAULT_COMPANY;
 return new Proxy({},{get:(_,key)=>typeof key==='string'&&allowed(key)?base[key]:undefined,has:(_,key)=>allowed(key)&&key in base,ownKeys:()=>Reflect.ownKeys(base).filter(k=>typeof k==='string'&&allowed(k)),getOwnPropertyDescriptor:(_,key)=>allowed(key)&&key in base?{value:base[key],enumerable:true,configurable:true}:undefined});
}

// Company from the request host: <slug>.<baseDomain>; the app host, localhost and IPs use the primary company.
export function slugFromHost(host,baseDomain){
 const name=String(host||'').toLowerCase().replace(/:\d+$/,'');
 if(!name||name==='localhost'||/^[\d.]+$/.test(name)||name.startsWith('['))return 'app';
 for(const base of [baseDomain,'localhost'].filter(Boolean)){if(name===base)return 'app';if(name.endsWith('.'+base)){const sub=name.slice(0,-base.length-1);return sub.includes('.')?null:sub}}
 return 'app';
}
