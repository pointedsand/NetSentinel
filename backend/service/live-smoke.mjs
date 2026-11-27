import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';

const [exe, device] = process.argv.slice(2);
if (!exe || !device) throw Error('Supply executable and Npcap device name');
for (let session = 1; session <= 2; session++) {
  const child = spawn(exe, ['--interface', device, '-', '-', '-', '-', '-'], {windowsHide:true});
  child.stderr.pipe(process.stderr);
  child.stdin.on('error', () => {});
  const timeout = setTimeout(() => child.kill(), 6000);
  const stop = setTimeout(() => child.stdin.end('stop\n'), 1500);
  let final, running = 0;
  const frame60 = {};
  createInterface({input:child.stdout}).on('line', line => {
    const batch = JSON.parse(line);
    for (const p of batch.packets) if (p.sizeBytes === 60) {
      const key = [p.etherType?.toString(16),p.network,p.arpOperation,p.decodeStatus].join('/');
      frame60[key] = (frame60[key] || 0) + 1;
    }
    if (batch.captureState === 'PAUSED') final = batch;
    else running++;
  });
  const code = await new Promise((resolve,reject) => { child.on('close',resolve); child.on('error',reject); });
  clearTimeout(stop); clearTimeout(timeout);
  assert.equal(code,0); assert.ok(running && final && !final.failed);
  console.log({session,running,protocolCounts:final.protocolCounts,outputDrops:final.outputDrops,frame60});
}
