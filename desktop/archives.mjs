import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, opendir, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const maxBytes = 128 * 1024 * 1024;
const csvHeader = 'ID,Source,Destination,Protocol,Size,Name,Timestamp,Time';

function validName(name) {
  return typeof name === 'string' && name.length <= 255 && /\.(csv|json)$/i.test(name) &&
    !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(name);
}
const stamp = stat => [stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':');

export function archiveStore(documents, showFolder, uuid = randomUUID) {
  const counts = new Map();
  let pending;
  async function folder() {
    const path = join(documents(),'NetSentinel_Logs');
    await mkdir(path,{recursive:true});
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Choose a regular local archive directory.');
    return realpath(path);
  }
  async function list() {
    const path = await folder(), entries = [];
    for await (const entry of await opendir(path)) {
      if (!entry.isFile() || !validName(entry.name)) continue;
      if (entries.length >= 10000) throw Error('This folder exceeds 10,000 archives. Move older files to another folder.');
      try {
        const stat = await lstat(join(path,entry.name));
        if (!stat.isFile()) continue;
        const key = stamp(stat), cached = counts.get(entry.name);
        entries.push({name:entry.name,size:stat.size,modified:stat.mtimeMs,stamp:key,
          count:cached?.stamp === key ? cached.count : null});
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return entries.sort((a,b)=>b.modified-a.modified || a.name.localeCompare(b.name));
  }
  async function read(name,expected,offset,length) {
    if (!validName(name) || typeof expected !== 'string' || !Number.isSafeInteger(offset) || offset<0 ||
        !Number.isSafeInteger(length) || length<1 || length>256*1024) throw Error('Invalid archive read request.');
    const path = join(await folder(),name);
    const info = await lstat(path);
    if (!info.isFile() || stamp(info)!==expected) throw Error('Archive changed. Refresh the archive list.');
    const file = await open(path,'r');
    try {
      const stat = await file.stat();
      if (stamp(stat)!==expected || stat.size>maxBytes || offset+length>stat.size) throw Error('Archive changed or exceeds 128 MiB.');
      const data = Buffer.alloc(length);
      const {bytesRead} = await file.read(data,0,length,offset);
      if (bytesRead!==length || stamp(await file.stat())!==expected) throw Error('Archive changed during reading.');
      return new Uint8Array(data);
    } finally { await file.close(); }
  }
  async function begin(format) {
    if (!['CSV','JSON'].includes(format) || pending) throw Error('Invalid format or another export is active.');
    const job = {id:randomUUID(),format,count:0,bytes:0,busy:true};
    pending = job;
    try {
      job.dir = await folder();
      job.temp = join(job.dir,'.'+job.id+'.partial');
      job.file = await open(job.temp,'wx',0o600);
      job.ownsTemp = true;
      const header = format === 'JSON' ? '[' : csvHeader;
      await job.file.writeFile(header);
      job.bytes = Buffer.byteLength(header);
      return job.id;
    } catch (error) { await discard(job); throw error; }
    finally {job.busy=false;}
  }
  function active(id) {
    if (!pending || pending.id !== id || pending.busy) throw Error('Invalid archive export session.');
    return pending;
  }
  async function discard(job) {
    try {
      await job.file?.close();
      if (job.ownsTemp) await unlink(job.temp).catch(error=>{if(error.code!=='ENOENT') throw error;});
    } finally {if (pending===job) pending=undefined;}
  }
  async function append(id,rows) {
    const job = active(id);
    if (!Array.isArray(rows) || !rows.length || rows.length>128 || job.count+rows.length>100000)
      throw Error('Invalid archive batch or record count.');
    const json = job.format === 'JSON';
    let bytes = 0;
    for (const row of rows) {
      if (typeof row!=='string' || row.length===0 || Buffer.byteLength(row)>256*1024 ||
          (json ? !(row.startsWith('{') && row.endsWith('}')) : !/^\d+,/.test(row))) throw Error('Invalid archive row.');
      bytes += Buffer.byteLength(row)+1;
    }
    if (bytes>1024*1024 || job.bytes+bytes+1>maxBytes) throw Error('Archive exceeds the supported byte limit.');
    job.busy=true;
    try {
      const sep = json ? ',' : '\n';
      await job.file.writeFile((!json || job.count ? sep : '')+rows.join(sep));
      job.count+=rows.length;
      job.bytes+=bytes;
    } catch (error) {await discard(job);throw error;}
    finally {job.busy=false;}
  }
  async function finish(id) {
    const job = active(id);
    job.busy=true;
    const time = new Date().toISOString().replace(/:/g,'-');
    const name = 'netsentinel-'+time+'-'+uuid()+'.'+job.format.toLowerCase();
    const path = join(job.dir,name);
    let published=false;
    try {
      if (job.format === 'JSON') await job.file.writeFile(']');
      await job.file.sync();
      await job.file.close();
      job.file=undefined;
      await link(job.temp,path);
      published=true;
    } finally {
      try { await discard(job); }
      catch (error) {
        if (!published) throw error;
        console.warn('Saved archive. Temporary export cleanup failed.');
      }
    }
    try {
      if (counts.size>=10000) counts.delete(counts.keys().next().value);
      counts.set(name,{stamp:stamp(await lstat(path)),count:job.count});
    } catch { /* The archive may have been moved after publication. */ }
    return name;
  }
  const writes = new Set();
  function track(operation) {
    return (...args)=>{
      const work = operation(...args);
      writes.add(work);
      return work.finally(()=>writes.delete(work));
    };
  }
  return {list,read,begin:track(begin),append:track(append),finish:track(finish),abort:track(async id=>discard(active(id))),
    async reset(){
      const job = pending;
      await Promise.allSettled([...writes]);
      if (job && pending===job) await discard(job);
    },async show(){
    const error = await showFolder(await folder());
    if (error) throw Error('Could not open the logs folder.');
  }};
}

export function registerArchives(ipc,store,window,origin) {
  for (const key of ['list','read','begin','append','finish','abort','show'])
    ipc.handle('archive:'+key,(event,...args)=>{
      const contents = window()?.webContents;
      if (!contents || event.sender!==contents || !event.senderFrame ||
          event.senderFrame!==contents.mainFrame || event.senderFrame.url!==origin+'/')
        throw Error('Untrusted archive request.');
      return store[key](...args);
    });
}
