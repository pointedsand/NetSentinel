import { writeFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) throw Error('Supply a new path for the deterministic device-arrival fixture.');
const header = Buffer.from('d4c3b2a1020004000000000000000000ffff000001000000','hex');
const parts = [header];
for (const [seconds, host] of [[0,10],[10,10],[75,20]]) {
  const frame = Buffer.alloc(60);
  frame.fill(255,0,6);
  const mac = Buffer.from([2,0,0,0,0,host]);
  mac.copy(frame,6);
  frame.writeUInt16BE(0x0806,12);
  frame.writeUInt16BE(1,14);
  frame.writeUInt16BE(0x0800,16);
  frame[18]=6; frame[19]=4; frame.writeUInt16BE(1,20);
  mac.copy(frame,22);
  frame.set([192,0,2,host],28);
  frame.set([192,0,2,1],38);
  const record = Buffer.alloc(16);
  record.writeUInt32LE(1700000000+seconds);
  record.writeUInt32LE(frame.length,8);
  record.writeUInt32LE(frame.length,12);
  parts.push(record,frame);
}
await writeFile(path,Buffer.concat(parts),{flag:'wx'});
