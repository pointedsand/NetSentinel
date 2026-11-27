import test from 'node:test';
import assert from 'node:assert/strict';
import { once, on } from 'node:events';
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
    record.writeUInt32LE(1); record.writeUInt32LE(frame.length,8); record.writeUInt32LE(Math.max(60,frame.length),12);
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
  if (link === 127) assert.match(msg.failureMessage, /Unsupported link type: 127/);
  if (link === 1) {
    assert.equal(msg.wireBytes,60*(count+2));
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

function nameFrame(host, sourcePort, destinationPort, payload) {
  const frame = Buffer.alloc(42+payload.length);
  frame.fill(255,0,6);
  frame.set([2,0,0,0,0,host],6);
  frame.writeUInt16BE(0x0800,12);
  frame[14]=0x45; frame[22]=64; frame[23]=17;
  frame.writeUInt16BE(28+payload.length,16);
  if (sourcePort !== 68) frame.set([192,0,2,host],26);
  frame.fill(255,30,34);
  frame.writeUInt16BE(sourcePort,34);
  frame.writeUInt16BE(destinationPort,36);
  frame.writeUInt16BE(8+payload.length,38);
  payload.copy(frame,42);
  return frame;
}

test('DHCP and NetBIOS names reach scoped inventory through an actual pcap replay',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'netsentinel-names-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const arp = host=>Buffer.from('ffffffffffff0200000000HH080600010800060400010200000000HHc00002HH000000000000c0000201'.replaceAll('HH',host.toString(16).padStart(2,'0')),'hex');
  const dhcp=Buffer.alloc(240);
  dhcp.set([1,1,6]); dhcp.set([2,0,0,0,0,10],28); dhcp.set([99,130,83,99],236);
  const options=Buffer.from([53,1,1,12,4,...Buffer.from('desk'),255]);
  const nb=Buffer.from([0,1,0x84,0x80,0,0,0,1,0,0,0,0,32]);
  const encoded=[];
  for (const c of Buffer.from('OFFICE'.padEnd(15)+'\0')) encoded.push(65+(c>>4),65+(c&15));
  const answer=Buffer.from([...encoded,0,0,32,0,1,0,0,0,120,0,6,0,0,192,0,2,20]);
  const source=join(dir,'names.pcap');
  await writeFile(source,pcap(1,[nameFrame(10,68,67,Buffer.concat([dhcp,options])),arp(10),
    arp(20),nameFrame(20,137,137,Buffer.concat([nb,answer]))]));
  const app=serve({executable:process.env.NETSENTINEL_BIN || 'netsentinel',mode:'--replay',source,port:0});
  await once(app.server,'listening');
  const client=new WebSocket('ws://127.0.0.1:'+app.server.address().port);
  try {
    await once(client,'open');
    const messages=on(client,'message');
    client.send(JSON.stringify({type:'control',command:'start_capture'}));
    for await (const [data] of messages) {
      const msg=JSON.parse(data);
      assert.notEqual(msg.type,'error');
      if (msg.captureState==='PAUSED') { assert.equal(msg.failed,false); break; }
    }
    const result=once(client,'message');
    client.send(JSON.stringify({type:'control',command:'monitor'}));
    const view=JSON.parse((await result)[0]);
    assert.deepEqual(view.devices.map(d=>[d.hostname,d.nameMethod]).sort(),[
      ['OFFICE','NetBIOS name response'],['desk','DHCP client hostname']]);
  } finally {client.terminate(); await app.close();}
});
