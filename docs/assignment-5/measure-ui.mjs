import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { preview } from '../../frontend/node_modules/vite/dist/node/index.js';
import { serve } from '../../backend/service/server.mjs';
import { Detections } from '../../backend/service/detections.mjs';

const require = createRequire(new URL('../../backend/service/package.json',import.meta.url));
const { chromium } = require('playwright-core');
const device = process.env.NETSENTINEL_SMOKE_DEVICE;
if (!device) throw Error('Select an authorized local Ethernet source in NETSENTINEL_SMOKE_DEVICE.');
function summary(values) {
  if (!values.length) throw Error('No matching latency samples.');
  values.sort((a,b)=>a-b);
  const at=p=>Number(values[Math.ceil(p*values.length)-1].toFixed(3));
  return {n:values.length,min_ms:Number(values[0].toFixed(3)),median_ms:at(.5),p95_ms:at(.95),max_ms:at(1)};
}
const times=[];
for (let i=0;i<200;i++) {
  const detector=new Detections(), ctx={scope:'fixture',source:'test',replay:false};
  const stats={rateSeconds:3,packetsPerSecond:1500};
  for (const time of [0,61000]) detector.rate(ctx,stats,time);
  const start=performance.now();
  detector.rate(ctx,stats,62000);
  times.push(performance.now()-start);
  if (detector.events.length!==1) throw Error('Fixture failed to trigger.');
}
console.log('Threshold evaluation to event insertion',JSON.stringify(summary(times)));
const dir=await mkdtemp(join(tmpdir(),'netsentinel-timing-'));
const site=await preview({root:resolve('frontend'),configFile:false,preview:{host:'127.0.0.1',port:0}});
const origin='http://127.0.0.1:'+site.httpServer.address().port;
const app=serve({port:0,mode:'--interface',source:device,credentialFile:join(dir,'admin.json'),
  executable:process.env.NETSENTINEL_BIN || resolve('backend/build/capture/netsentinel.exe'),origin});
const sendTimes=new Map();
app.server.on('connection',socket=>{
  const send=socket.send.bind(socket);
  socket.send=(data,...args)=>{
    const msg=JSON.parse(data);
    if (msg.type==='batch' && msg.packets.length) sendTimes.set(msg.packets.at(-1).id,Date.now());
    return send(data,...args);
  };
});
let browser;
try {
  await once(app.server,'listening');
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  await page.addInitScript(port=>{
    const Native=window.WebSocket;
    window.measurements=[];
    window.eligibleBatches=0;
    window.WebSocket=class extends Native {
      constructor(url,...args) {
        super(url==='ws://127.0.0.1:8080' ? 'ws://127.0.0.1:'+port : url,...args);
        this.addEventListener('message',event=>{
          const msg=JSON.parse(event.data);
          if (msg.type!=='batch' || msg.captureState!=='RUNNING' || !msg.packets.length) return;
          const count=msg.packetCount+msg.rejected;
          const current=()=>Number(document.querySelector('[data-testid=packet-count]')?.textContent.replaceAll(',',''));
          if (current()===count) return;
          window.eligibleBatches++;
          const item={id:msg.packets.at(-1).id,received:Date.now(),first:Math.min(...msg.packets.map(p=>p.timestampUs))/1000};
          const observer=new MutationObserver(()=>{
            if (current()===count) {
              item.dom=Date.now();window.measurements.push(item);observer.disconnect();
            }
          });
          observer.observe(document.body,{childList:true,subtree:true,characterData:true});
          setTimeout(()=>observer.disconnect(),5000);
        });
      }
    };
  },app.server.address().port);
  await page.goto(origin);
  await page.getByText(/Backend connected/).waitFor();
  await page.getByRole('button',{name:'Start capture'}).click();
  await page.getByRole('button',{name:'Stop capture'}).waitFor();
  await new Promise(r=>setTimeout(r,20_000));
  await page.getByRole('button',{name:'Stop capture'}).click();
  await page.getByRole('button',{name:'Start capture'}).waitFor();
  const samples=await page.evaluate(()=>window.measurements);
  console.log('Bridge send to Edge receive',JSON.stringify(summary(samples.map(v=>v.received-sendTimes.get(v.id)))));
  console.log('Oldest batched capture timestamp to dashboard DOM',JSON.stringify(summary(samples.map(v=>v.dom-v.first))));
  console.log('Nonempty outgoing batches including final:',sendTimes.size,'eligible RUNNING changes:',await page.evaluate(()=>window.eligibleBatches),'matched:',samples.length);
} finally { await browser?.close(); await app.close(); await site.close(); await rm(dir,{recursive:true,force:true}); }
