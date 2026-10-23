import {mkdirSync} from 'node:fs';
import {createApp} from '../server/app.js';
mkdirSync('data',{recursive:true});const {db}=createApp('data/lanilot.sqlite');
console.log('Seed ready:',...['loads','offers','trips','messages'].map(t=>`${t}=${db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n}`));db.close();
