import { describe, expect, it } from 'vitest';
import {
  createInitialSimulatedPackets,
  createSimulatedPacketBatch,
  SIMULATED_DEVICES,
} from '../simulationData';

describe('shared simulated packet data', () => {
  it('creates initial packets for every simulated host using its shared profile', () => {
    const packets = createInitialSimulatedPackets();
    const devicesByIp = new Map<string, (typeof SIMULATED_DEVICES)[number]>(
      SIMULATED_DEVICES.map((device) => [device.ipAddress, device])
    );

    expect(packets).toHaveLength(400);
    for (const packet of packets) {
      const device = devicesByIp.get(packet.source);
      expect(device).toBeDefined();
      expect(packet.name).toBe(device?.packetName);
    }

    expect(new Set(packets.slice(0, SIMULATED_DEVICES.length).map((packet) => packet.source)))
      .toEqual(new Set(SIMULATED_DEVICES.map((device) => device.ipAddress)));
  });

  it('creates live packet batches only from shared simulated hosts', () => {
    const deviceIps = new Set<string>(SIMULATED_DEVICES.map((device) => device.ipAddress));
    const packets = createSimulatedPacketBatch(20);

    expect(packets).toHaveLength(20);
    expect(packets.every((packet) => deviceIps.has(packet.source))).toBe(true);
    expect(packets.every((packet) => SIMULATED_DEVICES.some(
      (device) => device.ipAddress === packet.source && device.packetName === packet.name
    ))).toBe(true);
  });
});
