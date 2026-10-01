import type { PixelRect } from '@idv-map/shared';
export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
export interface Point { x: number; y: number }
export interface Camera extends Point { scale: number }
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export function imagePoint(p: Point, camera: Camera): Point {
  return { x: (p.x - camera.x) / camera.scale, y: (p.y - camera.y) / camera.scale };
}
export function normalizeRect(r: PixelRect, width: number, height: number): PixelRect {
  const x = clamp(Math.round(r.x), 0, width - 1), y = clamp(Math.round(r.y), 0, height - 1);
  return { x, y, width: clamp(Math.round(r.width), 1, width - x), height: clamp(Math.round(r.height), 1, height - y) };
}
export function adjustRect(r: PixelRect, handle: Handle, dx: number, dy: number, width: number, height: number, square = false): PixelRect {
  if (handle === 'move') return { ...r, x: clamp(r.x + dx, 0, width - r.width), y: clamp(r.y + dy, 0, height - r.height) };
  let left = r.x, top = r.y, right = r.x + r.width, bottom = r.y + r.height;
  if (handle.includes('w')) left = clamp(left + dx, 0, right - 1);
  if (handle.includes('e')) right = clamp(right + dx, left + 1, width);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - 1);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + 1, height);
  if (square) {
    const horizontal = handle.includes('e') || handle.includes('w');
    let size = horizontal ? right - left : bottom - top;
    const ax = handle.includes('w') ? r.x + r.width : r.x;
    const ay = handle.includes('n') ? r.y + r.height : r.y;
    size = clamp(size, 1, Math.min(handle.includes('w') ? ax : width - ax, handle.includes('n') ? ay : height - ay));
    left = handle.includes('w') ? ax - size : ax;
    top = handle.includes('n') ? ay - size : ay;
    return { x: left, y: top, width: size, height: size };
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
/** After a pinch, remaining fingers cannot start another box edit until all lift. */
export class PointerGate {
  private pointers = new Set<number>();
  private blocked = false;
  down(id: number) { this.pointers.add(id); if (this.pointers.size > 1) this.blocked = true; }
  up(id: number) { this.pointers.delete(id); if (!this.pointers.size) this.blocked = false; }
  get canEdit() { return this.pointers.size === 1 && !this.blocked; }
  get count() { return this.pointers.size; }
  clear() { this.pointers.clear(); this.blocked = false; }
}
