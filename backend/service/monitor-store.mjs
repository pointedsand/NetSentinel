import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { validateRules } from './detections.mjs';
import { defaultHistoryLimit, validateHistoryLimit } from './history.mjs';
import { normalizeMac } from './inventory.mjs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export function defaultStateFile() {
  const dir = process.env.LOCALAPPDATA || process.env.XDG_STATE_HOME || join(homedir(),'.local','state');
  return join(dir,'NetSentinel','monitor-v1.json');
}

async function writeState(file,json) {
  await mkdir(dirname(file),{recursive:true});
  const temporary = file + '.' + process.pid + '.tmp';
  await writeFile(temporary,json,{mode:0o600});
  await rename(temporary,file);
}

export async function openHistoryPreferences(stateFile) {
  const file = stateFile + '.preferences.json';
  let limit = defaultHistoryLimit;
  try {
    const saved = JSON.parse(await readFile(file,'utf8'));
    if (saved?.version === 1) limit = validateHistoryLimit(saved.historyLimit);
  } catch (error) {
    if (error.code && error.code !== 'ENOENT') throw error;
  }
  return { limit, async save(value) {
    validateHistoryLimit(value);
    await writeState(file,JSON.stringify({version:1,historyLimit:value}));
  }};
}

export async function openStore(file) {
  let saved = {}, error = '', readOnly = false;
  if (file) {
    try {
      saved = JSON.parse(await readFile(file,'utf8'));
      if (saved?.rules !== undefined) validateRules(saved.rules);
      if (saved?.version !== 1 || !Array.isArray(saved.devices) || !Array.isArray(saved.events) ||
          saved.devices.length > 512 || saved.events.length > 512 ||
          !saved.devices.every(d=>d && normalizeMac(d.mac) && d.id === d.scope+'/'+d.mac && typeof d.trusted === 'boolean' &&
            [d.scope,d.source,d.label,d.hostname,d.evidence].every(v=>typeof v === 'string') && Number.isFinite(d.first) &&
            Number.isFinite(d.last) && Array.isArray(d.ips) && d.ips.length <= 16 && d.ips.every(ip=>typeof ip === 'string')) ||
          !saved.events.every(e=>e && [e.id,e.type,e.evidence,e.source,e.ip,e.mac,e.severity].every(v=>typeof v === 'string') &&
            Number.isFinite(e.time) && typeof e.acknowledged === 'boolean' && ['Replay','Live'].includes(e.origin))) throw Error('Invalid monitoring state');
    } catch (e) {
      if (e.code !== 'ENOENT') { error = 'Saved monitoring state could not be read. Changes are in memory only.'; readOnly = true; }
      saved = {};
    }
  }
  let timer, writing, pending;
  async function flush() {
    clearTimeout(timer); timer = undefined;
    if (writing) await writing;
    if (!pending) return;
    const snapshot = pending;
    pending = undefined;
    writing = (async () => {
      try {
        const json = JSON.stringify(snapshot());
        await writeState(file,json);
        error = '';
      } catch { error = 'Could not save monitoring state to disk.'; }
    })();
    await writing;
  }
  return { saved, get error() { return error; }, flush, change(snapshot) {
    if (!file || readOnly) return;
    pending = snapshot;
    if (!timer) timer = setTimeout(flush,2000);
  }};
}
