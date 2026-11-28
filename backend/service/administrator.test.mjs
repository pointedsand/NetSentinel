import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Administrator } from './administrator.mjs';

const secret = () => randomBytes(24).toString('hex');
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(),'netsentinel-auth-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file = join(dir,'administrator.json');
  let clock = Date.now();
  const admin = new Administrator(file,()=>clock);
  const password = secret();
  const prepare = await admin.command({command:'admin_prepare'});
  const code = (await readFile(prepare.setupFile,'utf8')).trim();
  const call = (command,fields={})=>admin.command({command,...fields});
  return {admin,file,password,code,call,advance:ms=>{clock+=ms;},setup:()=>call('admin_setup',{code,newPassword:password})};
}

test('explicit local enrollment persists only a salted verifier and fails closed on corrupt credentials',async t=>{
  const {file,admin,call,code,password,setup} = await fixture(t);
  const otherBridge = new Administrator(file);
  assert.equal(admin.status().enabled,false);
  await assert.rejects(call('admin_setup',{code:secret(),newPassword:password}),/Incorrect/);
  await assert.rejects(call('admin_setup',{code,newPassword:'short'}),/12 characters/);
  assert.equal((await setup()).unlocked,false);
  assert.equal(otherBridge.permits(undefined),false);
  const stored = await readFile(file,'utf8');
  assert.ok(!stored.includes(password));
  assert.equal(JSON.parse(stored).algorithm,'scrypt');
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777,0o600);
  const restarted = new Administrator(file);
  assert.equal(restarted.status().enabled,true);
  assert.equal(restarted.permits(undefined),false);
  assert.ok((await restarted.command({command:'admin_unlock',password})).token);
  await writeFile(file,'{}');
  const invalid = new Administrator(file);
  assert.equal(invalid.status().unavailable,true);
  assert.throws(()=>invalid.permits(''),/unavailable/);
  await assert.rejects(invalid.command({command:'admin_prepare'}),/unavailable/);
});

test('idle timeout, explicit lock, credential rotation and disable invalidate tokens',async t=>{
  const {admin,call,setup,password,file,advance} = await fixture(t);
  await setup();
  const unlock = async password=>(await call('admin_unlock',{password})).token;
  let token = await unlock(password);
  advance(14*60000); assert.ok(admin.permits(token));
  advance(14*60000); assert.equal((await call('admin_status')).unlocked,true);
  advance(61000); assert.equal(admin.permits(token),false);
  token = await unlock(password);
  await call('admin_lock');
  assert.equal(admin.permits(token),false);
  token = await unlock(password);
  const replacement = secret();
  for (const command of ['admin_change','admin_disable'])
    await assert.rejects(call(command,{password:secret(),newPassword:replacement,token}),/Incorrect/);
  const previous = JSON.parse(await readFile(file,'utf8'));
  await call('admin_change',{password,newPassword:replacement});
  assert.notEqual(JSON.parse(await readFile(file,'utf8')).salt,previous.salt);
  assert.equal(admin.permits(token),false);
  await assert.rejects(unlock(password),/Incorrect/);
  assert.ok(await unlock(replacement));
  assert.equal((await call('admin_disable',{password:replacement})).enabled,false);
  assert.equal(new Administrator(file).status().enabled,false);
});

test('rate limiting survives disconnect and recovers after cooldown; in-flight unlock can be cancelled',async t=>{
  const {admin,call,setup,password,advance} = await fixture(t);
  await setup();
  for (let n=0;n<5;n++) await assert.rejects(call('admin_unlock',{password:secret()}),/Incorrect/);
  admin.lock();
  await assert.rejects(call('admin_unlock',{password}),/Too many/);
  advance(61000);
  const unlocking = call('admin_unlock',{password});
  await assert.rejects(call('admin_unlock',{password}),/progress/);
  admin.lock();
  await assert.rejects(unlocking,/cancelled/);
  assert.equal(admin.status().unlocked,false);
  assert.ok((await call('admin_unlock',{password})).token);
});

test('file selection confirms the current proof without granting access; expired and renewed files cannot enroll',async t=>{
  const {admin,call,code,password,advance,setup} = await fixture(t);
  const verify = code=>call('admin_verify_setup',{code});
  const verified = await verify(code);
  assert.equal(verified.enabled,false);
  assert.equal(verified.unlocked,false);
  assert.ok(Number.isFinite(verified.setupVerifiedUntil));
  assert.ok(!JSON.stringify(verified).includes(code));
  advance(600_000);
  await assert.rejects(verify(code),/expired/);
  await assert.rejects(setup(),/expired/);
  const next = await call('admin_prepare');
  const replacement = (await readFile(next.setupFile,'utf8')).trim();
  assert.notEqual(replacement,code);
  await assert.rejects(verify(code),/Incorrect setup file/);
  assert.equal((await verify(replacement)).unlocked,false);
  await assert.rejects(call('admin_setup',{newPassword:password}),/Incorrect setup file/);
  assert.equal((await call('admin_setup',{code:replacement,newPassword:password})).enabled,true);
  await assert.rejects(readFile(next.setupFile),{code:'ENOENT'});
  await assert.rejects(verify(replacement),/Invalid administrator command/);
  assert.equal(admin.permits(undefined),false);
});

test('setup-file verification shares the enrollment failure limit',async t=>{
  const {call,code,advance} = await fixture(t);
  for (let n=0;n<5;n++)
    await assert.rejects(call('admin_verify_setup',{code:secret()}),/Incorrect setup file/);
  await assert.rejects(call('admin_verify_setup',{code}),/Too many attempts/);
  await assert.rejects(call('admin_prepare'),/Too many attempts/);
  advance(60_001);
  assert.ok((await call('admin_verify_setup',{code})).setupVerifiedUntil);
});
