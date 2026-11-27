import { writeFile } from 'node:fs/promises';
const output = process.argv[2];
if (!output) throw Error('Supply a new pcap file path');
const header = Buffer.from('d4c3b2a1020004000000000000000000ffff000001000000','hex');
const udp = Buffer.from('000102030405060708090a0b08004500001c00000000401100000a0000010a0000023039003500080000','hex');
const parts = [header];
for (let i = 0; i < 3; i++) {
  const record = Buffer.alloc(16);
  record.writeUInt32LE(1700000000+i); record.writeUInt32LE(udp.length,8); record.writeUInt32LE(60,12);
  parts.push(record,udp);
}
await writeFile(output,Buffer.concat(parts),{flag:'wx'});
