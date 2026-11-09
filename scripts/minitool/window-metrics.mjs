const finite = value => typeof value === 'number' && Number.isFinite(value);
const bounded = (value, maximum) => finite(value) ? Math.max(0, Math.min(maximum, value)) : 0;

// All values are container-relative logical pixels, never screen coordinates.
export function windowMetrics(info, viewport, fallback = {}) {
  const width = viewport.width, height = viewport.height;
  const safe = info?.safeArea;
  const safeTop = safe ? bounded(safe.top, height) : bounded(fallback.top, height);
  const safeBottom = safe && finite(safe.bottom) ? bounded(height - safe.bottom, height) : bounded(fallback.bottom, height);
  const safeLeft = safe ? bounded(safe.left, width) : bounded(fallback.left, width);
  const safeRight = safe && finite(safe.right) ? bounded(width - safe.right, width) : bounded(fallback.right, width);
  const menu = info?.menuButtons;
  const buttons = Object.values(menu || {}).filter(rect => rect &&
    ['left','top','right','bottom','width','height'].every(key => finite(rect[key])) &&
    rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom > rect.top && rect.top < height / 2);
  // Known buttons end the reserve exactly; explicit nulls mean the row is hidden.
  // Missing window info must still reserve a navigation row below the status bar.
  const buttonsHidden = menu && ['back', 'me', 'share'].every(key => menu[key] === null);
  const top = buttons.length ? Math.max(safeTop, ...buttons.map(rect => rect.bottom)) : safeTop + (buttonsHidden ? 0 : 44);
  const left = Math.max(safeLeft, ...buttons.filter(rect => (rect.left + rect.right) / 2 < width / 2).map(rect => rect.right + 12));
  const right = Math.max(safeRight, ...buttons.filter(rect => (rect.left + rect.right) / 2 >= width / 2).map(rect => width - rect.left + 12));
  const side = Math.max(left, right);
  const logoFits = buttons.length && width - 2 * side - 20 >= 192;
  return {
    top: Math.min(height - safeBottom, top), bottom: safeBottom, left: safeLeft, right: safeRight,
    logoTop: logoFits ? Math.max(safeTop, Math.min(...buttons.map(rect => rect.top)) - 4) : top,
    logoSide: logoFits ? side : 0,
  };
}
