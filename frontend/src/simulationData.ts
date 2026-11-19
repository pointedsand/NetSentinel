import type { Packet } from './types';

/** Shared demo hosts used to keep packet, device, alert, and log views consistent. */
export const SIMULATED_DEVICES = [
  {
    ipAddress: '192.168.1.10',
    macAddress: 'A4:5E:60:12:34:10',
    hostname: 'MacBook Pro',
    packetName: 'MacBook Pro (Spotify)',
    latencyMs: 4,
    isFlagged: false,
  },
  {
    ipAddress: '192.168.1.15',
    macAddress: 'B8:27:EB:12:34:15',
    hostname: 'iPhone 15',
    packetName: 'iPhone 15 (Web Surfing)',
    latencyMs: 18,
    isFlagged: false,
  },
  {
    ipAddress: '192.168.1.22',
    macAddress: 'DC:A6:32:12:34:22',
    hostname: 'Smart TV',
    packetName: 'Smart TV (Stream)',
    latencyMs: 11,
    isFlagged: false,
  },
  {
    ipAddress: '192.168.1.8',
    macAddress: '3C:22:FB:12:34:08',
    hostname: 'iPad',
    packetName: 'iPad (Browsing)',
    latencyMs: 9,
    isFlagged: false,
  },
  {
    ipAddress: '192.168.1.35',
    macAddress: 'F0:18:98:12:34:35',
    hostname: 'Spotify Desktop',
    packetName: 'Spotify Desktop',
    latencyMs: 6,
    isFlagged: true,
  },
  {
    ipAddress: '192.168.1.12',
    macAddress: '70:3A:CB:12:34:12',
    hostname: 'Workstation',
    packetName: 'Workstation (Development)',
    latencyMs: 8,
    isFlagged: false,
  },
  {
    ipAddress: '192.168.1.18',
    macAddress: '9C:8E:CD:12:34:18',
    hostname: 'Game Console',
    packetName: 'Game Console (Online Gaming)',
    latencyMs: 15,
    isFlagged: false,
  },
  {
    ipAddress: '192.168.1.27',
    macAddress: 'D8:3A:DD:12:34:27',
    hostname: 'Network Printer',
    packetName: 'Network Printer (Print Queue)',
    latencyMs: 12,
    isFlagged: false,
  },
  {
    ipAddress: '192.168.1.42',
    macAddress: 'E4:5F:01:12:34:42',
    hostname: 'Security Camera',
    packetName: 'Security Camera (Live Feed)',
    latencyMs: 21,
    isFlagged: false,
  },
] as const;

const SIMULATED_PROTOCOLS = ['TCP', 'HTTPS', 'HTTP', 'DNS'] as const;
const SIMULATED_DESTINATIONS = [
  '142.250.190.46',
  '142.250.191.14',
  '151.101.1.69',
  '104.18.32.47',
] as const;
const INITIAL_PACKET_COUNT = 400;

function choose<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function createPacket(deviceIndex: number, timestamp: number, id: number): Packet {
  const device = SIMULATED_DEVICES[deviceIndex];
  const sizeBytes = Math.floor(Math.random() * 1200 + 300);
  return {
    id,
    source: device.ipAddress,
    destination: choose(SIMULATED_DESTINATIONS),
    protocol: choose(SIMULATED_PROTOCOLS),
    size: `${sizeBytes.toLocaleString()} B`,
    sizeBytes,
    name: device.packetName,
    timestamp,
    time: new Date(timestamp).toLocaleTimeString('en-US', { timeZoneName: 'short' }),
  };
}

/** Creates the initial packet table data, guaranteeing at least one packet per simulated host. */
export function createInitialSimulatedPackets(): Packet[] {
  const now = Date.now();
  return Array.from({ length: INITIAL_PACKET_COUNT }, (_, index) => {
    const timestamp = now - Math.floor(Math.random() * 120_000);
    const deviceIndex = index < SIMULATED_DEVICES.length
      ? index
      : Math.floor(Math.random() * SIMULATED_DEVICES.length);
    return createPacket(deviceIndex, timestamp, timestamp + index);
  });
}

/** Creates one live capture batch using only the shared simulated host profiles. */
export function createSimulatedPacketBatch(count = 8): Packet[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => (
    createPacket(Math.floor(Math.random() * SIMULATED_DEVICES.length), now, now + index + Math.random())
  ));
}
