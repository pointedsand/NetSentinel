import test from 'node:test';
import assert from 'node:assert/strict';
import { Hostnames } from './resolver.mjs';

test('deduplication, bounded work, positive and negative expiry, shutdown', async () => {
  const calls = [];
  let finish, cancelled = false, now = 0;
  const resolver = { reverse(ip) {
    calls.push(ip);
    return new Promise(resolve => { finish = resolve; });
  }, cancel() { cancelled = true; } };
  const names = new Hostnames({ resolver, now: () => now, capacity: 1, concurrency: 1, pendingLimit: 2 });
  for (const ip of ['a','a','b','c']) names.get(ip);
  assert.deepEqual(calls, ['a']);
  finish(['host']); await Promise.resolve();
  assert.equal(names.get('a'), 'host');
  assert.deepEqual(calls, ['a','b']);
  finish([]); await Promise.resolve();
  assert.equal(names.cache.size, 1);
  assert.equal(names.get('b'), null);
  assert.equal(calls.length, 2);
  now += 30001; names.get('b'); names.get('d');
  assert.equal(calls.length, 3);
  names.close(); finish(['late']); await Promise.resolve();
  assert.equal(names.cache.size, 0);
  assert.equal(calls.length, 3);
  assert.ok(cancelled);
});
