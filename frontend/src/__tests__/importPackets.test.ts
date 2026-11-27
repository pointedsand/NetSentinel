import { expect, it } from 'vitest';
import { importPackets } from '../pages/importPackets';
import { createExportFile } from '../pages/packetExport';
const packet = { id:1, source:'a', destination:'b', protocol:'UDP', size:'60 B', sizeBytes:60, name:'a,"b"', timestamp:42, time:'10:00' };
it('round trips both packet export formats', () => {
  for (const format of ['CSV','JSON'] as const) {
    expect(importPackets('log.'+format,createExportFile([packet],format).content).packets).toEqual([packet]);
  }
});
it('rejects binary captures, incomplete schemas and malformed CSV', () => {
  for (const [name,text] of [['x.pcap',''],['x.json','[{}]'],['x.csv','name,info'],['x.csv','"bad']]) {
    expect(() => importPackets(name,text)).toThrow();
  }
});
