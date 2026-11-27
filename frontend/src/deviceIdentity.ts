import type { Capture } from './hooks/useCapture';
import type { LocalDevice, Packet } from './types';

export function deviceName(d: LocalDevice) {
  if (d.label.trim()) return d.label;
  if (d.hostname && !d.nameExpired) return d.hostname;
  return 'Unknown Device';
}

export function interfaceName(source: string, names: Record<string,string> = {}) {
  if (names[source]) return names[source];
  if (/NPF_Loopback/i.test(source)) return 'Loopback';
  if (/NPF_/i.test(source)) return 'Capture adapter';
  return source.split(/[\\/]/).pop() || 'Capture source';
}

export function isDevicePacket(packet: Packet, device: LocalDevice) {
  const p = packet.details;
  if (!p || p.captureSource !== device.source || p.networkScope !== device.scope || p.vlanIds?.length) return false;
  return (p.sourceMac === device.mac && device.ips.includes(p.source)) ||
    (p.destinationMac === device.mac && device.ips.includes(p.destination));
}

export function sourceName(state: Capture, index: number) {
  return interfaceName(state.sourceIds[index] ?? state.sources[index] ?? '',{...state.sourceNames,...state.monitor?.interfaceNames});
}
