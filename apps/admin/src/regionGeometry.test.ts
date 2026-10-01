import { describe, expect, it } from 'vitest';
import { adjustRect, imagePoint, normalizeRect, PointerGate, type Handle } from './regionGeometry';
const rect = { x: 100, y: 200, width: 300, height: 400 };
describe('region editor geometry', () => {
  it('maps screen points back to original pixels after zoom and pan', () => {
    expect(imagePoint({ x: 150, y: 450 }, { x: -50, y: 50, scale: 2 })).toEqual({ x: 100, y: 200 });
  });
  it('moves without changing dimensions and clamps against the original image', () => {
    expect(adjustRect(rect, 'move', -200, 1000, 1000, 1000)).toEqual({ x: 0, y: 600, width: 300, height: 400 });
  });
  it.each(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as Handle[])('constrains %s without flipping', handle => {
    for (const d of [-2000, 2000]) {
      const r = adjustRect(rect, handle, d, d, 1000, 1000);
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.width).toBeGreaterThanOrEqual(1); expect(r.height).toBeGreaterThanOrEqual(1);
      expect(r.x + r.width).toBeLessThanOrEqual(1000); expect(r.y + r.height).toBeLessThanOrEqual(1000);
    }
  });
  it.each(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as Handle[])('keeps square while resizing %s at image edges', handle => {
    const r = adjustRect({ x: 50, y: 100, width: 100, height: 100 }, handle, 900, -900, 500, 600, true);
    expect(r.width).toBe(r.height); expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(500); expect(r.y + r.height).toBeLessThanOrEqual(600);
  });
  it('rounds to valid pixel rectangles, including one-pixel images', () => {
    expect(normalizeRect({ x: 0.7, y: -1, width: 10.7, height: 0.4 }, 1, 1)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
  it('blocks editing until all fingers lift after pinch, including third pointers/cancellation', () => {
    const gate = new PointerGate(); gate.down(1); expect(gate.canEdit).toBe(true);
    gate.down(2); gate.down(3); expect(gate.canEdit).toBe(false);
    gate.up(2); gate.up(3); expect(gate.canEdit).toBe(false);
    gate.up(1); gate.down(4); expect(gate.canEdit).toBe(true);
    gate.clear(); expect(gate.count).toBe(0);
  });
});
