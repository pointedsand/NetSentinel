/** Shared alert records and rule types used by Alerts, Logs, and Dashboard. */
export type AlertSeverity = 'Critical' | 'High' | 'Medium' | 'Info';
export type AlertType =
  | 'Bandwidth Exceeded'
  | 'High Latency'
  | 'New Device Connected'
  | 'Malicious Traffic'
  | 'System Scan Complete'
  | 'DHCP Range Low';
export type AlertFilter = 'all' | 'unacknowledged' | 'acknowledged' | 'high' | 'new-device';

export interface AlertItem {
  id: string;
  ipAddress: string;
  alertType: AlertType;
  protocol: string;
  severity: AlertSeverity;
  deviceName: string;
  timestamp: number;
  details: string;
  acknowledged: boolean;
  acknowledgedAt?: number;
}

export interface AlertRules {
  bandwidthThresholdMbps: number;
  latencyThresholdMs: number;
  newDeviceAlertsEnabled: boolean;
  mutedTypes: AlertType[];
}

export const DEFAULT_ALERT_RULES: AlertRules = {
  bandwidthThresholdMbps: 50,
  latencyThresholdMs: 150,
  newDeviceAlertsEnabled: true,
  mutedTypes: [],
};

/** Device lookup metadata for alert details; includes a simulated unknown host. */
export const DEVICE_DETAILS: Record<string, { name: string; mac: string; status: string }> = {
  ...Object.fromEntries(SIMULATED_DEVICES.map((device) => [
    device.ipAddress,
    { name: device.hostname, mac: device.macAddress, status: 'Online' },
  ])),
  '192.168.1.100': { name: 'Unknown Host', mac: '02:5A:91:7C:40:64', status: 'Online' },
};

export const DEVICE_LATENCIES: Record<string, number> = {
  '192.168.1.10': 42,
  '192.168.1.15': 178,
  '192.168.1.22': 61,
  '192.168.1.8': 34,
  '192.168.1.35': 52,
  '192.168.1.12': 48,
  '192.168.1.18': 72,
  '192.168.1.27': 39,
  '192.168.1.42': 165,
};

export function createSeedAlerts(now = Date.now()): AlertItem[] {
  return [
    { id: 'seed-bandwidth', ipAddress: '192.168.1.10', alertType: 'Bandwidth Exceeded', protocol: 'TCP', severity: 'High', deviceName: 'MacBook Pro', timestamp: now - 60_000, details: 'Traffic reached 120% of the configured bandwidth threshold.', acknowledged: false },
    { id: 'seed-latency', ipAddress: '192.168.1.15', alertType: 'High Latency', protocol: 'ICMP', severity: 'Medium', deviceName: 'iPhone 15', timestamp: now - 120_000, details: 'Gateway response latency exceeded 150 ms.', acknowledged: false },
    { id: 'seed-new-device', ipAddress: '192.168.1.22', alertType: 'New Device Connected', protocol: '—', severity: 'High', deviceName: 'Smart TV', timestamp: now - 180_000, details: 'Device first-time connection detected on the local subnet.', acknowledged: false },
    { id: 'seed-malicious', ipAddress: '192.168.1.100', alertType: 'Malicious Traffic', protocol: 'HTTP', severity: 'Critical', deviceName: 'Unknown Host', timestamp: now - 240_000, details: 'Simulated suspicious traffic signature detected.', acknowledged: false },
    { id: 'seed-scan', ipAddress: '(No device)', alertType: 'System Scan Complete', protocol: '—', severity: 'Info', deviceName: '(None)', timestamp: now - 300_000, details: 'The most recent simulated subnet scan completed.', acknowledged: true, acknowledgedAt: now - 290_000 },
  ];
}

export const getAlertTimestamp = (): number => Date.now();
import { SIMULATED_DEVICES } from '../simulationData';
