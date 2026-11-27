// Describes the startup settings that can be edited from the monitoring configuration page.
export interface StartupConfig {
  defaultInterface: string;
  bandwidthAlertThresholdMbps: number;
  autoCompressLogs: boolean;
  logRetentionDays: number;
}

// Safe fallback values are used when supplied configuration JSON is malformed.
export const SAFE_DEFAULT_CONFIG: StartupConfig = {
  defaultInterface: 'eth0',
  bandwidthAlertThresholdMbps: 50,
  autoCompressLogs: true,
  logRetentionDays: 14,
};

/**
 * Validates supplied JSON and returns parsed settings or a safe fallback with a status message.
 * When omitted, rawJson produces the sample startup configuration used by the demo.
 */
export function parseStartupConfig(rawJson?: string): { config: StartupConfig; banner: string; isError: boolean } {
  if (!rawJson) {
    return {
      config: { defaultInterface: 'eth0', bandwidthAlertThresholdMbps: 100, autoCompressLogs: true, logRetentionDays: 7 },
      banner: 'Configuration loaded from config.json',
      isError: false,
    };
  }

  try {
    const parsed = JSON.parse(rawJson);
    if (
      typeof parsed.defaultInterface !== 'string' ||
      parsed.defaultInterface.trim() === '' ||
      typeof parsed.bandwidthAlertThresholdMbps !== 'number' ||
      parsed.bandwidthAlertThresholdMbps <= 0 ||
      typeof parsed.logRetentionDays !== 'number' ||
      parsed.logRetentionDays <= 0
    ) {
      throw new Error('Boundary validation failed');
    }

    return {
      config: {
        defaultInterface: parsed.defaultInterface,
        bandwidthAlertThresholdMbps: parsed.bandwidthAlertThresholdMbps,
        autoCompressLogs: Boolean(parsed.autoCompressLogs),
        logRetentionDays: parsed.logRetentionDays,
      },
      banner: 'Configuration loaded from config.json',
      isError: false,
    };
  } catch {
    return {
      config: SAFE_DEFAULT_CONFIG,
      banner: 'Invalid configuration file detected. Loaded default system parameters.',
      isError: true,
    };
  }
}
