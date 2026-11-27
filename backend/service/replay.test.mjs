import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { serve } from './server.mjs';

function pcap(linkType, frames) {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(0xa1b2c3d4);
  header.writeUInt16LE(2,4); header.writeUInt16LE(4,6);
  header.writeUInt32LE(65535,16); header.writeUInt32LE(linkType,20);
  const parts = [header];
  for (const frame of frames) {
    const record = Buffer.alloc(16);
    record.writeUInt32LE(1); record.writeUInt32LE(frame.length,8); record.writeUInt32LE(60,12);
    parts.push(record, frame);
  }
  return Buffer.concat(parts);
}

for (const [link, count] of [[1,1], [127,1], [1,10000]]) test('WebSocket replay ' + link + '/' + count, {timeout:10000}, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'netsentinel-'));
  t.after(() => rm(dir, {recursive:true,force:true}));
  const path = join(dir,'input.pcap');
  const udp = Buffer.from('000102030405060708090a0b08004500001c00000000401100000a0000010a0000023039003500080000','hex');
  const other = Buffer.alloc(14);
  await writeFile(path, pcap(link, [other, Buffer.alloc(2), ...Array(count).fill(udp)]));
  const app = serve({executable:process.env.NETSENTINEL_BIN || 'netsentinel', mode:'--replay',source:path,port:0});
  t.after(() => app.close());
  await once(app.server,'listening');
  const client = new WebSocket('ws://127.0.0.1:'+app.server.address().port);
  t.after(() => client.terminate());
  await once(client,'open');
  const packets = [];
  const final = new Promise((resolve,reject) => {
    client.on('message', data => {
      const msg = JSON.parse(data);
      if (msg.packets) {
        if (msg.packets.length > 256) { reject(Error('batch overflow')); return; }
        packets.push(...msg.packets);
      }
      if (msg.captureState === 'PAUSED') resolve(msg);
      else if (msg.type === 'error') reject(Error(msg.message));
    });
  });
  client.send(JSON.stringify({type:'control',command:'set_filter',filter:{destination_port:53}}));
  client.send(JSON.stringify({type:'control',command:'start_capture'}));
  const msg = await final;
  assert.equal(msg.failed,link !== 1);
  if (link === 1) {
    assert.equal(msg.packetCount,count+1); assert.equal(msg.bytes,60*(count+1));
    assert.equal(msg.activeConnections,1);
    assert.equal(msg.filtered,1); assert.equal(msg.rejected,1);
    assert.deepEqual(msg.protocolCounts,[0,count,0,1]);
    assert.equal(packets.length + msg.outputDrops,count);
    if (count === 10000) assert.ok(msg.outputDrops > 0);
    assert.equal(packets[0].destinationPort,53);
    assert.equal(packets[0].timestampUs,1000000);
  }
});
