/** A packet record in the browser-side simulation and packet table. */
export interface Packet {
  id: number;
  source: string;
  destination: string;
  protocol: string;
  size: string;
  sizeBytes: number;
  name: string;
  timestamp: number;
  time: string;
}
