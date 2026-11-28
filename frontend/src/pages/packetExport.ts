import type { Packet } from '../types';

export type ExportFormat = 'PCAP' | 'CSV' | 'JSON';

export interface ExportFile {
  content: string;
  mimeType: string;
  extension: string;
  description: string;
}

function csvField(value:string) {
  return /[",\r\n]/.test(value) ? '"'+value.replaceAll('"','""')+'"' : value;
}

export function csvPacketRow(packet:Packet) {
  return [packet.id,csvField(packet.source),csvField(packet.destination),csvField(packet.protocol),
    '"'+packet.size.replaceAll('"','""')+'"','"'+packet.name.replaceAll('"','""')+'"',
    packet.timestamp,'"'+packet.time.replaceAll('"','""')+'"'].join(',');
}

/**
 * Formats selected packet records for download. The PCAP choice is currently
 * a readable text summary, not a binary PCAP encoder.
 */
export function createExportFile(data: Packet[], format: ExportFormat): ExportFile {
  if (format === 'JSON') {
    return {
      content: JSON.stringify(data, null, 2),
      mimeType: 'application/json',
      extension: 'json',
      description: 'JSON Capture Log',
    };
  }

  if (format === 'CSV') {
    const headers = ['ID', 'Source', 'Destination', 'Protocol', 'Size', 'Name', 'Timestamp', 'Time'];
    const rows = data.map(csvPacketRow);
    return {
      content: [headers.join(','), ...rows].join('\n'),
      mimeType: 'text/csv',
      extension: 'csv',
      description: 'CSV Spreadsheet',
    };
  }

  return {
    content: data.map((packet) => (
      `[${packet.time}] ${packet.protocol} ${packet.source} -> ${packet.destination} (${packet.size}) - ${packet.name}`
    )).join('\n'),
    mimeType: 'application/vnd.tcpdump.pcap',
    extension: 'pcap',
    description: 'PCAP Packet Capture',
  };
}
