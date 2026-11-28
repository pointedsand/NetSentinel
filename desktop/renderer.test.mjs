import assert from 'node:assert/strict';
import test from 'node:test';
import { renderer } from './renderer.mjs';
import { resolve } from 'node:path';

test('desktop protocol serves built assets with a restrictive policy and a loopback bridge port', async () => {
  const handle = await renderer(resolve('frontend/dist'), 54321);
  const page = await handle(new Request('netsentinel://desktop/'));
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /connect-src ws:\/\/127\.0\.0\.1:54321$/);
  const html = await page.text();
  assert.match(html, /name="bridge-port" content="54321"/);
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)[1];
  const asset = await handle(new Request('netsentinel://desktop' + script));
  assert.equal(asset.headers.get('content-type'), 'application/javascript');
  assert.ok((await asset.arrayBuffer()).byteLength > 0);
  for (const pathname of ['/package.json', '/assets/../desktop/main.mjs', '/assets/%2e%2e%2fpackage.json']) {
    assert.equal((await handle(new Request('netsentinel://desktop' + pathname))).status, 404);
  }
  assert.equal((await handle(new Request('netsentinel://elsewhere/'))).status, 403);
  assert.equal((await handle(new Request('netsentinel://desktop/', { method: 'POST' }))).status, 403);
});
