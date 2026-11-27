import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { serve } from './server.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('commands, repeated capture and controller reconnect', {timeout:15000}, async t => {
  const dir = await mkdtemp(join(tmpdir(),'net-session-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const path = join(dir,'demo.pcap');
  execFileSync(process.execPath,[fileURLToPath(new URL('./demo-pcap.mjs',import.meta.url)),path]);
  const app = serve({executable:process.env.NETSENTINEL_BIN || 'netsentinel',port:0,mode:'--replay',source:path});
  t.after(() => app.close());
  await once(app.server,'listening');
  const url = 'ws://127.0.0.1:'+app.server.address().port;
  async function connect() {
    const socket = new WebSocket(url);
    await once(socket,'open');
    t.after(() => socket.terminate());
    return socket;
  }
  let ws = await connect();
  async function exchange(raw, type) {
    const answer = new Promise(resolve => {
      const handler = bytes => {
        const msg = JSON.parse(bytes);
        if (msg.type === type && (type !== 'batch' || msg.captureState === 'PAUSED')) {
          ws.off('message',handler); resolve(msg);
        }
      };
      ws.on('message',handler);
    });
    ws.send(raw); return answer;
  }
  assert.equal((await exchange('{','error')).type,'error');
  assert.equal((await exchange('{"type":"control","command":"select_source","index":9}','error')).message,'invalid source');
  const start = '{"type":"control","command":"start_capture"}';
  for (let i = 0; i < 2; i++) assert.equal((await exchange(start,'batch')).packetCount,3);
  ws.send(start); ws.close(); await once(ws,'close');
  for (let i=0; i<40; i++) {
    await new Promise(r => setTimeout(r,50));
    ws = await connect();
    const accepted = once(ws,'message').then(() => true);
    const busy = once(ws,'close').then(() => false);
    ws.send('{"type":"control","command":"list_sources"}');
    if (await Promise.race([accepted,busy])) break;
  }
  assert.equal((await exchange(start,'batch')).packetCount,3);
});
