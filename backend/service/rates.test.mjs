import test from 'node:test';
import assert from 'node:assert/strict';
import { PacketHistory } from './history.mjs';
test('rolling throughput reacts to bursts and idle time, totals survive restart', () => {
  const history = new PacketHistory();
  const sample = (seconds,bytes) => history.append({...history.stats, packets:[], bytes,wireBytes:bytes,elapsedSeconds:seconds},'a');
  assert.equal(sample(1,125000).rollingMbps,1);
  sample(3,125000); sample(4,125000);
  assert.equal(sample(6,125000).rollingMbps,0);
  history.begin();
  const last=sample(1,250000);
  assert.equal(last.rollingMbps,2);
  assert.equal(last.bytes,375000);
  assert.equal(last.bandwidthMbps,375000*8e-6/7);
});
