// Company addresses <slug> and <product>.<slug> (dash, erp, crm, …) need an HTTPS certificate on the server before they open.
// LANILOT_PROVISION_CMD (the cert script) is started right away when a company is created or renamed;
// LANILOT_TENANT_CONF_DIR is where it writes each company's HTTPS block. Without them (local dev) hosts are ready.
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export function provisionHosts(env=process.env){
 const cmd=env.LANILOT_PROVISION_CMD;if(!cmd)return;
 try{spawn(cmd,{detached:true,stdio:'ignore'}).unref()}catch{/* the cron run picks it up */}
}
// A product address (dash, erp, …) is ready once the company's HTTPS block lists it.
export function hostReady(slug,product='dash',env=process.env){
 const dir=env.LANILOT_TENANT_CONF_DIR;if(!dir)return true;
 try{return readFileSync(join(dir,`${slug}.conf`),'utf8').includes(`${product}.${slug}.`)}catch{return false}
}
export const dashReady=(slug,env=process.env)=>hostReady(slug,'dash',env);
