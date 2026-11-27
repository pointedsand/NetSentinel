import assert from 'node:assert/strict';
import test from 'node:test';
import { PacketHistory } from './history.mjs';
import { Hostnames } from './resolver.mjs';
test('restart adds counter snapshots once, retains source, reports evictions and clears', () => {
 const h = new PacketHistory(2);
 const batch = {packetCount:2,bytes:120,rejected:1,outputDrops:0,elapsedSeconds:1,
   protocolCounts:[0,2,0,0],packets:[{},{}]};
 h.append(batch,'A'); h.append({...batch,packets:[]},'A'); h.begin();
 h.append({...batch,packets:[{}]},'B');
 assert.equal(h.stats.packetCount,4); assert.equal(h.stats.rejected,2);
 assert.equal(h.evicted,1); assert.deepEqual(h.rows.map(p=>p.captureSource),['A','B']);
 h.clear(); assert.equal(h.stats.packetCount,0); assert.equal(h.rows.length,0);
});

test('late IPv6 PTR updates retained records on the same interface after capture stops', async () => {
  const history=new PacketHistory();
  let resolve;
  const ip='2001:db8::1';
  const names=new Hostnames({resolver:{reverse:()=>new Promise(r=>{resolve=r;}),cancel(){}},
    onResult:(address,name)=>history.applyPtr('A',address,name)});
  const batch={...history.stats,packets:[{source:ip,destination:'other'}]};
  assert.equal(names.get(ip),null);
  history.append(batch,'A'); history.begin(); history.append(batch,'B');
  resolve(['example.test']); await Promise.resolve();
  assert.equal(history.rows[0].sourceHostname,'example.test');
  assert.equal(history.rows[0].source,ip);
  assert.equal(history.rows[1].sourceHostname,undefined);
  assert.equal(names.get(ip),'example.test');
  names.close();
});
