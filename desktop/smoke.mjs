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
let desktop, page, port;

async function launch(demo, binary = executablePath) {
  desktop = await _electron.launch({ executablePath: binary, chromiumSandbox: true, env,
    args: demo ? [profile, '--demo'] : [profile], timeout: 25000 });
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
async function verifyRetention() {
  const copy = join(dir, 'packaged-retention-test');
  await cp(dirname(executablePath), copy, { recursive: true });
  const path = join(copy, 'resources/capture/demo.pcap');
  const fixture = await readFile(path);
  // Keep each replay below the worker mailbox capacity so only history eviction is exercised.
  await writeFile(path, Buffer.concat([fixture.subarray(0,24), ...Array(80).fill(fixture.subarray(24))]));
  await launch(true, join(copy, basename(executablePath)));
  for (let session = 1; session <= 18; session++) {
    await button('Start capture').click();
    await page.waitForFunction(expected => Number(document.querySelector('[data-testid="packet-count"]').textContent.replaceAll(',', '')) === expected, session * 240);
    await button('Start capture').waitFor();
  }
  await navigate('Packets');
  const totals = page.locator('.rail-totals').first();
  const value = async label => (await totals.getByText(label, { exact: true }).locator('..').locator('dd').innerText()).replaceAll(',', '');
  assert.equal(await value('Captured frames'), '4320');
  assert.equal(await value('Stored packets'), '4096 / 4096');
  assert.equal(await value('Evicted packets'), '224');
  assert.equal(await value('Output drops'), '0');
  const visible = page.locator('.packet-counter strong');
  assert.equal((await visible.innerText()).replaceAll(',', ''), '4096');
  await page.getByLabel('Display protocol').selectOption('TCP');
  assert.equal(await visible.innerText(), '0');
  assert.equal(await value('Stored packets'), '4096 / 4096');
  await button('Clear Capture Log').click();
  await page.waitForFunction(() => document.querySelector('.rail-totals dd').textContent === '0');
  assert.equal(await value('Stored packets'), '0 / 4096');
  assert.equal(await value('Evicted packets'), '0');
  assert.equal(await value('Output drops'), '0');
  await closeWindow();
  console.log('PASS packaged deterministic replay: 4320 captured, 4096 stored, 224 evicted, 0 drops; filtering and explicit reset confirmed.');
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
  await navigate('Packets');
  await button('3').click();
  await page.getByRole('region', { name: 'Packet details' }).waitFor();
  await page.getByLabel('Display protocol').selectOption('TCP');
  await page.getByText('No matching packets found.').waitFor();
  await page.getByLabel('Display protocol').selectOption('');
  assert.equal(await page.locator('tbody tr').count(), 3);
  for (const format of ['CSV', 'JSON']) {
    await button('Export').click();
    await page.locator('.modal-body select').selectOption(format);
    const output = join(dir, 'replay.' + format.toLowerCase());
    await desktop.evaluate(({ session }, path) => {
      globalThis.downloadResult = 'waiting';
      session.defaultSession.once('will-download', (_event, item) => {
        item.setSavePath(path);
        item.once('done', (_event, state) => { globalThis.downloadResult = state; });
      });
    }, output);
    await button('Download Export').click();
    for (let i = 0; i < 50 && await desktop.evaluate(() => globalThis.downloadResult) === 'waiting'; i++)
      await new Promise(done => setTimeout(done, 100));
    assert.equal(await desktop.evaluate(() => globalThis.downloadResult), 'completed', 'Native ' + format + ' download');
    const data = await readFile(output, 'utf8');
    assert.equal(format === 'JSON' ? JSON.parse(data).length : data.trim().split('\n').length - 1, 3);
    await navigate('Logs');
    const choosing = page.waitForEvent('filechooser');
    await button('Upload').click();
    await (await choosing).setFiles(output);
    await page.locator('.imported-log tbody tr').first().waitFor();
    assert.equal(await page.locator('.imported-log tbody tr').count(), 3);
    await navigate('Packets');
  }
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
  const pid = await desktop.evaluate(() => process.pid);
  const ps = join(system, 'WindowsPowerShell/v1.0/powershell.exe');
  const children = async () => (await run(ps, ['-NoProfile', '-Command',
    'Get-CimInstance Win32_Process -Filter "ParentProcessId=' + pid + '" | Where-Object { $_.ExecutablePath -like "*\\resources\\capture\\netsentinel.exe" } | Select-Object -ExpandProperty ProcessId'],
    { windowsHide: true })).stdout.trim();
  const worker = Number(await children());
  assert.ok(worker > 0, 'Expected one live worker owned by the application.');
  await run(executablePath, [profile], { env, timeout: 15000, windowsHide: true });
  assert.equal(Number(await children()), worker);
  await closeWindow();
  assert.throws(() => process.kill(worker, 0), { code: 'ESRCH' });
  console.log('PASS physical adapter enumeration, live traffic, stop/start, duplicate-launch protection, capture worker exit and closed bridge port.');
  await launch(false);
  await navigate('Devices');
  await page.getByRole('button', { name: /Details for Persisted fixture/ }).click();
  assert.equal(await page.getByLabel('Trust status').inputValue(), 'trusted');
  await closeWindow();
  console.log('PASS relaunch with existing credentials, persisted fixture device label and trust, and clean shutdown.');
} finally {
  await desktop?.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
