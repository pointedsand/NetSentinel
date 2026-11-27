import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { serve } from '../../backend/service/server.mjs';
import { preview } from '../../frontend/node_modules/vite/dist/node/index.js';

const run=promisify(execFile);
const dir=await mkdtemp(join(tmpdir(),'netsentinel-firefox-'));
const output=resolve(process.argv[2] || 'docs/assignment-5/evidence/firefox-dashboard.png');
let site,bridge;
try {
  const file=join(dir,'demo.pcap');
  await run(process.execPath,['backend/service/demo-pcap.mjs',file]);
  await mkdir(join(dir,'profile'));
  const html=await readFile('frontend/dist/index.html','utf8');
  let didRender=false, acknowledgeRender;
  const rendered=new Promise(r=>{acknowledgeRender=r;});
  const testPort={name:'isolated-test-port',configurePreviewServer(server) {
    server.middlewares.use((req,res,next)=>{
      if (req.url==='/ready') { didRender=true;acknowledgeRender();res.end();return; }
      if (req.url==='/hold-image') { rendered.then(()=>res.end());return; }
      if (req.url!=='/') return next();
      const port=bridge.server.address().port;
      const script='<script>window.WebSocket=class extends WebSocket {constructor(url,...args){super(url==="ws://127.0.0.1:8080" ? "ws://127.0.0.1:'+port+'" : url,...args)}};</script>';
      res.setHeader('Content-Type','text/html');
      const check='<img hidden src="/hold-image" alt=""><script>let started=false;const observer=new MutationObserver(()=>{const start=document.querySelector(\'button[aria-label="Start capture"]\')||Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim().endsWith("Start capture"));if(!started && start && !start.disabled){started=true;start.click();} if(document.querySelector(\'[data-testid="packet-count"]\')?.textContent==="3"){observer.disconnect();requestAnimationFrame(()=>fetch("/ready"));}});observer.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});</script>';
      res.end(html.replace('<head>','<head>'+script).replace('</body>',check+'</body>'));
    });
  }};
  site=await preview({root:resolve('frontend'),configFile:false,plugins:[testPort],preview:{host:'127.0.0.1',port:0}});
  const origin='http://127.0.0.1:'+site.httpServer.address().port;
  bridge=serve({port:0,mode:'--replay',source:file,sourceLabels:['Demo replay'],credentialFile:join(dir,'admin.json'),
    executable:process.env.NETSENTINEL_BIN || resolve('backend/build/capture/netsentinel.exe'),origin});
  await once(bridge.server,'listening');
  const binary=process.env.FIREFOX_BIN || join(process.env.ProgramFiles,'Mozilla Firefox','firefox.exe');
  await run(binary,['--no-remote','--headless','--profile',join(dir,'profile'),'--window-size','1366,768',
    '--screenshot',output,origin],{timeout:45000,windowsHide:true});
  if (!didRender) throw Error('Firefox exited before the replay dashboard showed three records.');
  console.log('Firefox rendered three replay frames on the Dashboard at 1366 x 768.');
} finally {
  await bridge?.close(); await site?.close();
  await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
