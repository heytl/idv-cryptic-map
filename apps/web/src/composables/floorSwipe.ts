// Only the distance left after panning reaches an edge belongs to floor switching.
export function createFloorSwipe() {
  let startX = 0;
  let startY = 0;
  let originPan = 0;
  let axis = '';
  let multiple = false;
  let edge = 0;
  let available = false;
  return {
    start(x: number, y: number, panX: number) {
      startX = x; startY = y; originPan = panX;
      axis = ''; multiple = false; edge = 0; available = false;
    },
    multiple() { multiple = true; edge = 0; },
    move(x: number, y: number, panX: number, width: number, previous: boolean, next: boolean) {
      const dx = x - startX;
      const dy = y - startY;
      if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8)
        axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
      edge = axis === 'x' && !multiple ? dx - (panX - originPan) : 0;
      available = edge < 0 ? next : previous;
      return available ? Math.max(-width, Math.min(width, edge))
        : edge * 0.25 / (1 + Math.abs(edge) / Math.max(1, width));
    },
    end(width: number) {
      const step = available && !multiple && Math.abs(edge) >= Math.max(48, Math.min(96, width * 0.18))
        ? (edge < 0 ? 1 : -1) : 0;
      edge = 0;
      return step;
    },
  };
}
