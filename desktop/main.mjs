import { app, BrowserWindow, dialog, protocol, session } from 'electron';
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { serve } from '../backend/service/server.mjs';
import { Monitor } from '../backend/service/monitor.mjs';
import { defaultStateFile, openStore } from '../backend/service/monitor-store.mjs';
import { origin, renderer } from './renderer.mjs';

protocol.registerSchemesAsPrivileged([{ scheme: 'netsentinel',
  privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let window, bridge, startup, closing, closed = false;
const run = promisify(execFile);

async function start() {
  const root = app.getAppPath();
  const capture = app.isPackaged ? join(process.resourcesPath, 'capture') : join(root, 'backend/build/desktop-resources');
  const executable = join(capture, 'netsentinel.exe');
  await access(executable);
  const system = join(process.env.SystemRoot, 'System32');
  const npcap = join(system, 'Npcap');
  try {
    await access(join(npcap, 'wpcap.dll'));
  } catch {
    throw Error('Install the Windows x64 Npcap runtime from npcap.com, then reopen NetSentinel.');
  }
  process.env.PATH = [npcap, system, join(system, 'WindowsPowerShell/v1.0'), process.env.SystemRoot].join(';');
  process.chdir(capture);
  const demo = process.argv.includes('--demo');
  let sources = [join(capture, 'demo.pcap')], sourceLabels = ['Demo replay'];
  if (!demo) {
    const { stdout } = await run(executable, ['--list-interfaces'], { windowsHide: true, timeout: 15000 });
    const adapters = stdout.trimEnd().split(/\r?\n/).filter(Boolean).map(line => line.split('\t'));
    if (!adapters.length) throw Error('Npcap found no capture interfaces. Check the driver and adapter permissions.');
    sources = adapters.map(([name]) => name);
    sourceLabels = adapters.map(([name, description]) => description ? description + ' · ' + name : name);
  }
  const monitor = new Monitor({ store: await openStore(demo ? null : defaultStateFile()) });
  bridge = serve({ executable, mode: demo ? '--replay' : '--interface', sources, source: sources[0],
    sourceLabels, monitor, origin, port: 0 });
  await once(bridge.server, 'listening');
  const ses = session.defaultSession;
  ses.protocol.handle('netsentinel', await renderer(join(root, 'frontend/dist'), bridge.server.address().port));
  ses.setPermissionRequestHandler((contents, permission, respond) => respond(
    contents === window?.webContents && contents.getURL() === origin + '/' && permission === 'clipboard-sanitized-write'));
  ses.setPermissionCheckHandler((contents, permission) => contents === window?.webContents &&
    contents.getURL() === origin + '/' && permission === 'clipboard-sanitized-write');
  if (closing) return;
  window = new BrowserWindow({ width: 1366, height: 820, minWidth: 700, minHeight: 480,
    title: 'NetSentinel', backgroundColor: '#0c131d', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
      webviewTag: false } });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== origin + '/') event.preventDefault(); });
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.on('page-title-updated', event => event.preventDefault());
  window.on('closed', () => { window = undefined; });
  await window.loadURL(origin + '/');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (closed) return;
    event.preventDefault();
    closing ??= Promise.resolve(startup).then(() => bridge?.close()).finally(() => {
      closed = true;
      app.quit();
    });
  });
  startup = app.whenReady().then(start).catch(error => {
    dialog.showErrorBox('NetSentinel could not start',
      (error.stderr?.trim() || error.message) + '\nCheck the Npcap installation and capture permissions.');
    app.quit();
  });
}
