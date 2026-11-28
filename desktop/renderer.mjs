import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

export const origin = 'netsentinel://desktop';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.svg': 'image/svg+xml' };

export async function renderer(root, port) {
  const assets = await readdir(join(root, 'assets'));
  const files = new Set(['/favicon.svg', '/icons.svg', ...assets.map(file => '/assets/' + file)]);
  const index = (await readFile(join(root, 'index.html'), 'utf8'))
    .replace('<head>', '<head><meta name="bridge-port" content="' + port + '">');
  const policy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; " +
    'connect-src ws://127.0.0.1:' + port;
  return async request => {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.host !== 'desktop' || url.username || url.password)
      return new Response(null, { status: 403 });
    const home = url.pathname === '/';
    if (!home && !files.has(url.pathname)) return new Response(null, { status: 404 });
    return new Response(home ? index : await readFile(join(root, url.pathname.slice(1))), {
      headers: { 'Content-Type': home ? types['.html'] : types[extname(url.pathname)],
        'Content-Security-Policy': policy, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }
    });
  };
}
