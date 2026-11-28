import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { Monitor } from './backend/service/monitor.mjs';
import { defaultStateFile, openHistoryPreferences, openStore } from './backend/service/monitor-store.mjs';
import { serve } from './backend/service/server.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const frontend = join(root, 'frontend');
const requireFrontend = createRequire(join(frontend, 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')));
const executable = resolve(process.env.NETSENTINEL_BIN ||
  join(root, 'backend/build/capture', process.platform === 'win32' ? 'netsentinel.exe' : 'netsentinel'));
const [option, ...inputs] = process.argv.slice(2);
let directory, bridge, site;

async function close() {
  await bridge?.close();
  await site?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
}

try {
  await access(executable);
  let sources, sourceLabels;
  let mode;
  if (option === '--replay') {
    mode = '--replay';
    sources = inputs.map(path => resolve(path));
    if (!sources.length) {
      directory = await mkdtemp(join(tmpdir(), 'netsentinel-demo-'));
      sources.push(join(directory, 'demo.pcap'));
      execFileSync(process.execPath, [join(root, 'backend/service/demo-pcap.mjs'), sources[0]]);
    }
    for (const path of sources) await access(path);
  } else if (option === '--live' && !inputs.length) {
    mode = '--interface';
    const interfaces = execFileSync(executable, ['--list-interfaces'], { encoding: 'utf8', windowsHide: true })
      .trimEnd().split(/\r?\n/).filter(Boolean).map(line => line.split('\t'));
    sources = interfaces.map(([name]) => name);
    sourceLabels = interfaces.map(([name, description]) => description ? description + ' · ' + name : name);
    if (!sources.length) throw Error('No capture interfaces available.');
  } else if (option === '--interface' && inputs.length) {
    mode = option;
    sources = inputs;
  } else {
    throw Error('Usage: node dev.mjs --live | --interface DEVICE ... | --replay [FILE ...]');
  }
  const origin = 'http://127.0.0.1:5173';
  const monitor = new Monitor({ store: await openStore(mode === '--interface' ? process.env.NETSENTINEL_STATE_FILE || defaultStateFile() : null) });
  bridge = serve({ preferences:await openHistoryPreferences(process.env.NETSENTINEL_STATE_FILE || defaultStateFile()), monitor, executable, mode, sources, sourceLabels, source: sources[0], origin, dns: process.env.NETSENTINEL_DNS === '1' });
  await once(bridge.server, 'listening');
  site = await createServer({ root: frontend, server: { host: '127.0.0.1', port: 5173, strictPort: true } });
  await site.listen();
  console.log(`Open ${origin}. Ctrl+C stops NetSentinel.`);
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
} catch (error) {
  console.error(error.message);
  await close();
  process.exitCode = 1;
}
