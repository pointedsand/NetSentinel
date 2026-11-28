import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openHistoryPreferences } from './monitor-store.mjs';
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

test('overflow discards oldest stored records independently of worker drops and capture restarts', () => {
  const h = new PacketHistory();
  const total = h.limit + 17;
  const first = {...h.stats, packetCount:total, packets:Array.from({length:total}, () => ({}))};
  const full = h.append(first, 'fixture');
  assert.equal(full.historyCapacity, h.limit);
  assert.equal(full.retained, h.limit);
  assert.equal(full.evicted, 17);
  assert.equal(full.outputDrops, 0);
  assert.equal(h.rows[0].id, 18);
  h.begin();
  const next = h.append({...first, packetCount:4, rejected:1, outputDrops:3, packets:[{}]}, 'second');
  assert.equal(next.packetCount + next.rejected, total + 5);
  assert.equal(next.evicted, 18);
  assert.equal(next.outputDrops, 3);
  h.clear();
  const cleared = h.message([]);
  assert.deepEqual([cleared.packetCount, cleared.rejected, cleared.retained, cleared.evicted, cleared.outputDrops], [0,0,0,0,0]);
  assert.equal(cleared.historyCapacity, h.limit);
});

test('supported retention limits keep the newest records and cumulative totals', () => {
  const history = new PacketHistory();
  assert.equal(history.limit,30000);
  const packets = Array.from({length:1000},()=>({protocol:'UDP'}));
  for (let n=1000; n<=75000; n+=1000)
    history.append({...history.stats,packetCount:n,packets},'fixture');
  for (const [limit,retained] of [[30000,30000],[50000,30000],[10000,10000],[5000,5000]]) {
    history.resize(limit);
    assert.deepEqual(history.rows.map(p=>p.id),Array.from({length:retained},(_,i)=>75001-retained+i));
    assert.equal(history.evicted,75000-retained);
    assert.equal(history.stats.packetCount,75000);
    assert.equal(history.stats.outputDrops,0);
  }
  for (const limit of [null,0,-1,4096,50001,'5000']) assert.throws(()=>history.resize(limit));
  assert.equal(history.limit,5000);
});

test('one persistent preference works alongside an existing monitoring store',async t=>{
  const dir = await mkdtemp(join(tmpdir(),'retention-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file = join(dir,'monitor-v1.json');
  const original = JSON.stringify({version:1,devices:[],events:[]});
  await writeFile(file,original);
  const preferences = await openHistoryPreferences(file);
  assert.equal(preferences.limit,30000);
  await preferences.save(50000);
  await assert.rejects(preferences.save('5000'));
  assert.equal((await openHistoryPreferences(file)).limit,50000);
  assert.equal(await readFile(file,'utf8'),original);
  await writeFile(file+'.preferences.json',JSON.stringify({version:1,historyLimit:999999}));
  assert.equal((await openHistoryPreferences(file)).limit,30000);
});
