import {mkdirSync} from 'node:fs';
import path from 'node:path';
import express from 'express';
import {existsSync} from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
import {createApp} from './app.js';
mkdirSync('data',{recursive:true});const {app,telegram}=createApp('data/lanilot.sqlite');
if(process.env.NODE_ENV==='production'){app.use(express.static('dist'));app.get('/{*splat}',(req,res)=>res.sendFile(path.resolve('dist/index.html')));}
const port=Number(process.env.PORT)||3001;app.listen(port,'127.0.0.1',()=>console.log(`Lanilot API: http://127.0.0.1:${port}`));

// External notification worker is paused while the product is frontend-only.
