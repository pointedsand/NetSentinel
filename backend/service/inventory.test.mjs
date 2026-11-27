import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { networkContext } from './neighbors.mjs';
import { Monitor } from './monitor.mjs';
import { openStore } from './monitor-store.mjs';

test('on-link evidence, scoped identities, randomization and durable preferences',async t=>{
  const dir = await mkdtemp(join(tmpdir(),'netsentinel-inventory-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file = join(dir,'state.json');
  const m = new Monitor({store:await openStore(file)});
  m.context = networkContext('adapter',{prefixes:['192.0.2.0/24','fe80::/64'],gateways:[]});
  const observe = (ip,mac='02:00:00:00:00:01')=>m.observe(ip,mac,100,'OS neighbor cache');
  assert.equal(observe('203.0.113.1'),undefined);
  assert.equal(observe('192.0.2.1','ff:ff:ff:ff:ff:ff'),undefined);
  const {device} = observe('192.0.2.2');
  assert.equal(observe('fe80::1').fresh,false);
  m.command({command:'device_preference',id:device.id,label:'Laptop',trusted:true});
  assert.equal(observe('192.0.2.2','02:00:00:00:00:02').device.trusted,false);
  await m.store.flush();
  const next = new Monitor({store:await openStore(file)});
  next.context=m.context;
  const again = next.observe('192.0.2.3',device.mac,200,'ARP sender');
  assert.equal(again.fresh,false); assert.equal(again.device.label,'Laptop'); assert.equal(again.device.trusted,true);
  assert.equal(again.device.ips.length,3);
  await next.store.flush();
});

test('a slow adapter lookup replays bounded neighbor evidence; late PTR updates only its current owner',async()=>{
  let finish;
  const m=new Monitor({discover:()=>new Promise(resolve=>{finish=resolve;})});
  m.begin('adapter',false);
  try {
    const record={network:'ARP',decodeStatus:'decoded',source:'192.0.2.4',neighborIp:'192.0.2.4',
      neighborMac:'02:00:00:00:00:04',timestampUs:Date.now()*1000};
    m.packet(record);
    assert.equal(m.view().deviceTotal,0);
    finish({prefixes:['192.0.2.0/24'],gateways:[],neighbors:[]});
    await new Promise(resolve=>setImmediate(resolve));
    m.packet({...record,neighborMac:'02:00:00:00:00:05',timestampUs:record.timestampUs+2000});
    m.applyPtr('adapter',record.source,'desktop.test');
    const [current,old]=m.view().devices;
    assert.equal(current.hostname,'desktop.test'); assert.equal(old.hostname,'');
    assert.equal(current.discovery,'Initial baseline'); assert.equal(m.view().eventTotal,0);
  } finally {m.stop();}
});

test('late OS lookup from a stopped adapter cannot modify the next session',async()=>{
  let finish;
  const m=new Monitor({discover:()=>new Promise(resolve=>{finish=resolve;})});
  m.begin('old',false); m.begin('file',true);
  finish({prefixes:['192.0.2.0/24'],gateways:[],neighbors:[{ip:'192.0.2.1',mac:'02:00:00:00:00:01'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(m.view().deviceTotal,0); assert.equal(m.context.source,'file');
  m.stop();
});
