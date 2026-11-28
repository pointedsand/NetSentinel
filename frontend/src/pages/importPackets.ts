import type { Packet } from '../types';

export interface ImportedLog { name:string; packets:Packet[]; local?:boolean }
export const maxArchiveBytes = 128 * 1024 * 1024;
const header = 'ID,Source,Destination,Protocol,Size,Name,Timestamp,Time';

function csvFields(text:string) {
  const fields:string[] = [];
  let value='', quoted=false, ended=false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) {
      if (c!=='"') value+=c;
      else if (text[i+1]==='"') { value+='"'; i++; }
      else { quoted=false; ended=true; }
    } else if (c===',') { fields.push(value); value=''; ended=false; }
    else if (c==='"' && !value && !ended) quoted=true;
    else if (ended || c==='"') throw Error('Invalid CSV quoting.');
    else value+=c;
    if (value.length>1024 || fields.length>7) throw Error('CSV exceeds the supported field dimensions.');
  }
  if (quoted) throw Error('Unclosed CSV field.');
  return [...fields,value];
}

function csvPacket(text:string) {
  const fields=csvFields(text);
  const [id,source,destination,protocol,size,name,timestamp,time]=fields;
  if (fields.length!==8 || !/^\d+$/.test(id) || !/^\d+(\.\d+)?$/.test(timestamp) || !/^\d+ B$/.test(size))
    throw Error('Expected eight NetSentinel packet fields.');
  return {id:Number(id),source,destination,protocol,size,name,timestamp:Number(timestamp),time,sizeBytes:parseInt(size,10)};
}

function summary(value:Packet) {
  if (!value || !Number.isSafeInteger(value.id) || value.id<0 || !Number.isFinite(value.timestamp) ||
      !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes<0 ||
      ![value.source,value.destination,value.protocol,value.size,value.name,value.time].every(v=>typeof v==='string' && v.length<=1024))
    throw Error('Invalid packet metadata.');
  const {id,source,destination,protocol,size,name,timestamp,time,sizeBytes}=value;
  return {id,source,destination,protocol,size,name,timestamp,time,sizeBytes};
}

class ArchiveParser {
  readonly packets:Packet[]=[];
  private record='';
  private depth=0;
  private quoted=false;
  private escaped=false;
  private skipLF=false;
  private firstChunk=true;
  private headerSeen=false;
  private state:'start'|'first'|'next'|'after'|'done'='start';
  private readonly json:boolean;
  constructor(name:string) {
    if (!/\.(csv|json)$/i.test(name)) throw Error('Choose a NetSentinel packet CSV or JSON file.');
    this.json=/\.json$/i.test(name);
  }
  private emit() {
    if (!this.json && !this.headerSeen) {
      const fields=csvFields(this.record);
      if (fields.length!==8 || fields.join(',')!==header) throw Error('Expected NetSentinel packet CSV headers.');
      this.headerSeen=true;
    } else {
      if (this.packets.length>=100000) throw Error('Archive exceeds 100,000 packet records.');
      try { this.packets.push(summary(this.json ? JSON.parse(this.record) : csvPacket(this.record))); }
      catch (error) {throw Error('Invalid packet at row '+(this.packets.length+1)+'. '+(error as Error).message,{cause:error});}
    }
    this.record='';
  }
  private csvChar(c:string) {
    if (this.skipLF) {this.skipLF=false; if (c==='\n') return;}
    if (!this.quoted && (c==='\n' || c==='\r')) {
      this.skipLF=c==='\r';
      this.emit();
    } else {
      if (c==='"') this.quoted=!this.quoted;
      this.record+=c;
    }
  }
  private jsonChar(c:string) {
    if (!this.depth) {
      if (' \t\r\n'.includes(c)) return;
      if (this.state==='start' && c==='[') {this.state='first';return;}
      if ((this.state==='first' || this.state==='after') && c===']') {this.state='done';return;}
      if (this.state==='after' && c===',') {this.state='next';return;}
      if ((this.state!=='first' && this.state!=='next') || c!=='{') throw Error('Expected a JSON array of packet objects.');
    }
    this.record+=c;
    if (this.quoted) {
      if (this.escaped) this.escaped=false;
      else if (c==='\\') this.escaped=true;
      else if (c==='"') this.quoted=false;
    } else if (c==='"') this.quoted=true;
    else if (c==='{' || c==='[') {
      if (++this.depth>64) throw Error('Archive nesting exceeds 64 levels.');
    } else if (c==='}' || c===']') {
      if (--this.depth===0) {this.emit();this.state='after';}
    }
  }
  feed(text:string) {
    if (!text.length) return;
    if (this.firstChunk) {text=text.replace(/^\uFEFF/,'');this.firstChunk=false;}
    for (let i=0;i<text.length;i++) {
      if (this.json) this.jsonChar(text[i]); else this.csvChar(text[i]);
      if (this.record.length>262144) throw Error('Archive record exceeds 256 Ki characters.');
    }
  }
  finish(name:string):ImportedLog {
    if (this.json && this.state!=='done') throw Error('Incomplete JSON packet array.');
    if (!this.json && this.quoted) throw Error('Unclosed CSV field.');
    if (!this.json && this.record) this.emit();
    if (!this.json && !this.headerSeen) throw Error('Missing CSV header.');
    return {name,packets:this.packets};
  }
}

export function importPackets(name:string,input:string) {
  if (input.length>maxArchiveBytes) throw Error('Maximum archive size is 128 MiB.');
  const parser=new ArchiveParser(name);
  parser.feed(input);
  return parser.finish(name);
}

export async function readArchive(name:string,size:number,read:(offset:number,length:number)=>Promise<Uint8Array>,signal?:AbortSignal) {
  if (!Number.isSafeInteger(size) || size<0 || size>maxArchiveBytes) throw Error('Maximum archive size is 128 MiB.');
  const parser=new ArchiveParser(name), decoder=new TextDecoder('utf-8',{fatal:true});
  for (let offset=0;offset<size;) {
    signal?.throwIfAborted();
    const length=Math.min(256*1024,size-offset);
    const data=await read(offset,length);
    if (data.length!==length) throw Error('Archive changed during reading.');
    parser.feed(decoder.decode(data,{stream:true}));
    offset+=length;
  }
  signal?.throwIfAborted();
  parser.feed(decoder.decode());
  return parser.finish(name);
}

export async function readExternal(file:File,signal?:AbortSignal) {
  if (file.size<=256*1024) return importPackets(file.name,await file.text());
  return readArchive(file.name,file.size,async (start,n)=>new Uint8Array(await file.slice(start,start+n).arrayBuffer()),signal);
}
