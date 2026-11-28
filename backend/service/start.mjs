import { Monitor } from './monitor.mjs';
import { defaultStateFile, openHistoryPreferences, openStore } from './monitor-store.mjs';
import { serve } from './server.mjs';

const [executable, mode, ...sources] = process.argv.slice(2);
const source = sources[0];
const monitor = new Monitor({ store: await openStore(mode === '--interface' ? process.env.NETSENTINEL_STATE_FILE || defaultStateFile() : null) });
const service = serve({ preferences:await openHistoryPreferences(process.env.NETSENTINEL_STATE_FILE || defaultStateFile()), monitor, executable, mode, source, sources, dns: process.env.NETSENTINEL_DNS === '1',
                        origin: process.env.NETSENTINEL_ORIGIN || 'http://localhost:5173' });
process.once('SIGINT', () => service.close());
process.once('SIGTERM', () => service.close());
