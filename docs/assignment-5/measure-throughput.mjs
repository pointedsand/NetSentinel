import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const device=process.env.NETSENTINEL_SMOKE_DEVICE;
const dir=await mkdtemp(join(tmpdir(),'netsentinel-throughput-'));
const file=join(dir,'fixture.pcap');
try {
  if (!device) {
    execFileSync(process.execPath,['backend/service/demo-pcap.mjs',file]);
    const fixture=await readFile(file);
    const records=fixture.subarray(24);
    await writeFile(file,Buffer.concat([fixture.subarray(0,24),...Array(10000).fill(records)]));
  }
  const start=performance.now();
  const worker=spawn(process.env.NETSENTINEL_BIN || resolve('backend/build/capture/netsentinel.exe'),
    [device?'--interface':'--replay',device || file,'-','-','-','-','-'],{
      env:{...process.env,NETSENTINEL_BUFFER:'256'},stdio:['pipe','pipe','inherit'],windowsHide:true});
  const closed=once(worker,'close');
  const stop=device && setTimeout(()=>worker.stdin.end('stop\n'),60_000);
  const watchdog=setTimeout(()=>worker.kill(),75_000);
  let final,delivered=0;
  try {
    for await (const line of createInterface({input:worker.stdout})) {
      const batch=JSON.parse(line);
      delivered+=batch.packets.length;
      if (batch.captureState==='PAUSED') final=batch;
    }
    assert.equal((await closed)[0],0);
    assert.equal(final.failed,false);
    if (!device) assert.equal(final.packetCount,30_000);
    assert.equal(delivered+final.outputDrops,final.packetCount);
    const seconds=(performance.now()-start)/1000;
    console.log(JSON.stringify({mode:device?'ambient':'replay',seconds,parsed:final.packetCount,
      rejected:final.rejected,delivered,outputDrops:final.outputDrops,wireBytes:final.wireBytes,
      framesPerWallSecond:(final.packetCount+final.rejected)/seconds}));
  } finally {clearTimeout(stop);clearTimeout(watchdog); if(worker.exitCode===null) worker.kill();}
} finally {await rm(dir,{recursive:true,force:true});}
