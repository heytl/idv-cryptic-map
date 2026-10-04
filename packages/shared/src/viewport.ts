export interface Size { width: number; height: number }
export type QuarterTurn = 0 | 90 | 180 | 270;

export function rotatedSize(size: Size, rotation: QuarterTurn): Size {
  return rotation % 180 === 0 ? { ...size } : { width: size.height, height: size.width };
}

export function fitScale(content: Size, viewport: Size, rotation: QuarterTurn = 0): number {
  const effective = rotatedSize(content, rotation);
  if (![effective.width, effective.height, viewport.width, viewport.height].every(n => Number.isFinite(n) && n > 0)) return 0;
  return Math.min(viewport.width / effective.width, viewport.height / effective.height);
}

/** Translate before rotating around top-left so every quarter turn stays in a positive bounding box. */
export function rotationOffset(size: Size, rotation: QuarterTurn): { x: number; y: number } {
  switch (rotation) {
    case 90: return { x: size.height, y: 0 };
    case 180: return { x: size.width, y: size.height };
    case 270: return { x: 0, y: size.width };
    default: return { x: 0, y: 0 };
  }
}

export function clampPosition(position: number, contentExtent: number, viewportExtent: number): number {
  return contentExtent <= viewportExtent ? (viewportExtent - contentExtent) / 2
    : Math.min(0, Math.max(viewportExtent - contentExtent, position));
}
