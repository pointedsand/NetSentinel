import assert from 'node:assert/strict';
import test from 'node:test';
import { Monitor } from './monitor.mjs';
import { networkContext } from './neighbors.mjs';

const adapter = networkContext('eth0',{prefixes:['192.0.2.0/24'],gateways:['192.0.2.1']});
const first='02:00:00:00:00:01', second='02:00:00:00:00:02';
function setup() {
  const monitor = new Monitor();
  monitor.context = adapter;
  monitor.detector.clock(adapter,0);
  return monitor;
}
function observe(monitor,time,ip,mac,evidence='ARP sender') {
  monitor.observe(ip,mac,time,evidence);
}
const count = (m,type) => m.detector.events.filter(e=>e.type===type).length;

test('seeds quietly, respects trust, notification modes, repeated observations and arrival limit',()=>{
  const m = setup();
  observe(m,0,'192.0.2.1',first);
  observe(m,62000,'192.0.2.1',first);
  assert.equal(m.detector.events.length,0);
  observe(m,62001,'192.0.2.3',second);
  observe(m,64000,'192.0.2.3',second);
  assert.equal(count(m,'Device arrival'),1);
  const d=m.view().devices.find(d=>d.mac===second);
  m.command({command:'device_preference',id:d.id,label:'Lab',trusted:true});
  observe(m,2*86400000,'192.0.2.3',second);
  assert.equal(count(m,'Device arrival'),1);
  const rules = {...m.detector.rules,discovery:'all'};
  m.command({command:'monitor_rules',rules});
  observe(m,4*86400000,'192.0.2.3',second);
  assert.equal(count(m,'Device arrival'),2);
  m.command({command:'monitor_rules',rules:{...rules,discovery:'off'}});
  observe(m,6*86400000,'192.0.2.3',second);
  assert.equal(count(m,'Device arrival'),2);
  m.command({command:'monitor_rules',rules});
  for (let i=10;i<20;i++) observe(m,7*86400000+i,'192.0.2.'+i,'02:00:00:00:00:'+i);
  assert.equal(m.detector.suppressed,5);
});
test('alternating recent ARP senders raise one advisory; sustained reassignment and remote claims do not',()=>{
  const m=setup(),ip='192.0.2.4';
  observe(m,61000,ip,first); observe(m,63000,ip,second); observe(m,64000,ip,second);
  assert.equal(count(m,'Conflicting ARP claims'),0);
  observe(m,120000,ip,first);
  assert.equal(count(m,'Conflicting ARP claims'),0);
  observe(m,121000,ip,second); observe(m,122000,ip,first);
  assert.equal(count(m,'Conflicting ARP claims'),1);
  for (const [i,mac] of [first,second,first].entries()) observe(m,130000+i,'203.0.113.2',mac);
  assert.equal(count(m,'Conflicting ARP claims'),1);
  const alert=m.detector.events.find(e=>e.type==='Conflicting ARP claims');
  assert.ok(alert.evidence.includes(first) && alert.evidence.includes(second));
  m.command({command:'ack_event',id:alert.id}); assert.ok(alert.acknowledged);
});
test('gateway requires confirmed replacement on the same network; a transient change clears',()=>{
  const m=setup(),ip='192.0.2.1';
  observe(m,0,ip,first,'OS neighbor cache');
  observe(m,70000,ip,second); observe(m,71000,ip,first); observe(m,72000,ip,second);
  assert.equal(count(m,'Gateway MAC changed'),0);
  observe(m,74000,ip,second);
  assert.equal(count(m,'Gateway MAC changed'),1);
  m.context=networkContext('eth1',{prefixes:['192.0.2.0/24'],gateways:[ip]});
  observe(m,90000,ip,first);
  assert.equal(count(m,'Gateway MAC changed'),1);
});
test('rate uses a mature live window, sustain period and cooldown; replay processing speed is ignored',()=>{
  const m=setup(),hot={packetsPerSecond:1500,rateSeconds:3};
  const rate=(ms,stats=hot)=>m.detector.rate(m.context,stats,ms);
  rate(61000,{...hot,rateSeconds:0.2}); rate(62000); rate(62200,{...hot,packetsPerSecond:1});
  rate(64000); rate(65000); rate(66000);
  assert.equal(count(m,'Capture rate above threshold'),1);
  assert.deepEqual(m.detector.events[0].measurement,{from:62000,thresholdPps:1000});
  rate(126000);
  assert.equal(count(m,'Capture rate above threshold'),2);
  m.context={...adapter,replay:true};
  rate(220000); rate(222000);
  assert.equal(count(m,'Capture rate above threshold'),2);
  assert.throws(()=>m.command({command:'monitor_rules',rules:{...m.detector.rules,pps:0}}));
});

test('anomaly switches are independent and do not disable observation',()=>{
  const m=setup(),ip='192.0.2.1';
  m.command({command:'monitor_rules',rules:{...m.detector.rules,discovery:'off',arp:false,gateway:false,spike:false}});
  observe(m,0,ip,first);
  for (const [i,mac] of [first,second,first,second,second].entries()) observe(m,70000+i*2000,ip,mac);
  m.detector.rate(adapter,{packetsPerSecond:9000,rateSeconds:3},89000);
  m.detector.rate(adapter,{packetsPerSecond:9000,rateSeconds:3},91000);
  assert.equal(m.view().eventTotal,0); assert.equal(m.view().deviceTotal,2);
});
