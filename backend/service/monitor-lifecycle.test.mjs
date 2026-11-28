import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocket } from 'ws';
import { openStore } from './monitor-store.mjs';
import { Monitor } from './monitor.mjs';
import { serve } from './server.mjs';

test('fixture remains detectable behind a TCP filter; acknowledgment, trust and rules survive bridge restart', {timeout:15000}, async t=>{
  const dir = await mkdtemp(join(tmpdir(),'netsentinel-monitor-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const source=join(dir,'device-arrival-fixture.pcap'), file=join(dir,'test-state.json');
  execFileSync(process.execPath,[fileURLToPath(new URL('./security-demo.mjs',import.meta.url)),source]);
  let eventId;
  for (let run=0;run<2;run++) {
    const monitor = new Monitor({store:await openStore(file)});
    const service = serve({credentialFile:join(dir,'admin.json'),source,mode:'--replay',port:0,executable:process.env.NETSENTINEL_BIN||'netsentinel',monitor});
    await once(service.server,'listening');
    const client = new WebSocket('ws://127.0.0.1:'+service.server.address().port,{origin:'http://localhost:5173'});
    try {
      await once(client,'open');
      const send = (command,fields={}) => client.send(JSON.stringify({type:'control',command,...fields}));
      async function request(command,fields={}) {
        const reply=once(client,'message');
        send(command,fields);
        return JSON.parse((await reply)[0]);
      }
      if (run===0) {
        send('set_filter',{filter:{protocol:'TCP'}});
        const done = await request('start_capture');
        assert.equal(done.captureState,'PAUSED');
        assert.deepEqual(done.packets,[]);
        const view = await request('monitor');
        assert.equal(view.eventTotal,1); assert.equal(view.deviceTotal,2);
        const event=view.events[0]; eventId=event.id;
        assert.equal(event.origin,'Replay'); assert.equal(event.ip,'192.0.2.20');
        const device=view.devices.find(d=>d.mac===event.mac);
        await request('device_preference',{id:device.id,label:'Fixture laptop',trusted:true});
        await request('ack_event',{id:eventId});
        await request('monitor_rules',{rules:{...view.rules,discovery:'off',pps:80}});
        await request('clear_packets');
      } else {
        const view=await request('monitor');
        assert.equal(view.events[0].id,eventId); assert.equal(view.events[0].acknowledged,true);
        assert.equal(view.devices.find(d=>d.label==='Fixture laptop').trusted,true);
        assert.equal(view.rules.pps,80); assert.equal(view.rules.discovery,'off');
      }
    } finally {client.terminate(); await service.close();}
  }
});

test('invalid on-disk rules leave capture usable and preserve the original file',async t=>{
  const dir = await mkdtemp(join(tmpdir(),'netsentinel-invalid-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'state.json');
  const input=JSON.stringify({version:1,devices:[],events:[],rules:{}});
  await writeFile(file,input);
  const monitor=new Monitor({store:await openStore(file)});
  assert.match(monitor.view().storageError,/memory only/);
  monitor.changed(); await monitor.store.flush();
  assert.equal(await readFile(file,'utf8'),input);
});
