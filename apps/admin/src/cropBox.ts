// 裁剪框拖拽核心：框体移动 / 右下角手柄缩放的 Pointer 逻辑
// （鼠标与触屏通用，配合 CSS touch-action:none），供整体工作台与单图二次裁剪复用
import type { Rect } from './imageTools';

export interface BoxDragCtx<K extends string> {
  boxes: Record<K, Rect>;
  natural: () => { w: number; h: number };
  /** 显示坐标 = 自然坐标 × scale */
  scale: () => number;
  /** 返回 true 时该框缩放保持 1:1 */
  lockSquare?: (key: K) => boolean;
}

const MIN_SIZE = 40;

export function createBoxDrag<K extends string>(ctx: BoxDragCtx<K>) {
  let drag: { key: K; mode: 'move' | 'resize'; startX: number; startY: number; orig: Rect } | null = null;

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const { w: nw, h: nh } = ctx.natural();
    const s = ctx.scale();
    const dx = (e.clientX - drag.startX) / s;
    const dy = (e.clientY - drag.startY) / s;
    const b = ctx.boxes[drag.key];
    const o = drag.orig;
    const locked = ctx.lockSquare?.(drag.key) ?? false;
    if (drag.mode === 'move') {
      b.x = clamp(o.x + dx, 0, nw - b.w);
      b.y = clamp(o.y + dy, 0, nh - b.h);
    } else {
      b.w = clamp(o.w + dx, MIN_SIZE, nw - b.x);
      b.h = locked ? b.w : clamp(o.h + dy, MIN_SIZE, nh - b.y);
      if (b.y + b.h > nh) b.h = nh - b.y;
      if (locked) b.w = b.h; // 高度被钳制时保持方形
    }
  }

  function onPointerUp() {
    drag = null;
    window.removeEventListener('pointermove', onPointerMove);
  }

  function onPointerDown(e: PointerEvent, key: K, mode: 'move' | 'resize') {
    e.preventDefault();
    e.stopPropagation();
    drag = { key, mode, startX: e.clientX, startY: e.clientY, orig: { ...ctx.boxes[key] } };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  function boxStyle(key: K): Record<string, string> {
    const s = ctx.scale();
    const b = ctx.boxes[key];
    return { left: `${b.x * s}px`, top: `${b.y * s}px`, width: `${b.w * s}px`, height: `${b.h * s}px` };
  }

  return { onPointerDown, boxStyle };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}
