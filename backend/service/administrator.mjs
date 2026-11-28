import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { defaultStateFile } from './monitor-store.mjs';

const derive = promisify(scrypt);
const params = { N:131072, r:8, p:1 };
const idle = 15 * 60_000;
const hex = bytes => randomBytes(bytes).toString('hex');
const matches = (a,b) => typeof b === 'string' && a.length === b.length &&
  /^[0-9a-f]+$/.test(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));

function load(file) {
  try {
    const entry = JSON.parse(readFileSync(file,'utf8'));
    if (entry.version !== 1 || entry.algorithm !== 'scrypt' ||
        !Object.entries(params).every(([k,v])=>entry[k] === v) ||
        typeof entry.salt !== 'string' || typeof entry.hash !== 'string' ||
        !/^[0-9a-f]{32}$/.test(entry.salt) || !/^[0-9a-f]{128}$/.test(entry.hash))
      throw Error();
    return entry;
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw Error('Administrator credential storage is unavailable.');
  }
}

async function hash(password,salt) {
  return (await derive(password,Buffer.from(salt,'hex'),64,{...params,maxmem:192*1024*1024})).toString('hex');
}

export class Administrator {
  constructor(file = join(dirname(defaultStateFile()),'administrator-v1.json'), now = Date.now) {
    this.file = file;
    this.now = now;
    this.failures = [];
    this.generation = 0;
    this.refresh();
  }
  refresh() {
    try {
      const record = load(this.file);
      if (this.unavailable || record?.salt !== this.record?.salt || record?.hash !== this.record?.hash)
        this.lock();
      this.record = record;
      this.unavailable = false;
    } catch {
      if (!this.unavailable) this.lock();
      this.unavailable = true;
    }
  }
  status() {
    const unlocked = Boolean(this.token && this.expires > this.now());
    if (!unlocked) this.token = undefined;
    return {type:'admin_status',enabled:Boolean(this.record),unavailable:!!this.unavailable,
      unlocked,expiresAt:unlocked ? this.expires : null};
  }
  lock() {
    this.generation++;
    this.token = undefined;
    if (this.enrollment) {
      try { rmSync(this.enrollment.path,{force:true}); } catch { /* The expired proof cannot be reused. */ }
      this.enrollment = undefined;
    }
  }
  permits(token) {
    this.refresh();
    if (this.unavailable) throw Error('Administrator credential storage is unavailable.');
    if (!this.record) return true;
    if (!this.status().unlocked || !matches(this.token,token)) return false;
    this.expires = this.now()+idle;
    return true;
  }
  failed(message = 'Incorrect administrator password.') {
    this.failures.push(this.now());
    throw Error(message);
  }
  verifySetup(code) {
    if (!this.enrollment || this.enrollment.until <= this.now())
      throw Error('The setup file has expired or is no longer active. Renew the setup file and select it again.');
    if (!matches(this.enrollment.code,code))
      this.failed('Incorrect setup file. Choose the current file shown in Access Control.');
  }
  async command(msg) {
    this.refresh();
    if (msg.command === 'admin_status') return this.status();
    if (msg.command === 'admin_lock') { this.lock(); return this.status(); }
    if (this.unavailable) throw Error('Administrator credential storage is unavailable.');
    if (msg.command === 'admin_activity') { this.permits(msg.token); return this.status(); }
    if (this.busy) throw Error('An administrator request is already in progress.');
    this.failures = this.failures.filter(t=>this.now()-t < 60_000);
    if (this.failures.length >= 5) throw Error('Too many attempts. Try again in one minute.');
    if (msg.command === 'admin_prepare' && !this.record) {
      this.lock();
      const code = hex(16), path = this.file+'.'+hex(8)+'.setup';
      try {
        mkdirSync(dirname(path),{recursive:true,mode:0o700});
        writeFileSync(path,code+'\n',{mode:0o600,flag:'wx'});
      } catch { throw Error('Cannot create a private setup file.'); }
      this.enrollment = {path,code,until:this.now()+600_000};
      return {...this.status(),setupFile:path};
    }
    if (msg.command === 'admin_verify_setup' && !this.record) {
      this.verifySetup(msg.code);
      return {...this.status(),setupFile:this.enrollment.path,setupVerifiedUntil:this.enrollment.until};
    }
    const setup = msg.command === 'admin_setup';
    if (setup ? this.record : !this.record || !['admin_unlock','admin_change','admin_disable'].includes(msg.command))
      throw Error('Invalid administrator command or protection state.');
    const newPassword = msg.newPassword;
    if ((setup || msg.command === 'admin_change') &&
        (typeof newPassword !== 'string' || newPassword.length < 12 || Buffer.byteLength(newPassword)>512))
      throw Error('Use at least 12 characters and at most 512 bytes for the new password.');
    if (setup) {
      this.verifySetup(msg.code);
    } else if (typeof msg.password !== 'string' || !msg.password.length || Buffer.byteLength(msg.password)>512)
      throw Error('Enter the current administrator password.');
    const generation = this.generation;
    const check = () => {
      this.refresh();
      if (this.unavailable || generation !== this.generation) throw Error('Administrator request cancelled.');
    };
    this.busy = true;
    try {
      if (!setup) {
        const candidate = await hash(msg.password,this.record.salt);
        check();
        if (!matches(this.record.hash,candidate)) this.failed();
      }
      if (msg.command === 'admin_unlock') {
        this.token = hex(32);
        this.expires = this.now()+idle;
        this.failures = [];
        return {...this.status(),token:this.token};
      }
      let record = null;
      if (setup || msg.command === 'admin_change') {
        const salt = hex(16);
        record = {version:1,algorithm:'scrypt',...params,salt,hash:await hash(newPassword,salt)};
        check();
        if (setup) this.verifySetup(msg.code);
      }
      const temp = this.file+'.'+hex(8)+'.tmp';
      try {
        if (record) {
          writeFileSync(temp,JSON.stringify(record),{flag:'wx',mode:0o600});
          if (setup) linkSync(temp,this.file);
          else renameSync(temp,this.file);
        } else rmSync(this.file);
      } catch {
        this.refresh();
        throw Error('Could not save administrator credentials.');
      } finally {
        try { rmSync(temp,{force:true}); } catch { /* A cleanup error must not roll back successful enrollment. */ }
      }
      this.record = record;
      this.failures = [];
      this.lock();
      return this.status();
    } finally { this.busy = false; }
  }
}
