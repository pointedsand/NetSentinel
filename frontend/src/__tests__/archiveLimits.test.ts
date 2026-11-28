import {expect,it} from 'vitest';
import {readArchive,importPackets} from '../pages/importPackets';
import {createExportFile} from '../pages/packetExport';

const p={id:1,timestamp:42,sizeBytes:60,size:'60 B',time:'12:00',protocol:'UDP',source:'a',destination:'b',name:'two,"λ"\nlines'};
it.each([5000,10000,30000,50000,50001])('reads every row of both archive formats at %i records',async count=>{
  const rows=Array.from({length:count},(_,i)=>({...p,id:i+1}));
  for (const format of ['CSV','JSON'] as const) {
    const data=new TextEncoder().encode(createExportFile(rows,format).content);
    const result=await readArchive('older.'+format,data.length,async(offset,n)=>data.subarray(offset,offset+n));
    expect(result.packets).toHaveLength(count);
    expect(result.packets[0]).toEqual(rows[0]);
    expect(result.packets.at(-1)).toEqual(rows.at(-1));
  }
});
it('rejects oversize inputs, fields, malformed trailing data and incomplete files',async()=>{
  await expect(readArchive('x.csv',128*1024**2+1,async()=>{throw Error('Unexpected read');})).rejects.toThrow('128 MiB');
  for (const text of ['[{},]','[]x','[','[['+JSON.stringify(p)+']]','['+JSON.stringify({...p,name:'a'.repeat(1025)})+']'])
    expect(()=>importPackets('x.json',text)).toThrow();
  const csv=createExportFile([p],'CSV').content;
  expect(()=>importPackets('x.csv',csv+'\nincomplete')).toThrow(/row 2/);
  expect(()=>importPackets('x.csv',csv.replace('two,','a'.repeat(1025)))).toThrow(/field/);
});
