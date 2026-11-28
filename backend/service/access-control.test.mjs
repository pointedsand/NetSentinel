import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { serve } from './server.mjs';
import { Monitor } from './monitor.mjs';
import { openStore } from './monitor-store.mjs';

const origin = 'http://localhost:5173';
async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(),'netsentinel-access-'));
  const source = join(dir,'devices.pcap');
  execFileSync(process.execPath,[fileURLToPath(new URL('./security-demo.mjs',import.meta.url)),source]);
  let bridge, ws, url;
  async function close() {
    ws?.terminate();
    if (bridge) await bridge.close();
    bridge = undefined;
  }
  t.after(async()=>{await close();await rm(dir,{recursive:true,force:true});});
  async function open() {
    const monitor = new Monitor({store:await openStore(join(dir,'monitor.json'))});
    bridge = serve({executable:process.env.NETSENTINEL_BIN || 'netsentinel',mode:'--replay',source,
      port:0,origin,monitor,credentialFile:join(dir,'credentials.json')});
    await once(bridge.server,'listening');
    url = 'ws://127.0.0.1:'+bridge.server.address().port;
  }
  async function connect() {
    ws = new WebSocket(url,{origin});
    await once(ws,'open');
  }
  async function request(command,fields={}) {
    const reply = once(ws,'message');
    ws.send(JSON.stringify({type:'control',command,...fields}));
    return JSON.parse((await reply)[0]);
  }
  await open(); await connect();
  return {url,request,async reconnect(){const closed=once(ws,'close');ws.close();await closed;await connect();},
    async restart(){await close();await open();await connect();}};
}

test('HTTP and upgrades require the exact origin and local Host, and a second controller is refused',async t=>{
  const {url,request} = await workspace(t);
  for (const headers of [{},{origin:'http://example.invalid'},{origin,host:'other.invalid'}]) {
    const ws = new WebSocket(url,{headers});
    await assert.rejects(once(ws,'open'),/Unexpected server response/);
  }
  const http = url.replace('ws:','http:');
  for (const headers of [{},{origin:'null'},{origin:'http://example.invalid'}])
    assert.equal((await fetch(http,{headers})).status,403);
  assert.equal((await fetch(http,{headers:{origin}})).status,426);
  const second = new WebSocket(url,{origin});
  assert.equal((await once(second,'close'))[0],1013);
  assert.equal((await request({startsWith:1})).type,'error');
  assert.equal((await request('admin_status')).enabled,false);
});

test('raw socket cannot mutate protected state; inspection, acknowledgment and replay stay public', {timeout:30_000},async t=>{
  const {request,reconnect,restart} = await workspace(t);
  const password = randomBytes(20).toString('hex');
  const {setupFile} = await request('admin_prepare');
  const code = (await readFile(setupFile,'utf8')).trim();
  assert.equal((await request('admin_setup',{newPassword:password,code})).enabled,true);
  assert.equal((await request('list_sources')).mode,'--replay');
  const done = await request('start_capture');
  assert.equal(done.packetCount,3);
  assert.equal((await request('history')).packets.length,3);
  const initial = await request('monitor');
  const id = initial.devices[0].id, newest = initial.events[0].id;
  assert.equal((await request('ack_event',{id:newest})).events[0].acknowledged,true);
  const fields = {monitor_rules:{rules:{...initial.rules,discovery:'off'}},
    device_preference:{id,label:'Authorized fixture',trusted:true},active_dns:{enabled:true},
    clear_events:{newest,total:1},clear_packets:{}};
  for (const [name,input] of Object.entries(fields)) {
    const denied = await request(name,{...input,isAdmin:true,token:'fake'});
    assert.equal(denied.type,'admin_required',name);
  }
  assert.equal((await request('history')).packetCount,3);
  assert.equal((await request('monitor')).devices.find(d=>d.id===id).trusted,false);
  assert.equal((await request('monitor')).eventTotal,1);
  assert.equal((await request('monitor')).rules.discovery,initial.rules.discovery);
  assert.equal((await request('list_sources')).activeDns,false);
  const stale = await request('clear_packets');
  assert.equal((await request('start_capture')).packetCount,6);
  const firstUnlock = await request('admin_unlock',{password});
  assert.equal((await request('admin_resume',{challenge:stale.challenge,token:firstUnlock.token})).type,'error');
  assert.equal((await request('history')).packetCount,6);
  await request('admin_lock');
  const denied = await request('device_preference',fields.device_preference);
  const {token} = await request('admin_unlock',{password});
  assert.ok(token);
  const changed = await request('admin_resume',{token,challenge:denied.challenge});
  assert.equal(changed.devices.find(d=>d.id===id).label,'Authorized fixture');
  assert.equal((await request('admin_resume',{token,challenge:denied.challenge})).type,'error');
  const invalid = await request('monitor_rules',{token,...fields.monitor_rules,eventOffset:-1});
  assert.equal(invalid.type,'error');
  assert.equal((await request('monitor')).rules.discovery,initial.rules.discovery);
  assert.equal((await request('monitor_rules',{token,...fields.monitor_rules})).rules.discovery,'off');
  assert.equal((await request('active_dns',{token,...fields.active_dns})).enabled,true);
  assert.equal((await request('clear_events',{token,newest:'stale',total:1})).type,'error');
  assert.equal((await request('clear_events',{token,...fields.clear_events})).eventTotal,0);
  assert.equal((await request('clear_packets',{token})).packetCount,0);
  await reconnect();
  assert.equal((await request('admin_status')).unlocked,false);
  assert.equal((await request('active_dns',{token,enabled:false})).type,'admin_required');
  const second = await request('admin_unlock',{password});
  await restart();
  assert.equal((await request('admin_status')).enabled,true);
  assert.equal((await request('clear_packets',{token:second.token})).type,'admin_required');
  const restored = await request('monitor');
  assert.equal(restored.eventTotal,0);
  assert.equal(restored.devices.find(d=>d.id===id).trusted,true);
  assert.equal(restored.rules.discovery,'off');
});
