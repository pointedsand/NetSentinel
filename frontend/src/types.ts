/** A packet record in the browser-side simulation and packet table. */
export interface Packet {
  details?: RecordData;
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

export interface RecordData {
  id: number;
  captureSource: string;
  networkScope?: string;
  vlanIds?: number[];
  timestampUs: number;
  sizeBytes: number;
  source: string;
  destination: string;
  protocol: string;
  network?: string;
  transport?: string;
  sourcePort?: number | null;
  destinationPort?: number | null;
  sourceMac?: string;
  destinationMac?: string;
  sourceHostname?: string | null;
  destinationHostname?: string | null;
  sni?: string;
  flowSni?: string;
  dnsQuestion?: string;
  application?: string;
  observedDns?: { name: string };
}

export type CaptureMode = '--interface' | '--replay';

export interface CaptureStats {
  packetCount: number;
  bandwidthMbps: number;
  rollingMbps?: number;
  activeConnections: number;
  outputDrops: number;
  retained: number;
  historyCapacity?: number;
  evicted: number;
  rejected: number;
}

export interface LocalDevice {
  scope: string; interfaceName?: string; nameExpired?: boolean; nameMethod?: string; nameObserved?: number; nameExpires?: number;
  id: string; source: string; mac: string; ips: string[]; label: string; trusted: boolean;
  hostname: string; discovery?: string; first: number; last: number; evidence: string;
}
export interface MonitoringRules { discovery: 'unknown' | 'all' | 'off'; arp: boolean; gateway: boolean; spike: boolean; pps: number }
export interface SecurityEvent {
  id: string; time: number; type: string; severity: string; ip: string; mac: string; source: string;
  measurement?: { from: number; thresholdPps: number };
  scope?: string; deviceName?: string; interfaceName?: string;
  origin: 'Live' | 'Replay'; evidence: string; acknowledged: boolean;
}
export interface MonitorView {
  matchingTotal: number; trustedTotal: number; interfaceNames: Record<string,string>; focused?: LocalDevice;
  eventMatches: number; unacknowledged: number; severityCounts: Record<string,number>; eventTypes: string[];
  events: SecurityEvent[]; rules: MonitoringRules; eventOffset: number; eventTotal: number; suppressed: number; missed: number;

  type: 'monitor'; status: string; storageError: string; deviceTotal: number;
  devices: LocalDevice[]; offset: number; capacityReached: boolean;
}

export type CaptureMessage =
  | MonitorView
  | { type: 'sources'; mode: CaptureMode; sources: string[]; sourceLabels?: string[]; selected: number; activeDns?: boolean; historyOptions?: {limit:number;label:string}[] }
  | { type:'history_limit'; historyCapacity:number; retained:number; evicted:number }
  | { type: 'ptr'; source: string; ip: string; name: string }
  | { type: 'dns_setting'; enabled: boolean }
  | { type: 'error'; message: string }
  | (CaptureStats & {
      type: 'batch';
      captureState: 'RUNNING' | 'PAUSED';
      packets: RecordData[];
      failed?: boolean;
      failureMessage?: string;
      historyPage?: boolean;
      offset?: number;
      nextOffset?: number | null;
    });
