// ==========================================================================
// 地图拖拽缩放平移交互（自旧站 script.js 平移，行为保持一致）：
// 滚轮以指针为锚缩放、左键拖拽、双指捏合（中点锚定 + 抬指接续单指拖）、
// clampScale/clampPosition 边界钳制、fitScale 自适应铺满
// ==========================================================================
import { onBeforeUnmount, onMounted, reactive, type Ref } from 'vue';

// 缩放配置：最小/最大缩放均为相对“自适应铺满比例(fitScale)”的倍数
export const ZOOM_CONFIG = {
  minScaleRatio: 0.8,
  maxScaleRatio: 4,
  wheelZoomFactor: 1.1, // 滚轮每格缩放倍率
  buttonZoomFactor: 1.3, // 工具栏 +/- 按钮每次缩放倍率
};

interface Refs {
  viewport: Ref<HTMLElement | null>;
  wrapper: Ref<HTMLElement | null>;
  img: Ref<HTMLImageElement | null>;
}

export function useZoomPan({ viewport, wrapper, img }: Refs) {
  const state = reactive({
    scale: 1,
    x: 0,
    y: 0,
    fitScale: 1, // 当前图片在视口内自适应铺满的基准比例
  });

  // 当前地图图片的自然尺寸 (带兜底值)
  function getMapSize() {
    return {
      width: img.value?.naturalWidth || 900,
      height: img.value?.naturalHeight || 750,
    };
  }

  // 将缩放比例约束在 [fitScale * min, fitScale * max] 区间内
  function clampScale(scale: number) {
    const min = state.fitScale * ZOOM_CONFIG.minScaleRatio;
    const max = state.fitScale * ZOOM_CONFIG.maxScaleRatio;
    return Math.min(Math.max(scale, min), max);
  }

  // 将平移位置约束在地图边界内：
  // 某轴上缩放后的地图小于视口时居中，大于视口时不允许边缘拖进视口内
  function clampPosition() {
    const vp = viewport.value;
    if (!vp) return;
    const viewW = vp.clientWidth;
    const viewH = vp.clientHeight;
    const { width, height } = getMapSize();
    const scaledW = width * state.scale;
    const scaledH = height * state.scale;

    if (scaledW <= viewW) {
      state.x = (viewW - scaledW) / 2;
    } else {
      state.x = Math.min(Math.max(state.x, viewW - scaledW), 0);
    }

    if (scaledH <= viewH) {
      state.y = (viewH - scaledH) / 2;
    } else {
      state.y = Math.min(Math.max(state.y, viewH - scaledH), 0);
    }
  }

  // 应用 transform 到 DOM (统一在此处做边界约束，任何入口都不会越界)
  function applyTransform() {
    clampPosition();
    if (wrapper.value) {
      wrapper.value.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    }
  }

  // 以视口内某点 (pointX, pointY) 为锚点缩放到 newScale，锚点下的地图内容保持不动
  function zoomAt(pointX: number, pointY: number, newScale: number) {
    newScale = clampScale(newScale);
    const mapX = (pointX - state.x) / state.scale;
    const mapY = (pointY - state.y) / state.scale;
    state.scale = newScale;
    state.x = pointX - mapX * newScale;
    state.y = pointY - mapY * newScale;
    applyTransform();
  }

  // 以视口中心为锚点按倍率缩放（工具栏 +/- 按钮）
  function zoomByFactor(factor: number) {
    const vp = viewport.value;
    if (!vp) return;
    zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, state.scale * factor);
  }

  // 重置平移缩放 (铺满自适应并居中，同时刷新缩放基准比例)
  function reset() {
    const vp = viewport.value;
    if (!vp) return;
    const viewW = vp.clientWidth;
    const viewH = vp.clientHeight;
    const { width: mapW, height: mapH } = getMapSize();

    // 选择最限制的轴向比例作为自适应铺满基准
    state.fitScale = Math.min(viewW / mapW, viewH / mapH);
    state.scale = state.fitScale;

    // 水平与垂直完全居中对齐
    state.x = (viewW - mapW * state.scale) / 2;
    state.y = (viewH - mapH * state.scale) / 2;

    applyTransform();
  }

  // ---- 事件绑定 ----
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let touchStartDist = 0;
  let touchStartScale = 1;
  let pinchMapX = 0; // 捏合起始中点对应的地图坐标
  let pinchMapY = 0;

  function getTouchDistance(touches: TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 双指中点 (相对视口左上角的坐标)
  function getTouchMidpoint(touches: TouchList) {
    const rect = viewport.value!.getBoundingClientRect();
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
    };
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return; // 只有左键拖拽
    isDragging = true;
    startX = e.clientX - state.x;
    startY = e.clientY - state.y;
    viewport.value!.style.cursor = 'grabbing';
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    state.x = e.clientX - startX;
    state.y = e.clientY - startY;
    applyTransform();
  }

  function onMouseUp() {
    if (isDragging) {
      isDragging = false;
      if (viewport.value) viewport.value.style.cursor = 'grab';
    }
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      isDragging = true;
      startX = e.touches[0].clientX - state.x;
      startY = e.touches[0].clientY - state.y;
    } else if (e.touches.length === 2) {
      // 双指缩放
      isDragging = false;
      touchStartDist = getTouchDistance(e.touches);
      touchStartScale = state.scale;
      const mid = getTouchMidpoint(e.touches);
      pinchMapX = (mid.x - state.x) / state.scale;
      pinchMapY = (mid.y - state.y) / state.scale;
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (isDragging && e.touches.length === 1) {
      state.x = e.touches[0].clientX - startX;
      state.y = e.touches[0].clientY - startY;
      applyTransform();
      e.preventDefault();
    } else if (e.touches.length === 2) {
      // 双指捏合缩放：以两指中点为锚点，同时支持双指平移
      const dist = getTouchDistance(e.touches);
      if (dist > 0 && touchStartDist > 0) {
        const mid = getTouchMidpoint(e.touches);
        state.scale = clampScale(touchStartScale * (dist / touchStartDist));
        state.x = mid.x - pinchMapX * state.scale;
        state.y = mid.y - pinchMapY * state.scale;
        applyTransform();
      }
      e.preventDefault();
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (e.touches.length === 1) {
      // 双指抬起一指后无缝转为单指拖拽
      isDragging = true;
      startX = e.touches[0].clientX - state.x;
      startY = e.touches[0].clientY - state.y;
    } else {
      isDragging = false;
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = viewport.value!.getBoundingClientRect();
    const factor = e.deltaY < 0 ? ZOOM_CONFIG.wheelZoomFactor : 1 / ZOOM_CONFIG.wheelZoomFactor;
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, state.scale * factor);
  }

  onMounted(() => {
    const vp = viewport.value;
    if (!vp) return;
    vp.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    vp.addEventListener('touchstart', onTouchStart, { passive: true });
    vp.addEventListener('touchmove', onTouchMove, { passive: false });
    vp.addEventListener('touchend', onTouchEnd);
    vp.addEventListener('wheel', onWheel, { passive: false });
  });

  onBeforeUnmount(() => {
    const vp = viewport.value;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    if (vp) {
      vp.removeEventListener('mousedown', onMouseDown);
      vp.removeEventListener('touchstart', onTouchStart);
      vp.removeEventListener('touchmove', onTouchMove);
      vp.removeEventListener('touchend', onTouchEnd);
      vp.removeEventListener('wheel', onWheel);
    }
  });

  return { state, reset, zoomByFactor };
}
