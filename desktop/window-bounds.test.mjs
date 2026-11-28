import assert from 'node:assert/strict';
import test from 'node:test';
import { initialWindowBounds } from './window-bounds.mjs';

test('centers the default outer window on the chosen monitor', () => {
  assert.deepEqual(initialWindowBounds({ x: -1920, y: 0, width: 1920, height: 1040 }), {
    x: -1600, y: 120, width: 1280, height: 800, minWidth: 1024, minHeight: 650
  });
});

test('fits a 1366 by 768 laptop with 48 pixels reserved for the taskbar', () => {
  assert.deepEqual(initialWindowBounds({ x: 0, y: 48, width: 1366, height: 720 }), {
    x: 43, y: 48, width: 1280, height: 720, minWidth: 1024, minHeight: 650
  });
});

test('keeps the title bar accessible when the work area is smaller than the hard minimum', () => {
  assert.deepEqual(initialWindowBounds({ x: 32, y: 0, width: 990, height: 600 }), {
    x: 32, y: 0, width: 1024, height: 650, minWidth: 1024, minHeight: 650
  });
});
