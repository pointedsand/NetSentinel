import type { Packet, SecurityEvent } from './types';

const summaries: Record<string,string> = {
  'Conflicting ARP claims':'Different MAC addresses claimed the same IP address.',
  'Gateway MAC changed':'The default gateway was observed with a different MAC address twice.',
  'Capture rate above threshold':'The measured capture rate exceeded the configured threshold.',
};
export function alertSummary(event: SecurityEvent) {
  return summaries[event.type] || event.evidence;
}
export function severityLabel(severity: string) {
  return ({Medium:'Warning',High:'Critical',Low:'Info'} as Record<string,string>)[severity] || severity;
}

export function isAlertPacket(packet: Packet, event: SecurityEvent) {
  const p = packet.details;
  if (!p || !event.scope || event.scope !== p.networkScope || event.source !== p.captureSource) return false;
  const age = event.time - p.timestampUs/1000;
  if (age < 0) return false;
  if (event.type === 'Capture rate above threshold') {
    return Boolean(event.measurement && p.timestampUs/1000 >= event.measurement.from);
  }
  if (p.vlanIds?.length) return false;
  if (event.type === 'Conflicting ARP claims') return age <= 30000 && p.network === 'ARP' && p.source === event.ip;
  if (!event.mac || !event.ip) return false;
  const windowMs = event.type === 'Gateway MAC changed' ? 120000 : 1000;
  return age <= windowMs && ((p.sourceMac === event.mac && p.source === event.ip) ||
    (p.destinationMac === event.mac && p.destination === event.ip));
}
