export interface TouchPoint { identifier: number; pageX: number; pageY: number }
export interface MapTouchEvent { touches: TouchPoint[]; changedTouches: TouchPoint[] }

// WXS owns pan, pinch and floor swipes. JS only decides whether to open a preview.
export function createMapGesture() {
  let start: TouchPoint | undefined;
  let startedAt = 0;
  let maxDistance = 0;
  let multiple = false;
  return {
    start(event: MapTouchEvent, now: number) {
      if (start) { multiple = true; return; }
      start = event.touches[0];
      startedAt = now;
      maxDistance = 0;
      multiple = event.touches.length !== 1;
    },
    move(event: MapTouchEvent) {
      if (event.touches.length > 1) multiple = true;
      const point = event.touches.find(t => t.identifier === start?.identifier);
      if (start && point) maxDistance = Math.max(maxDistance, Math.hypot(point.pageX - start.pageX, point.pageY - start.pageY));
    },
    scaled() { multiple = true; },
    cancel() { start = undefined; },
    end(event: MapTouchEvent, now: number): "tap" | undefined {
      if (event.touches.length) { multiple = true; return; }
      const origin = start;
      start = undefined;
      const point = event.changedTouches.find(t => t.identifier === origin?.identifier);
      if (!origin || !point || multiple) return;
      const dx = point.pageX - origin.pageX;
      const dy = point.pageY - origin.pageY;
      maxDistance = Math.max(maxDistance, Math.hypot(dx, dy));
      const duration = now - startedAt;
      if (maxDistance <= 10 && duration <= 350) return "tap";
    },
  };
}

export function adjacentFloor<T>(floors: readonly T[], current: T, step: number): T | undefined {
  const index = floors.indexOf(current);
  return index < 0 ? undefined : floors[index + step];
}
