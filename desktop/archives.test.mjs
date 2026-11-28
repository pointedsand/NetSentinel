import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm,realpath,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {archiveStore,registerArchives} from './archives.mjs';

async function fixture(t,id) {
  const dir=await mkdtemp(join(tmpdir(),'netsentinel-archives-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  let shown;
  const store=archiveStore(()=>dir,async path=>{shown=path;return '';},id);
  return {dir,store,shown:()=>shown};
}
test('local archive commits are complete, discoverable after restart and never overwrite a collision',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1700000000000});
  const {dir,store,shown}=await fixture(t,()=>'fixed');
  assert.deepEqual(await store.list(),[]);
  const id=await store.begin('JSON');
  await store.append(id,['{"id":1}']);
  assert.deepEqual(await store.list(),[]);
  const name=await store.finish(id);
  const [entry]=await store.list();
  assert.equal(entry.count,1);
  const next=archiveStore(()=>dir,async()=>'');
  const [rediscovered]=await next.list();
  assert.equal(rediscovered.name,name);
  assert.equal(Buffer.from(await next.read(name,rediscovered.stamp,0,entry.size)).toString(),'[{"id":1}]');
  const again=await store.begin('JSON');
  await assert.rejects(store.finish(again),{code:'EEXIST'});
  await store.show();
  assert.equal(shown(),await realpath(join(dir,'NetSentinel_Logs')));
  assert.deepEqual(await readdir(shown()),[name]);
  assert.equal(await readFile(join(shown(),name),'utf8'),'[{"id":1}]');
  await writeFile(join(shown(),name),'[]');
  await assert.rejects(store.read(name,entry.stamp,0,1),/changed/);
});
test('archive operations reject invalid paths, sizes, missing access and interrupted saves',async t=>{
  const {dir,store}=await fixture(t);
  for (const name of ['../x.csv','dir\\x.json','C:x.csv','CON.csv','x.exe'])
    await assert.rejects(store.read(name,'',0,1),/Invalid/);
  await assert.rejects(store.read('x.csv','',0,300000),/Invalid/);
  await assert.rejects(store.begin('html'),/Invalid/);
  const id=await store.begin('CSV');
  await assert.rejects(store.append(id,['x'.repeat(300000)]),/Invalid/);
  await store.reset();
  assert.deepEqual(await readdir(join(dir,'NetSentinel_Logs')),[]);
  const denied=archiveStore(()=>join(dir,'file'),async()=>'');
  await writeFile(join(dir,'file'),'');
  await assert.rejects(denied.list());
  await assert.rejects(denied.begin('CSV'));
});
test('every archive IPC operation requires the exact top frame in the owning window',()=>{
  const handlers=new Map(), frame={url:'netsentinel://desktop/'}, contents={mainFrame:frame};
  const store={list:()=>['ok']};
  registerArchives({handle:(key,fn)=>handlers.set(key,fn)},store,()=>({webContents:contents}),'netsentinel://desktop');
  for (const fn of handlers.values()) {
    assert.throws(()=>fn({sender:{},senderFrame:frame}),/Untrusted/);
    assert.throws(()=>fn({sender:contents,senderFrame:{...frame}}),/Untrusted/);
    frame.url='netsentinel://other/';
    assert.throws(()=>fn({sender:contents,senderFrame:frame}),/Untrusted/);
    frame.url='netsentinel://desktop/';
  }
  assert.deepEqual(handlers.get('archive:list')({sender:contents,senderFrame:frame}),['ok']);
});
