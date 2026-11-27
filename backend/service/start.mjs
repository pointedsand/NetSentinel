import { serve } from './server.mjs';

const [executable, mode, ...sources] = process.argv.slice(2);
const source = sources[0];
const service = serve({ executable, mode, source, sources, dns: process.env.NETSENTINEL_DNS === '1',
                        origin: process.env.NETSENTINEL_ORIGIN || 'http://localhost:5173' });
process.once('SIGINT', () => service.close());
process.once('SIGTERM', () => service.close());
