import { chromium } from 'playwright-core';
import { preview } from '../../frontend/node_modules/vite/dist/node/index.js';
import { serve } from './server.mjs';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const dir = await mkdtemp(resolve(tmpdir(),'netsentinel-browser-'));
const fixture = resolve(dir,'three.pcap');
execFileSync(process.execPath,['backend/service/demo-pcap.mjs',fixture]);
const origin='http://127.0.0.1:5173';
const device = process.env.NETSENTINEL_SMOKE_DEVICE;
const app=serve({executable:process.env.NETSENTINEL_BIN || resolve('backend/build/capture/netsentinel.exe'),
  mode:device ? '--interface' : '--replay',source:device || fixture,origin});
await once(app.server,'listening');
const site=await preview({root:resolve('frontend'),configFile:false,preview:{host:'127.0.0.1',port:5173,strictPort:true}});
let browser;
try {
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage();
 await page.goto(origin+'/?mode=live');
 await page.getByText(/Backend connected/).waitFor();
 if (device) {
   for (let i=0; i<2; i++) {
     await page.getByRole('button',{name:'Start capture'}).click();
     await page.getByRole('button',{name:'Stop capture'}).click();
     await page.getByRole('button',{name:'Start capture'}).waitFor();
     assert.equal(await page.getByRole('alert').count(),0);
   }
   console.log('PASS Edge live capture: two sessions started and stopped via dashboard.');
 } else {
 await page.getByRole('button',{name:'Start capture'}).click();
 await page.waitForFunction(() => document.querySelector('[data-testid=packet-count]')?.textContent === '3');
 await page.getByRole('button',{name:'Packets',exact:true}).click();
 await page.getByRole('cell',{name:'10.0.0.1',exact:true}).first().waitFor();
 assert.equal(await page.locator('tbody tr').count(),3);
 await page.getByPlaceholder(/Filter by name/).fill('TCP');
 await page.getByText('No matching packets found.').waitFor();
 await page.getByRole('button',{name:'Dashboard',exact:true}).first().click();
 await page.getByLabel('Display protocol').selectOption('TCP');
 await page.getByRole('button',{name:'Start capture'}).click();
 await page.waitForFunction(() => document.querySelector('[data-testid=packet-count]')?.textContent === '6');
 await page.getByRole('button',{name:'Packets',exact:true}).click();
 await page.getByText('No matching packets found.').waitFor();
 await page.getByLabel('Display protocol').selectOption('UDP');
 await page.getByRole('cell',{name:'10.0.0.1',exact:true}).first().waitFor();
 assert.equal(await page.locator('tbody tr').count(),6);
 await page.getByRole('button',{name:'6',exact:true}).click();
 await page.getByRole('region',{name:'Packet details'}).waitFor();
 await page.reload();
 await page.getByText(/Backend connected/).waitFor();
 await page.getByRole('button',{name:'Packets',exact:true}).click();
 assert.equal(await page.locator('tbody tr').count(),6);
 await page.getByRole('button',{name:'Clear Capture Log'}).click();
 await page.getByText('No matching packets found.').waitFor();
 await page.getByRole('button',{name:'Dashboard',exact:true}).first().click();
 assert.equal(await page.getByTestId('packet-count').innerText(),'0');
 console.log('PASS Edge replay: cumulative totals, filters, packet details, reload, explicit clear.');
 }
} finally {await browser?.close(); app.close(); await site.close(); await rm(dir,{recursive:true,force:true});}

