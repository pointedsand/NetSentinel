import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { connect } from 'node:net';
import { once } from 'node:events';

const require = createRequire(new URL('../backend/service/package.json', import.meta.url));
const { _electron } = require('playwright-core');
const run = promisify(execFile);
const executablePath = resolve(process.argv[2] || 'release/win-unpacked/NetSentinel.exe');
const dir = await mkdtemp(join(tmpdir(), 'netsentinel-desktop-'));
const system = join(process.env.SystemRoot, 'System32');
const env = { ...process.env, LOCALAPPDATA: dir };
for (const key of Object.keys(env)) {
  if (/^(path|NODE_OPTIONS|NODE_PATH|NPCAP_SDK_ROOT|NETSENTINEL_.*|ELECTRON_RUN_AS_NODE)$/i.test(key)) delete env[key];
}
env.Path = [system, join(system, 'WindowsPowerShell/v1.0'), process.env.SystemRoot].join(';');
const profile = '--user-data-dir=' + join(dir, 'chromium');
let desktop, page, port, largeArchive;

async function launch(demo, binary = executablePath) {
  desktop = await _electron.launch({ executablePath: binary, chromiumSandbox: true, env,
    args: demo ? [profile, '--demo'] : [profile], timeout: 25000 });
  await desktop.evaluate(({app},path)=>app.setPath('documents',path),dir);
  page = await desktop.firstWindow({ timeout: 20000 });
  page.on('console', message => {
    if (message.type() === 'error') console.error('Renderer:', message.text());
  });
  page.setDefaultTimeout(12000);
  await page.getByText('Backend connected', { exact: true }).waitFor();
  assert.equal(page.url(), 'netsentinel://desktop/');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  port = Number(await page.locator('meta[name="bridge-port"]').getAttribute('content'));
  assert.ok(port > 0);
}
const button = name => page.getByRole('button', { name, exact: true });
const navigate = name => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
async function saveArchive(format,range) {
  await button('Export').click();
  await page.locator('.modal-body select').selectOption(format);
  if (range) await page.getByRole('radio',{name:range}).check();
  await button('Save archive').click();
  await page.locator('.modal-box').waitFor({state:'hidden'});
  return (await page.getByText(/^Saved to Logs · /).innerText()).split(' · ')[1];
}
async function openLargeArchive() {
  await navigate('Logs');
  await button('Refresh Archives').click();
  await button('Open '+largeArchive).click();
  const count = page.getByText('30,000 packet records',{exact:true});
  await count.waitFor();
  const [close,records,refresh,folder,toolbar,heading] = await Promise.all([
    button('Close log'),count,button('Refresh Archives'),button('Open Logs Folder'),
    page.locator('.logs-management-toolbar'),page.locator('.imported-log h2')
  ].map(el=>el.boundingBox()));
  for (const [left,right] of [[close,records],[refresh,folder]]) {
    assert.ok(Math.abs(left.y+left.height/2-right.y-right.height/2)<=1,'Archive controls must share a row');
    assert.ok(Math.abs(right.x-left.x-left.width-8)<=1,'Expected an eight-pixel gap');
  }
  assert.ok(heading.y+heading.height<=close.y,'Archive heading must precede the summary');
  assert.ok(Math.abs(toolbar.x+toolbar.width-folder.x-folder.width)<=1,'Archive buttons must align right');
  assert.equal(await page.locator('.imported-log tbody tr').count(),20);
  await page.locator('.imported-log').getByRole('button',{name:'Next',exact:true}).click();
  await page.getByText('Page 2 of 1500').waitFor();
  await button('Close log').click();
  await page.locator('.imported-log').waitFor({state:'hidden'});
}
async function verifyRetention() {
  const copy = join(dir, 'packaged-retention-test');
  await cp(dirname(executablePath), copy, { recursive: true });
  const path = join(copy, 'resources/capture/demo.pcap');
  const fixture = await readFile(path);
  // Keep each replay below the worker mailbox capacity so only history eviction is exercised.
  env.NETSENTINEL_BUFFER = '4096';
  await writeFile(path, Buffer.concat([fixture.subarray(0,24), ...Array(1000).fill(fixture.subarray(24))]));
  await launch(true, join(copy, basename(executablePath)));
  delete env.NETSENTINEL_BUFFER;
  const snapshot = async label => console.log(label, await desktop.evaluate(({app,BrowserWindow}) => {
    const metrics = app.getAppMetrics();
    const memory = pid => Math.round(metrics.find(p=>p.pid === pid).memory.workingSetSize / 1024);
    return {bridgeMiB:memory(process.pid), rendererMiB:memory(BrowserWindow.getAllWindows()[0].webContents.getOSProcessId())};
  }));
  async function rendererHeap(label) {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('HeapProfiler.collectGarbage');
      const {usedSize} = await cdp.send('Runtime.getHeapUsage');
      console.log(label,Math.round(usedSize/1048576),'MiB renderer JS heap after test-only GC');
    } finally { await cdp.detach(); }
  }
  const limit = page.getByLabel('Packet history limit');
  async function choose(capacity) {
    await navigate('Settings');
    await limit.selectOption(String(capacity));
    await page.waitForFunction(n=>document.querySelector('#history-limit')?.value === String(n),capacity);
    await navigate('Packets');
    await diagnostics();
  }
  async function diagnostics() {
    const panel = page.locator('.session-diagnostics');
    if (!(await panel.evaluate(el=>el.open))) await panel.locator('summary').click();
  }
  const counter = label => page.getByText(label,{exact:true}).locator('..').locator('dd');
  async function expectCount(label,value) {
    await counter(label).filter({hasText:new RegExp('^'+value+'$')}).waitFor();
  }
  let frames = 0;
  async function replay() {
    await button('Start capture').click();
    frames += 3000;
    await expectCount('Captured frames',frames.toLocaleString());
    await button('Start capture').waitFor();
  }
  async function bounds(size) {
    const box = page.locator('.packet-virtualized-container');
    await box.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await button(String(frames-size+1)).waitFor();
    await box.evaluate(el=>{el.scrollTop=0;});
    await button(String(frames)).waitFor();
    assert.ok(await box.locator('.row-num').count() < 50);
    await expectCount('History evictions',(frames-size).toLocaleString());
    await expectCount('Output drops','0');
  }
  await navigate('Settings');
  assert.equal(await limit.inputValue(),'30000');
  await navigate('Packets');
  await diagnostics();
  await snapshot('Empty working set');
  for (let i=0; i<11; i++) await replay();
  await bounds(30000);
  await snapshot('Standard working set');
  largeArchive=await saveArchive('CSV');
  await choose(50000);
  await bounds(30000);
  for (let i=0; i<14; i++) await replay();
  await bounds(50000);
  const table = page.locator('.packet-virtualized-container');
  const search = page.getByLabel('Search packets');
  const latency = async (label,action) => {
    const start = performance.now();
    await action();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    console.log(label,Math.round(performance.now()-start),'ms (automation through two animation frames)');
  };
  await latency('Scroll at 50k',async()=>{
    await table.evaluate(el=>{el.scrollTop=41*20000;});
    await button(String(frames-20000)).waitFor();
  });
  const id = frames-20000;
  await page.getByLabel('Select packet '+id,{exact:true}).check();
  await button(String(id)).click();
  const y = () => button(String(id)).evaluate(el=>el.getBoundingClientRect().top);
  const top = await y();
  await replay();
  assert.ok(Math.abs(await y()-top)<2,'Inspected packet moved during capture');
  assert.ok(await page.getByLabel('Select packet '+id,{exact:true}).isChecked());
  assert.match(await page.locator('.packet-details h3').innerText(),new RegExp('Packet '+id+' '));
  await button('Close details').click();
  await latency('Text search at 50k',async()=>{
    await search.fill('192.0.2.20');
    await page.waitForFunction(()=>[...document.querySelectorAll('.row-num')].length>0 &&
      [...document.querySelectorAll('.row-num')].every(td=>td.nextElementSibling.textContent === '192.0.2.20'));
  });
  await latency('Protocol filter at 50k',async()=>{
    await page.getByLabel('Display protocol').selectOption('TCP');
    await page.getByText('No matching packets found.').waitFor();
  });
  await page.getByLabel('Display protocol').selectOption('');
  await search.fill('');
  await snapshot('Extended working set');
  await rendererHeap('Extended');
  await page.reload();
  await page.getByText('Backend connected',{exact:true}).waitFor();
  await navigate('Packets');
  await diagnostics();
  await bounds(50000);
  await choose(10000);
  await bounds(10000);
  await replay();
  await bounds(10000);
  await snapshot('Balanced working set after shrink');
  await choose(5000);
  await bounds(5000);
  await replay();
  await bounds(5000);
  await snapshot('Low working set after shrink');
  await rendererHeap('Low after shrink');
  await button('Clear Capture Log').click();
  await expectCount('Captured frames','0');
  await expectCount('History evictions','0');
  await expectCount('Retained / capacity','0 / 5,000');
  await openLargeArchive();
  await closeWindow();
  console.log('PASS packaged retention: '+frames+' captured; four capacities, newest and oldest IDs, anchored selection, search, eviction, zero output drops and clear.');
}
async function verifyWindowSize() {
  const theme = await desktop.evaluate(({ BrowserWindow, nativeTheme }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return { title: win.getTitle(), dark: nativeTheme.shouldUseDarkColors, border: win.getAccentColor(),
      highContrast: nativeTheme.shouldUseHighContrastColors };
  });
  assert.equal(theme.title, 'NetSentinel');
  assert.ok(theme.dark);
  if (!theme.highContrast) assert.equal(String(theme.border).replace('#', '').toLowerCase(), '101925');
  const initial = await desktop.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const bounds = win.getBounds();
    return { bounds, area: screen.getDisplayMatching(bounds).workArea,
      minimum: win.getMinimumSize(), resizable: win.isResizable(), maximizable: win.isMaximizable() };
  });
  const { bounds, area } = initial;
  assert.deepEqual(initial.minimum, [1024, 650]);
  assert.ok(initial.resizable && initial.maximizable);
  assert.equal(bounds.width, Math.max(1024, Math.min(1280, area.width)));
  assert.equal(bounds.height, Math.max(650, Math.min(800, area.height)));
  if (area.width >= 1024 && area.height >= 650) {
    assert.ok(bounds.x >= area.x && bounds.y >= area.y &&
      bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height);
  }
  await desktop.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const maximized = new Promise(resolve => win.once('maximize', resolve));
    win.maximize();
    await maximized;
    const restored = new Promise(resolve => win.once('unmaximize', resolve));
    win.unmaximize();
    await restored;
  });
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 650));
  await page.waitForFunction(() => window.outerWidth === 1024 && window.outerHeight === 650);
  const minimum = await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(800, 500);
    return win.getSize();
  });
  assert.deepEqual(minimum, [1024, 650]);
  for (const route of ['Dashboard', 'Packets', 'Devices', 'Alerts', 'Logs', 'Settings']) {
    await navigate(route);
    const content = page.locator('.desktop-content');
    assert.ok(await content.evaluate(el => el.scrollWidth <= el.clientWidth + 1), route + ' overflows horizontally');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const controls = page.locator('.desktop-header').getByRole('button', { name: 'Start capture' });
    await controls.click({ trial: true });
    if (route === 'Settings') {
      const limit = page.getByLabel('Packet history limit');
      assert.equal(await limit.inputValue(),'5000');
      await limit.click({trial:true});
    }
    if (route === 'Dashboard') {
      await content.locator('.overview-previews').scrollIntoViewIfNeeded();
      assert.ok(await content.evaluate(el => el.scrollHeight <= el.clientHeight || el.scrollTop > 0));
    }
  }
  await navigate('Dashboard');
  console.log('PASS native launch ' + bounds.width + 'x' + bounds.height + ' in work area ' +
    area.width + 'x' + area.height + ', maximize/restore, 1024x650 minimum and six-page layout.');
}
async function settings() {
  await navigate('Settings');
  await page.getByRole('tab', { name: 'Access Control' }).click();
}
async function closeWindow() {
  const exit = once(desktop.process(), 'exit');
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await exit;
  desktop = undefined;
  const socket = connect(port, '127.0.0.1');
  try {
    await assert.rejects(once(socket, 'connect'), { code: 'ECONNREFUSED' });
  } finally { socket.destroy(); }
}

try {
  await verifyRetention();
  await launch(true);
  await button('Start capture').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="packet-count"]')?.textContent === '3');
  await verifyWindowSize();
  await openLargeArchive();
  console.log('PASS archived 30,000 packets, cleared live history at 5,000, reopened and paged archive before and after relaunch.');
  await navigate('Packets');
  await button('3').click();
  await page.getByRole('region', { name: 'Packet details' }).waitFor();
  await page.getByLabel('Display protocol').selectOption('TCP');
  await page.getByText('No matching packets found.').waitFor();
  await page.getByLabel('Display protocol').selectOption('');
  assert.equal(await page.locator('tbody tr').count(), 3);
  for (const format of ['CSV', 'JSON']) {
    const name=await saveArchive(format);
    const output=join(dir,'NetSentinel_Logs',name);
    const data = await readFile(output, 'utf8');
    assert.equal(format === 'JSON' ? JSON.parse(data).length : data.trim().split('\n').length - 1, 3);
    await navigate('Logs');
    const choosing = page.waitForEvent('filechooser');
    await button('Import External Log').click();
    await (await choosing).setFiles(output);
    await page.getByRole('heading',{name:'Imported metadata · '+name}).waitFor();
    assert.equal(await page.locator('.imported-log tbody tr').count(), 3);
    await navigate('Packets');
  }
  await page.getByLabel('Select packet 2',{exact:true}).check();
  const selected=await saveArchive('JSON',/^Selected Packets/);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'NetSentinel_Logs',selected),'utf8')).map(p=>p.id),[2]);
  await page.getByLabel('Display protocol').selectOption('TCP');
  const filtered=await saveArchive('JSON',/^Filtered View/);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'NetSentinel_Logs',filtered),'utf8')),[]);
  await page.getByLabel('Display protocol').selectOption('');
  await navigate('Alerts');
  await button('Acknowledge').click();
  await page.locator('.security-review').getByText('Acknowledged', { exact: true }).waitFor();
  await settings();
  await button('Set administrator password').click();
  const proof = await page.locator('.admin-settings code').innerText();
  assert.equal(resolve(proof, '../..'), dir);
  const choosing = page.waitForEvent('filechooser');
  await button('Choose Setup File').click();
  await (await choosing).setFiles(proof);
  await page.getByText('Setup file verified.', { exact: true }).waitFor();
  const password = randomBytes(24).toString('hex');
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Confirm new password').fill(password);
  await button('Enable protection').click();
  await button('Unlock administrator controls').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Unlock', exact: true }).click();
  await button('Lock Now').click();
  await button('Unlock administrator controls').waitFor();
  console.log('PASS packaged replay, details, filtering, totals, arrival acknowledgment, CSV/JSON exports and imports, setup, unlock and lock.');
  await closeWindow();
  const mac = '02:00:00:00:00:14';
  const fixture = { id: 'fixture/' + mac, scope: 'fixture', source: 'fixture', mac, ips: ['192.0.2.20'],
    label: 'Upgrade fixture', hostname: '', trusted: false, first: 1, last: 1, evidence: 'Deterministic upgrade fixture' };
  await writeFile(join(dir, 'NetSentinel/monitor-v1.json'), JSON.stringify({version: 1, devices: [fixture], events: []}));
  await launch(false);
  await navigate('Settings');
  assert.equal(await page.getByLabel('Packet history limit').inputValue(),'5000');
  await settings();
  await button('Unlock administrator controls').waitFor();
  await button('Unlock administrator controls').click();
  await page.getByRole('dialog').getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Unlock', exact: true }).click();
  await button('Lock Now').waitFor();
  await navigate('Devices');
  await page.getByRole('button', { name: /Details for Upgrade fixture/ }).click();
  await page.getByLabel('Device label').fill('Persisted fixture');
  await page.getByLabel('Trust status').selectOption('trusted');
  await button('Save changes').click();
  await page.getByText('Preferences saved.').waitFor();
  await button('Close device details').click();
  await navigate('Dashboard');
  const select = page.getByLabel('Capture source');
  const options = await select.locator('option').evaluateAll(items => items.map(x => ({ value: x.value, label: x.textContent })));
  const adapter = options.find(x => x.label.includes(process.env.NETSENTINEL_SMOKE_ADAPTER || 'Intel(R) Ethernet'));
  assert.ok(adapter, 'Set NETSENTINEL_SMOKE_ADAPTER to an authorized adapter description.');
  await select.selectOption(adapter.value);
  await button('Start capture').click();
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="packet-count"]')?.textContent?.replaceAll(',', '')) > 0);
  await button('Stop capture').click();
  await button('Start capture').click();
  await button('Stop capture').waitFor();
  await navigate('Packets');
  const box=page.locator('.packet-virtualized-container');
  await page.waitForFunction(()=>{const el=document.querySelector('.packet-virtualized-container');return el && el.scrollHeight>el.clientHeight+700;},null,{timeout:90000});
  await box.evaluate(el=>{el.scrollTop=410;});
  await button('Jump to newest').waitFor();
  const id=await box.locator('.row-num button').nth(12).innerText();
  const tick=()=>page.getByText('Captured frames',{exact:true}).locator('..').locator('dd').innerText();
  await page.getByLabel('Select packet '+id,{exact:true}).check();
  await button(id).click();
  const y=await button(id).evaluate(el=>el.getBoundingClientRect().top);
  const previous=await tick();
  await page.waitForFunction(old=>[...document.querySelectorAll('dt')].find(el=>el.textContent==='Captured frames').nextElementSibling.textContent!==old,previous);
  assert.ok(Math.abs(await button(id).evaluate(el=>el.getBoundingClientRect().top)-y)<2,'Live anchor moved');
  assert.ok(await page.getByLabel('Select packet '+id,{exact:true}).isChecked());
  assert.match(await page.locator('.packet-details h3').innerText(),new RegExp('Packet '+id+' '));
  await button('Jump to newest').click();
  assert.equal(await box.evaluate(el=>el.scrollTop),0);
  console.log('PASS scrolled live Ethernet capture, preserved selection and details during incoming traffic, followed newest again.');
  const pid = await desktop.evaluate(() => process.pid);
  const ps = join(system, 'WindowsPowerShell/v1.0/powershell.exe');
  const children = async () => (await run(ps, ['-NoProfile', '-Command',
    'Get-CimInstance Win32_Process -Filter "ParentProcessId=' + pid + '" | Where-Object { $_.ExecutablePath -like "*\\resources\\capture\\netsentinel.exe" } | Select-Object -ExpandProperty ProcessId'],
    { windowsHide: true })).stdout.trim();
  const worker = Number(await children());
  assert.ok(worker > 0, 'Expected one live worker owned by the application.');
  const renderer = await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getOSProcessId());
  const sample = async () => JSON.parse((await run(ps,['-NoProfile','-Command',
    'Get-Process -Id '+[pid,renderer,worker].join(',')+' | Select-Object Id,CPU,WorkingSet64 | ConvertTo-Json -Compress'],
    {windowsHide:true})).stdout);
  const before = await sample(), started = performance.now();
  await new Promise(done=>setTimeout(done,6000));
  const after = await sample(), seconds = (performance.now()-started)/1000;
  for (const [name,id] of [['bridge',pid],['renderer',renderer],['worker',worker]]) {
    const end = after.find(row=>row.Id === id);
    console.log('Active live '+name, Math.round(end.WorkingSet64/1048576)+' MiB,',
      ((end.CPU-before.find(row=>row.Id === id).CPU)*100/seconds).toFixed(1)+'% of one core over '+seconds.toFixed(1)+'s');
  }
  await navigate('Settings');
  await page.getByLabel('Packet history limit').selectOption('10000');
  await navigate('Packets');
  await page.locator('.session-diagnostics summary').click();
  await page.getByText('Retained / capacity',{exact:true}).locator('..').getByText(/10,000$/).waitFor();
  await button('Stop capture').waitFor();
  await run(executablePath, [profile], { env, timeout: 15000, windowsHide: true });
  assert.equal(Number(await children()), worker);
  await closeWindow();
  assert.throws(() => process.kill(worker, 0), { code: 'ESRCH' });
  console.log('PASS physical adapter enumeration, live traffic, stop/start, duplicate-launch protection, capture worker exit and closed bridge port.');
  await launch(false);
  await navigate('Devices');
  await page.getByLabel('Search local devices').fill('Persisted fixture');
  await page.getByRole('button', { name: /Details for Persisted fixture/ }).click();
  assert.equal(await page.getByLabel('Trust status').inputValue(), 'trusted');
  await closeWindow();
  console.log('PASS relaunch with existing credentials, persisted fixture device label and trust, and clean shutdown.');
} finally {
  await desktop?.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
