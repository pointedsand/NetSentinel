import type { Packet } from '../types';
import { csvPacketRow } from '../pages/packetExport';

export interface ArchiveEntry {
  name:string; size:number; modified:number; stamp:string; count:number|null;
}
interface ArchiveAPI {
  list():Promise<ArchiveEntry[]>;
  show():Promise<void>;
  read(name:string,stamp:string,offset:number,length:number):Promise<Uint8Array>;
  begin(format:'CSV'|'JSON'):Promise<string>;
  append(id:string,rows:string[]):Promise<void>;
  finish(id:string):Promise<string>;
  abort(id:string):Promise<void>;
}
declare global {interface Window {netSentinelArchives?:ArchiveAPI}}

export async function saveArchive(api:ArchiveAPI,format:'CSV'|'JSON',packets:Packet[]) {
  const id=await api.begin(format);
  try {
    let rows:string[]=[], size=0;
    for (const packet of packets) {
      const row=format==='CSV' ? csvPacketRow(packet) : JSON.stringify(packet);
      // Three UTF-8 bytes per UTF-16 code unit bounds the IPC message before encoding.
      if (rows.length && (rows.length===128 || size+row.length>300000)) {
        await api.append(id,rows);
        rows=[]; size=0;
      }
      rows.push(row); size+=row.length;
    }
    if (rows.length) await api.append(id,rows);
    return await api.finish(id);
  } catch (error) {
    await api.abort(id).catch(()=>{});
    throw error;
  }
}
