import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCapture } from '../hooks/useCapture';
import type { CaptureMessage, RecordData } from '../types';

class TestSocket {
  static OPEN = 1;
  static current: TestSocket;
  readyState = TestSocket.OPEN;
  send = vi.fn();
  close = vi.fn();
  onmessage?: (event: { data: string }) => void;
  constructor() { TestSocket.current = this; }
  deliver(message: CaptureMessage) {
    act(() => this.onmessage?.({ data: JSON.stringify(message) }));
  }
}

const record: RecordData = {
  id: 1, captureSource: 'adapter A', timestampUs: 2000000, sizeBytes: 60,
  source: '2001:db8::1', destination: '2001:db8::2', protocol: 'UDP', destinationPort: 53,
};

const batch = {
  type: 'batch', packetCount: 12, bandwidthMbps: 1, activeConnections: 1, outputDrops: 8,
  retained: 2, evicted: 2, rejected: 0, captureState: 'PAUSED', packets: [],
} satisfies CaptureMessage;

afterEach(() => vi.unstubAllGlobals());

it('keeps only the stored window and filters it without changing cumulative counters', () => {
  vi.stubGlobal('WebSocket', TestSocket);
  const { result } = renderHook(useCapture);
  const socket = TestSocket.current;
  socket.deliver({...batch, packets:[record, {...record, id:2, protocol:'TCP'}], historyCapacity:2});
  socket.deliver({...batch, packets:[{...record, id:3}], historyCapacity:2, packetCount:3, evicted:1, outputDrops:0});
  act(() => result.current.setProtocol('UDP'));
  expect(result.current.visible.map(row => row.id)).toEqual([3]);
  expect(result.current.packets.map(row => row.id)).toEqual([3,2]);
  expect(result.current.stats).toMatchObject({packetCount:3, historyCapacity:2, retained:2, evicted:1, outputDrops:0});
  socket.deliver({...batch, offset:0, historyPage:true, packetCount:0, evicted:0, retained:0, outputDrops:0, historyCapacity:2});
  expect(result.current.visible).toHaveLength(0);
  expect(result.current.packets).toHaveLength(0);
});

it('updates late PTR names on the matching interface and keeps IP addresses and totals when filtering', () => {
  vi.stubGlobal('WebSocket', TestSocket);
  const { result } = renderHook(useCapture);
  const socket = TestSocket.current;
  socket.deliver({ ...batch, packets: [record, { ...record, id: 2, captureSource: 'adapter B' }] });
  act(() => result.current.setQuery('router.test'));
  expect(result.current.visible).toHaveLength(0);
  socket.deliver({ type: 'ptr', source: 'adapter A', ip: record.source, name: 'router.test' });
  expect(result.current.visible).toHaveLength(1);
  expect(result.current.visible[0]).toMatchObject({ id: 1, name: 'PTR: router.test', source: record.source });
  expect(result.current.packets[0].details?.sourceHostname).toBeUndefined();
  expect(result.current.stats).toMatchObject({ packetCount: 12, retained: 2, outputDrops: 8, evicted: 2 });
});

it('keeps stop pending until the worker acknowledges shutdown', () => {
  vi.stubGlobal('WebSocket', TestSocket);
  const { result } = renderHook(useCapture);
  const socket = TestSocket.current;
  socket.deliver({ ...batch, captureState: 'RUNNING' });
  act(() => result.current.capture(false));
  expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'control', command: 'stop_capture' }));
  socket.deliver({ ...batch, captureState: 'RUNNING' });
  expect(result.current.pending).toBe(true);
  socket.deliver(batch);
  expect(result.current.pending).toBe(false);
  expect(result.current.running).toBe(false);
});

it('restores acknowledged pages newest first and applies capacity changes without new traffic',()=>{
  vi.stubGlobal('WebSocket',TestSocket);
  const {result} = renderHook(useCapture);
  const socket = TestSocket.current;
  socket.deliver({...batch,historyPage:true,offset:0,nextOffset:1,packets:[record]});
  expect(result.current.connected).toBe(false);
  socket.deliver({...batch,historyPage:true,offset:1,nextOffset:null,packets:[{...record,id:2}]});
  expect(result.current.connected).toBe(true);
  expect(result.current.visible.map(p=>p.id)).toEqual([2,1]);
  socket.deliver({type:'history_limit',historyCapacity:5000,retained:1,evicted:1});
  expect(result.current.visible.map(p=>p.id)).toEqual([2]);
  expect(result.current.stats).toMatchObject({packetCount:12,outputDrops:8,historyCapacity:5000});
});
