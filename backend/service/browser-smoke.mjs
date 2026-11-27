import { chromium } from 'playwright-core';
import { preview } from '../../frontend/node_modules/vite/dist/node/index.js';
import { Monitor } from './monitor.mjs';
import { serve } from './server.mjs';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const dir = await mkdtemp(resolve(tmpdir(),'netsentinel-browser-'));
const fixture = resolve(dir,'three.pcap');
execFileSync(process.execPath,['backend/service/demo-pcap.mjs',fixture]);
const site=await preview({root:resolve('frontend'),configFile:false,preview:{host:'127.0.0.1',port:0}});
const origin='http://127.0.0.1:'+site.httpServer.address().port;
const device = process.env.NETSENTINEL_SMOKE_DEVICE;
const config={executable:process.env.NETSENTINEL_BIN || resolve('backend/build/capture/netsentinel.exe'),
  mode:device ? '--interface' : '--replay',source:device || fixture,sources:device ? [device] : [fixture,resolve(dir,'second.pcap')],origin};
if (!device) execFileSync(process.execPath,['backend/service/demo-pcap.mjs',config.sources[1]]);
if (!device) {
  const securityFixture = resolve(dir,'device-arrival-fixture.pcap');
  execFileSync(process.execPath,['backend/service/security-demo.mjs',securityFixture]);
  config.sources.push(securityFixture);
}
let app=serve({...config,port:0});
await once(app.server,'listening');
config.port=app.server.address().port;
let browser;
try {
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage();
 await page.addInitScript(port => {
   const NativeSocket=window.WebSocket;
   window.WebSocket=class extends NativeSocket {
     constructor(url,...args) { super(String(url)==='ws://127.0.0.1:8080' ? 'ws://127.0.0.1:'+port : url,...args); }
   };
 },config.port);
 const pageErrors=[];
 await page.setViewportSize({width:1366,height:768});
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto(origin);
 await page.getByRole('button',{name:'Open local dashboard'}).click();
 await page.getByText(/Backend connected/).waitFor();
 if (device) {
   let packetTotal = 0;
   for (let i=0; i<2; i++) {
     await page.getByRole('button',{name:'Start capture'}).click();
     await page.getByRole('button',{name:'Stop capture'}).waitFor();
     if (i === 0) {
       await page.waitForFunction(() => Number(document.querySelector('[data-testid=packet-count]')?.textContent?.replaceAll(',','')) > 0,
         undefined, {timeout:8000}).catch(error => { if (error.name !== 'TimeoutError') throw error; });
     }
     if (i === 0 && process.env.NETSENTINEL_CHECK_NEIGHBORS === '1') {
       await page.getByRole('button',{name:'Devices',exact:true}).click();
       await page.getByText(/Passive inventory ·/).waitFor();
       console.log('Passive Windows inventory:',await page.getByRole('definition').first().innerText());
     }
     await page.getByRole('button',{name:'Packets',exact:true}).click();
     await page.getByRole('button',{name:'Stop capture',exact:true}).click();
     await page.getByRole('button',{name:'Dashboard',exact:true}).first().click();
     await page.getByRole('button',{name:'Start capture'}).waitFor();
     assert.equal(await page.getByRole('alert').count(),0);
     const total=Number((await page.getByTestId('packet-count').innerText()).replaceAll(',',''));
     assert.ok(total >= packetTotal); packetTotal=total;
   }
   console.log('PASS Edge live capture: two sessions started on Dashboard and stopped on Packets; frames observed:',packetTotal);
 } else {
 await page.getByRole('button',{name:'Start capture'}).click();
 await page.waitForFunction(() => document.querySelector('[data-testid=packet-count]')?.textContent === '3');
 await page.getByRole('button',{name:'3',exact:true}).click();
 await page.getByRole('region',{name:'Packet details'}).waitFor();
 await page.getByRole('cell',{name:'10.0.0.1',exact:true}).first().waitFor();
 assert.equal(await page.locator('tbody tr').count(),3);
 await page.getByPlaceholder(/Filter by name/).fill('TCP');
 await page.getByText('No matching packets found.').waitFor();
 await page.getByRole('button',{name:'Dashboard',exact:true}).first().click();
 await page.getByLabel('Capture source').selectOption('1');
 await page.getByRole('button',{name:'Packets',exact:true}).click();
 await page.getByLabel('Display protocol').selectOption('TCP');
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 await page.getByRole('button',{name:'Start capture'}).click();
 await page.waitForFunction(() => document.querySelector('[data-testid=packet-count]')?.textContent === '6');
 await page.getByRole('button',{name:'Packets',exact:true}).click();
 await page.getByText('No matching packets found.').waitFor();
 await page.getByPlaceholder(/Filter by name/).fill('53');
 await page.getByLabel('Display protocol').selectOption('UDP');
 await page.getByRole('cell',{name:'10.0.0.1',exact:true}).first().waitFor();
 assert.equal(await page.locator('tbody tr').count(),6);
 await page.getByRole('button',{name:'6',exact:true}).click();
 await page.getByRole('region',{name:'Packet details'}).waitFor();
 await page.getByText(config.sources[1],{exact:true}).last().waitFor();
 await page.getByRole('button',{name:'Devices',exact:true}).click();
 await page.getByRole('heading',{name:'Devices',exact:true}).waitFor();
 await page.getByText('10.0.0.1',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'Alerts',exact:true}).click();
 await page.getByText(/No security events recorded/).waitFor();
 await page.getByRole('button',{name:'Logs',exact:true}).click();
 await page.getByText('No archive service connected.').waitFor();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 const dns=page.getByLabel('Active reverse DNS lookups');
 await dns.click(); await page.locator('input[type=checkbox]:checked').waitFor();
 await dns.click(); await page.locator('input[type=checkbox]:checked').waitFor({state:'detached'});
 await page.reload();
 await page.getByText(/Backend connected/).waitFor();
 assert.equal(await page.getByLabel('Capture source').inputValue(),'1');
 await page.getByRole('button',{name:'Packets',exact:true}).click();
 assert.equal(await page.locator('tbody tr').count(),6);
 await page.getByRole('button',{name:'Clear Capture Log'}).click();
 await page.getByText('No matching packets found.').waitFor();
 await page.getByRole('button',{name:'Dashboard',exact:true}).first().click();
 assert.equal(await page.getByTestId('packet-count').innerText(),'0');
 const disconnected=once(app.server,'close');
 app.close(); await disconnected;
 await page.getByText(/Backend disconnected/).waitFor();
 assert.ok(await page.getByRole('button',{name:'Start capture'}).isDisabled());
 const replayMonitor = new Monitor();
 app=serve({...config,monitor:replayMonitor}); await once(app.server,'listening');
 await page.getByText(/Backend connected/).waitFor();
 await page.getByRole('button',{name:'Start capture'}).click();
 await page.waitForFunction(() => document.querySelector('[data-testid=packet-count]')?.textContent === '3');
 await page.getByLabel('Capture source').selectOption('2');
 await page.getByRole('button',{name:'Packets',exact:true}).click();
 await page.getByLabel('Display protocol').selectOption('TCP');
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 await page.getByRole('button',{name:'Start capture'}).click();
 await page.waitForFunction(() => document.querySelector('[data-testid=packet-count]')?.textContent === '6');
 await page.getByRole('button',{name:'Alerts',exact:true}).click();
 await page.getByText('New Device',{exact:true}).waitFor();
 await page.getByRole('button',{name:/Show details/}).click();
 const alertDetails = page.getByRole('region',{name:'Alert details'});
 await alertDetails.getByText(config.sources[2],{exact:true}).waitFor();
 for (const [width,height] of [[1366,768],[1920,1080],[580,800]]) {
   await page.setViewportSize({width,height});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Alerts overflow at '+width);
 }
 await page.setViewportSize({width:1366,height:768});
 if (process.env.NETSENTINEL_ALERT_SNAPSHOT) await page.screenshot({path:process.env.NETSENTINEL_ALERT_SNAPSHOT});
 await alertDetails.getByRole('button',{name:/View related packets/}).click();
 await page.getByText('Clear alert filter').waitFor();
 assert.equal(await page.locator('tbody tr').count(),1);
 await page.getByRole('button',{name:'Clear alert filter'}).click();
 await page.getByRole('button',{name:'Alerts',exact:true}).click();
 await page.getByLabel('Review status').selectOption('acknowledged');
 await page.getByText('No alerts match the current filters.').waitFor();
 await page.getByLabel('Review status').selectOption('');
 await page.getByRole('button',{name:'Acknowledge',exact:true}).click();
 await page.locator('.security-review').getByText('Acknowledged',{exact:true}).waitFor();
 await page.getByText('Configure alert rules',{exact:true}).click();
 await page.getByLabel('Device arrivals').selectOption('off');
 await page.getByLabel('Frames per second').fill('120');
 await page.getByRole('button',{name:'Save monitoring rules'}).click();
 await page.getByRole('button',{name:'Devices',exact:true}).click();
 await page.getByRole('button',{name:/Details for Unknown Device · 02:00:00:00:00:14/}).click();
 const panel=page.getByRole('dialog');
 const label=panel.getByLabel('Device label');
 await label.fill('Fixture laptop');
 await panel.getByLabel('Trust status').selectOption('trusted');
 await panel.getByRole('button',{name:'Save changes'}).click();
 await panel.getByText('Preferences saved.').waitFor();
 await page.reload();
 await page.getByRole('button',{name:'Devices',exact:true}).click();
 const card=page.getByRole('button',{name:/Details for Fixture laptop/});
 await card.waitFor();
 if (process.env.NETSENTINEL_UI_SNAPSHOT) await page.screenshot({path:process.env.NETSENTINEL_UI_SNAPSHOT});
 for (const [width,height] of [[1366,768],[1920,1080],[560,800]]) {
   await page.setViewportSize({width,height});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Devices overflows at '+width);
 }
 await page.setViewportSize({width:1366,height:768});
 await page.getByRole('button',{name:'Trusted',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.inventory-card').length===1);
 await page.getByLabel('Search local devices').fill('192.0.2.20');
 await card.click(); await label.waitFor();
 assert.equal(await label.inputValue(),'Fixture laptop');
 assert.equal(await panel.getByLabel('Trust status').inputValue(),'trusted');
 await panel.getByRole('button',{name:'View packets'}).click();
 await page.getByText('Clear device filter').waitFor();
 assert.equal(await page.locator('tbody tr').count(),1);
 await page.getByRole('button',{name:'Clear device filter'}).click();
 await page.getByRole('button',{name:'Alerts',exact:true}).click();
 await page.locator('.security-review').getByText('Acknowledged',{exact:true}).waitFor();
 await page.getByText('Configure alert rules',{exact:true}).click();
 assert.equal(await page.getByLabel('Device arrivals').inputValue(),'off');
 assert.equal(await page.getByLabel('Frames per second').inputValue(),'120');
 await page.getByRole('button',{name:'Logs',exact:true}).click();
 let chooserCount = 0;
 page.on('filechooser',() => chooserCount++);
 const choosing = page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'Upload',exact:true}).click();
 const rows = Array.from({length:45},(_,i) => [i+1,'192.0.2.1','192.0.2.2','UDP','60 B','row '+(i+1),100,'10:00'].join(','));
 const inputFile = resolve(dir,'fixture.csv');
 await writeFile(inputFile,['ID,Source,Destination,Protocol,Size,Name,Timestamp,Time',...rows].join('\n'));
 await (await choosing).setFiles(inputFile);
 const imported = page.locator('.imported-log');
 await imported.getByText('Imported metadata · fixture.csv').waitFor();
 const next = imported.getByRole('button',{name:'Next'});
 const bounds = await next.boundingBox();
 assert.ok(bounds && bounds.y+ bounds.height <= 768,'Import pager is below the desktop viewport');
 assert.equal(await imported.locator('tbody tr').count(),20);
 await next.click();
 await imported.getByText('row 21',{exact:true}).waitFor();
 assert.equal(await imported.locator('tbody tr').count(),20);
 await next.click();
 await imported.getByText('row 45',{exact:true}).waitFor();
 assert.equal(await imported.locator('tbody tr').count(),5);
 assert.ok(await next.isDisabled());
 assert.equal(chooserCount,1);

 await page.getByRole('button',{name:'Packets',exact:true}).click();
 await page.getByRole('button',{name:'Export',exact:true}).click();
 await page.locator('.modal-body select').selectOption('JSON');
 let downloadCount = 0;
 page.on('download',() => downloadCount++);
 const downloading = page.waitForEvent('download');
 await page.getByRole('button',{name:'Download Export'}).click();
 const download = await downloading;
 assert.match(download.suggestedFilename(),/\.json$/);
 const output = resolve(dir,'export.json');
 await download.saveAs(output);
 assert.equal(JSON.parse(await readFile(output,'utf8')).length,6);
 assert.equal(downloadCount,1);
 await page.getByPlaceholder(/Filter by name/).fill('192.0.2.10');
 const count = await page.locator('tbody input[type=checkbox]').count();
 assert.equal(count,2);
 await page.locator('tbody input[type=checkbox]').first().check();
 for (const [range,expected] of [[/Filtered View/,count],[/Selected Packets/,1]]) {
   await page.getByRole('button',{name:'Export',exact:true}).click();
   await page.locator('.modal-body select').selectOption('CSV');
   await page.getByLabel(range).check();
   const file = page.waitForEvent('download');
   await page.getByRole('button',{name:'Download Export'}).click();
   const path = resolve(dir,'range-'+expected+'.csv');
   await (await file).saveAs(path);
   const csv = await readFile(path,'utf8');
   const dataRows = csv.trim().split('\n').slice(1);
   assert.equal(dataRows.length,expected);
   assert.ok(dataRows.every(line=>line.includes('192.0.2.10')));
 }
 assert.equal(downloadCount,3);

 for (const [width,height] of [[1366,768],[1920,1080]]) {
   await page.setViewportSize({width,height});
   for (const route of ['Dashboard','Packets','Devices','Alerts','Logs','Settings']) {
     await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:route,exact:true}).click();
     const shell = page.locator('.desktop-content');
     assert.ok(await shell.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Main content overflows: '+route+' '+width);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Window overflows: '+route);
     if (route==='Dashboard') {
       await page.getByLabel('Chart metric').selectOption('bandwidth');
       await page.getByLabel('Time range').selectOption('1h');
       assert.equal(await page.getByTestId('packet-count').innerText(),'6');
       assert.equal(await page.locator('.metric-card').count(),3);
       assert.ok(await page.locator('.traffic-card').evaluate(el=>el.getBoundingClientRect().bottom <= document.querySelector('.metric-grid').getBoundingClientRect().top));
     }
     if (route==='Packets') {
       await page.getByPlaceholder(/Filter by name/).fill('');
       const box = await page.locator('.packet-rail').boundingBox();
       const table = await page.locator('.packet-stream').boundingBox();
       assert.ok(box.x >= table.x+table.width-1);
     }
     if (route==='Logs') {
       await page.getByRole('tab',{name:'Security Event Logs'}).click();
       await page.locator('.log-severity').first().waitFor();
       assert.equal(await page.locator('button.log-severity').count(),0);
     }
     if (process.env.NETSENTINEL_DESKTOP_REVIEW) {
       await page.screenshot({path:resolve(process.env.NETSENTINEL_DESKTOP_REVIEW,route+'-'+width+'.png')});
     }
   }
 }
 const longEvidence = 'Replay layout fixture '+ '0123456789abcdef'.repeat(90);
 const source = '\\Device\\NPF_{00000000-0000-0000-0000-000000000001}';
 const fixtureEvent = replayMonitor.detector.events[0];
 replayMonitor.detector.events = Array.from({length:49},(_,i)=>({...fixtureEvent,id:'layout-'+i,
   origin:'Replay',source,ip:'2001:db8:abcd:1234:abcd:1234:abcd:1234',evidence:longEvidence,
   type:'Conflicting ARP claims',severity:i%2?'Critical':'Medium',acknowledged:false}));
 await page.getByRole('button',{name:'Alerts',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.security-entry').length===24);
 await page.getByRole('button',{name:/Show details/}).first().click();
 const evidence = page.getByText(longEvidence,{exact:true});
 for (const width of [1366,1920,640]) {
   await page.setViewportSize({width,height:768});
   assert.ok(await evidence.evaluate(el=>el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight));
   assert.ok(await page.locator('.security-list').evaluate(el=>el.scrollWidth<=el.clientWidth && el.scrollHeight>el.clientHeight));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await page.getByText('25–48',{exact:true}).waitFor();
 await page.getByLabel('Severity',{exact:true}).selectOption('Critical');
 await page.waitForFunction(()=>document.querySelectorAll('.security-entry[data-severity=Critical]').length===24);
 console.log('PASS Edge replay: capture, filters, reconnect, device details, trust, alerts, disk-backed import, three verified export ranges and 49-event layout fixture.');
 }
 assert.deepEqual(pageErrors,[]);
} finally {await browser?.close(); app.close(); await site.close(); await rm(dir,{recursive:true,force:true});}

