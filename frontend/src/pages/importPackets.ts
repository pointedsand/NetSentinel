import type { Packet } from '../types';

export interface ImportedLog { name: string; packets: Packet[] }

function csvRows(text: string) {
  const records: string[][] = [];
  let row: string[] = [], field = '', quoted = false, ended = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else { quoted = false; ended = true; }
    } else if (c === ',') { row.push(field); field = ''; ended = false; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); records.push(row); row = []; field = ''; ended = false;
    } else if (c === '"' && !field && !ended) quoted = true;
    else if (c === '"' || ended) throw Error('Invalid CSV quoting.');
    else field += c;
    if (records.length > 4097 || row.length > 8) throw Error('CSV exceeds the supported record dimensions.');
  }
  if (quoted) throw Error('Unclosed CSV field.');
  if (field || row.length || ended) records.push([...row,field]);
  return records;
}

export function importPackets(name: string, input: string): ImportedLog {
  const text = input.replace(/^\uFEFF/, '');
  let rows: unknown;
  if (/\.json$/i.test(name)) rows = JSON.parse(text);
  else if (/\.csv$/i.test(name)) {
    const [header, ...data] = csvRows(text);
    if (header?.length !== 8 || header.join(',') !== 'ID,Source,Destination,Protocol,Size,Name,Timestamp,Time') throw Error('Expected NetSentinel packet CSV headers.');
    rows = data.map(row => {
      if (row.length !== 8 || !/^\d+$/.test(row[0]) || !/^\d+(\.\d+)?$/.test(row[6]) || !/^\d+ B$/.test(row[4])) throw Error('Invalid packet CSV row.');
      const [id,source,destination,protocol,size,name,timestamp,time] = row;
      return { id:Number(id), source,destination,protocol,size,name,timestamp:Number(timestamp),time,sizeBytes:parseInt(size,10) };
    });
  } else throw Error('Choose a packet CSV or JSON export. Open binary captures with replay.');
  if (!Array.isArray(rows) || rows.length > 4096) throw Error('Expected an array of at most 4,096 packet records.');
  const packets = rows.map((p,i) => {
    if (!p || !Number.isSafeInteger(p.id) || p.id < 0 || !Number.isFinite(p.timestamp) || !Number.isSafeInteger(p.sizeBytes) ||
        p.sizeBytes < 0 || ![p.source,p.destination,p.protocol,p.size,p.name,p.time].every(v => typeof v === 'string' && v.length <= 1024)) {
      throw Error('Invalid packet metadata at row ' + (i + 1));
    }
    const {id,source,destination,protocol,size,name,timestamp,time,sizeBytes} = p;
    return {id,source,destination,protocol,size,name,timestamp,time,sizeBytes};
  });
  return {name,packets};
}
