import { useEffect, useState } from 'react';
import type { Packet } from '../types';
import { createInitialSimulatedPackets, createSimulatedPacketBatch } from '../simulationData';

/**
 * Provides the in-memory packet stream shared by the monitoring pages.
 * Generated batches are prepended so the newest simulated packets appear first.
 */
export function usePacketSimulation() {
  const [isCapturing, setIsCapturing] = useState(true);
  const [packets, setPackets] = useState<Packet[]>(createInitialSimulatedPackets);

  useEffect(() => {
    if (!isCapturing) return;

    // Keep the mock capture clock independent of page rendering and stop it on pause/unmount.
    const interval = setInterval(() => {
      setPackets((previousPackets) => [...createSimulatedPacketBatch(), ...previousPackets]);
    }, 1000);

    return () => clearInterval(interval);
  }, [isCapturing]);

  return { packets, setPackets, isCapturing, setIsCapturing };
}
