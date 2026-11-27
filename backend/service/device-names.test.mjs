import test from 'node:test';
import assert from 'node:assert/strict';
import { Monitor } from './monitor.mjs';
import { networkContext } from './neighbors.mjs';

const ip='192.0.2.4', mac='02:00:00:00:00:04';
function inventory() {
  const monitor=new Monitor();
  monitor.context=networkContext('adapter',{interfaceName:'Ethernet',prefixes:['192.0.2.0/24'],gateways:[]});
  return monitor;
}
function announcement(overrides = {}) {
  return {application:'mDNS response',decodeStatus:'decoded',sourcePort:5353,source:ip,sourceMac:mac,
    dnsAnswers:[{owner:'workstation.local',type:1,value:ip,ttl:120}],...overrides};
}
test('passive self-announcement is matched to a neighbor, retains provenance, and expires on goodbye',()=>{
  const m=inventory();
  m.packet(announcement());
  assert.equal(m.view().deviceTotal,0);
  const d=m.observe(ip,mac,100,'ARP sender').device;
  assert.equal(d.hostname,'workstation.local'); assert.equal(d.nameMethod,'Observed mDNS'); assert.equal(d.interfaceName,'Ethernet');
  m.applyPtr('adapter',ip,'ptr.test',d.id+'|'+ip);
  assert.equal(d.hostname,'workstation.local');
  m.packet(announcement({dnsAnswers:[{owner:'workstation.local',type:1,value:ip,ttl:0}]}));
  assert.equal(m.view().devices[0].nameExpired,true);
});
test('refuses unrelated names and late lookups after reassignment; requests lookups for cache-only neighbors',()=>{
  const m=inventory(), requests=[];
  m.resolveNeighbor=(...args)=>requests.push(args);
  const old=m.observe(ip,mac,500,'OS neighbor cache').device;
  assert.deepEqual(requests,[['adapter',ip,old.id]]);
  const current=m.observe(ip,'02:00:00:00:00:09',501,'ARP sender').device;
  m.applyPtr('adapter',ip,'wrong.test',old.id+'|'+ip);
  m.packet(announcement());
  m.packet(announcement({sourceMac:current.mac,dnsAnswers:[{type:1,value:'192.0.2.7',owner:'other.local',ttl:120}]}));
  assert.equal(current.hostname,'');
  m.applyPtr('adapter',ip,'valid.test',current.id+'|'+ip);
  assert.equal(current.nameMethod,'Reverse DNS'); assert.equal(current.hostname,'valid.test');
});
test('device filters cover all retained pages and summary totals include the entire inventory',()=>{
  const m=inventory();
  for(let i=1;i<=32;i++) m.observe('192.0.2.'+i,'02:00:00:00:00:'+i.toString(16).padStart(2,'0'),i,'OS neighbor cache');
  const device=m.inventory.devices.values().next().value;
  m.command({command:'device_preference',id:device.id,label:'Lab printer',trusted:true});
  const view=m.view(24,0,{term:'printer',trust:'trusted',compact:true});
  assert.equal(view.deviceTotal,32); assert.equal(view.trustedTotal,1); assert.equal(view.matchingTotal,1);
  assert.equal(view.offset,0); assert.equal(view.devices[0].id,device.id);
  assert.equal(m.observe('192.0.2.255',mac,900,'OS neighbor cache'),undefined);
});

test('keeps a startup announcement until adapter discovery confirms the local neighbor',async t=>{
  let finish;
  const monitor = new Monitor({discover:()=>new Promise(resolve=>{finish=resolve;})});
  t.after(()=>monitor.stop());
  monitor.begin('adapter',false);
  monitor.packet(announcement());
  monitor.packet(announcement({dnsAnswers:[{owner:'other.local',type:1,value:ip,ttl:0}]}));
  assert.equal(monitor.view().deviceTotal,0);
  finish({prefixes:['192.0.2.0/24'],gateways:[],neighbors:[{ip,mac}]});
  await new Promise(resolve=>setImmediate(resolve));
  const [device] = monitor.view().devices;
  assert.equal(device.hostname,'workstation.local');
  assert.equal(device.nameMethod,'Observed mDNS');
});

test('a passive DHCP name can precede assignment and only enriches the matching local identity',()=>{
  const m=inventory();
  const request={dhcpHostname:'desk',source:'0.0.0.0',sourceMac:mac,decodeStatus:'decoded'};
  m.packet(request);
  assert.equal(m.view().deviceTotal,0);
  const first=m.observe(ip,'02:00:00:00:00:09',100,'OS neighbor cache').device;
  assert.equal(first.hostname,'');
  const d=m.observe(ip,mac,101,'ARP sender').device;
  assert.equal(d.hostname,'desk');
  assert.equal(d.nameMethod,'DHCP client hostname');
  m.packet({...request,dhcpHostname:'wrong',vlanIds:[1]});
  assert.equal(d.hostname,'desk');
});

test('alert summaries cover full history and filtering precedes paging',()=>{
  const m=inventory();
  m.detector.events=Array.from({length:51},(_,id)=>({id:String(id),severity:id%2?'Medium':'Info',
    type:id%2?'Conflicting ARP claims':'Device arrival',acknowledged:id<30}));
  const page=m.view(0,24,{},{severity:'Info',status:'acknowledged',type:'Device arrival'});
  assert.equal(page.eventTotal,51); assert.equal(page.unacknowledged,21);
  assert.deepEqual(page.severityCounts,{Info:26,Medium:25});
  assert.equal(page.eventMatches,15); assert.equal(page.eventOffset,0); assert.equal(page.events.length,15);
});
