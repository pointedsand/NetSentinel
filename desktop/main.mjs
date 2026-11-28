import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme, protocol, screen, session } from 'electron';
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { serve } from '../backend/service/server.mjs';
import { Monitor } from '../backend/service/monitor.mjs';
import { defaultStateFile, openHistoryPreferences, openStore } from '../backend/service/monitor-store.mjs';
import { origin, renderer } from './renderer.mjs';
import { archiveStore, registerArchives } from './archives.mjs';
import { initialWindowBounds } from './window-bounds.mjs';

protocol.registerSchemesAsPrivileged([{ scheme: 'netsentinel',
  privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const archives = archiveStore(()=>app.getPath('documents'),path=>shell.openPath(path));
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
  bridge = serve({ preferences:await openHistoryPreferences(defaultStateFile()), executable, mode: demo ? '--replay' : '--interface', sources, source: sources[0],
    sourceLabels, monitor, origin, port: 0 });
  await once(bridge.server, 'listening');
  const ses = session.defaultSession;
  ses.protocol.handle('netsentinel', await renderer(join(root, 'frontend/dist'), bridge.server.address().port));
  ses.setPermissionRequestHandler((contents, permission, respond) => respond(
    contents === window?.webContents && contents.getURL() === origin + '/' && permission === 'clipboard-sanitized-write'));
  ses.setPermissionCheckHandler((contents, permission) => contents === window?.webContents &&
    contents.getURL() === origin + '/' && permission === 'clipboard-sanitized-write');
  if (closing) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  app.setAppUserModelId('edu.netsentinel.desktop');
  nativeTheme.themeSource = 'dark';
  window = new BrowserWindow({ ...initialWindowBounds(display.workArea),
    icon: join(app.isPackaged ? process.resourcesPath : join(root, 'desktop'), 'netsentinel.ico'),
    accentColor: nativeTheme.shouldUseHighContrastColors ? undefined : '#101925',
    title: 'NetSentinel', backgroundColor: '#0c131d', autoHideMenuBar: true,
    webPreferences: { preload:join(root,'desktop/preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
      webviewTag: false } });
  registerArchives(ipcMain,archives,()=>window,origin);
  window.webContents.on('did-start-navigation',details=>{
    if (details.isMainFrame && !details.isSameDocument) void archives.reset().catch(console.error);
  });
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
    closing ??= Promise.resolve(startup).then(() => Promise.all([bridge?.close(),archives.reset()])).finally(() => {
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
