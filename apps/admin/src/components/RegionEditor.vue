<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { NModal, useDialog } from 'naive-ui';
import type { PixelRect } from '@idv-map/shared';
import { adjustRect, clamp, imagePoint, normalizeRect, PointerGate, type Handle, type Point } from '../regionGeometry';
import RegionPreview from './RegionPreview.vue';

export interface RegionItem { id: string; label: string; rect?: PixelRect; reference?: string }
export interface RegionResult { imageWidth: number; imageHeight: number; regions: Record<string, PixelRect> }
const props = defineProps<{
  source: string; items: RegionItem[]; initialId?: string; title?: string;
  requiredConfirmation?: string[]; busy?: boolean; pendingSource?: boolean; square?: boolean; allowSquare?: boolean;
}>();
const emit = defineEmits<{ done: [result: RegionResult]; cancel: [] }>();
const dialog = useDialog();
const stage = ref<HTMLElement>();
const image = ref<HTMLImageElement>();
const activeId = ref(props.initialId ?? props.items[0]!.id);
const active = computed(() => props.items.find(i => i.id === activeId.value)!);
const natural = reactive({ width: 0, height: 0 });
const camera = reactive({ x: 0, y: 0, scale: 1 });
const boxes = reactive<Record<string, PixelRect>>({});
const confirmed = ref<string[]>([]);
const mode = ref<'edit' | 'pan'>('edit');
const showOthers = ref(false), showDetails = ref(false), showReference = ref(false);
const locked = ref(props.square ?? false);
const edge = ref<Handle>('move');
const step = ref(1);
const error = ref('');
const ready = ref(false);
const space = ref(false);
const lens = ref<Point | null>(null);
const pointerScreen = ref<Point>({ x: 0, y: 0 });
const rect = computed(() => boxes[activeId.value]);
const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const handleNames: Record<string, string> = { nw: '左上角', n: '上边', ne: '右上角', e: '右边', se: '右下角', s: '下边', sw: '左下角', w: '左边' };
type Snapshot = { boxes: Record<string, PixelRect>; confirmed: string[]; locked: boolean };
const history = ref<Snapshot[]>([]), historyIndex = ref(0);
const snapshot = (): Snapshot => ({ boxes: JSON.parse(JSON.stringify(boxes)), confirmed: [...confirmed.value], locked: locked.value });
const initial = ref<Snapshot>();
const dirty = computed(() => props.pendingSource || (initial.value && JSON.stringify(snapshot()) !== JSON.stringify(initial.value)));
const complete = computed(() => ready.value && confirmed.value.length > 0 && !props.items.some(item =>
  !confirmed.value.includes(item.id) && (initial.value?.confirmed.includes(item.id) || JSON.stringify(boxes[item.id]) !== JSON.stringify(initial.value?.boxes[item.id]))
) && (props.requiredConfirmation ?? []).every(id => confirmed.value.includes(id)));
function record() {
  const current = snapshot();
  if (JSON.stringify(current) === JSON.stringify(history.value[historyIndex.value])) return;
  history.value.splice(historyIndex.value + 1);
  history.value.push(current); historyIndex.value = history.value.length - 1;
}
function restore(s: Snapshot) {
  for (const key of Object.keys(boxes)) delete boxes[key];
  Object.assign(boxes, JSON.parse(JSON.stringify(s.boxes))); confirmed.value = [...s.confirmed]; locked.value = s.locked;
}
function undo() { if (historyIndex.value > 0) restore(history.value[--historyIndex.value]!); }
function redo() { if (historyIndex.value < history.value.length - 1) restore(history.value[++historyIndex.value]!); }
function reset() { if (initial.value) { restore(initial.value); record(); fitSelection(); } }
function changed(r: PixelRect) {
  boxes[activeId.value] = r;
  confirmed.value = confirmed.value.filter(id => id !== activeId.value);
}
function confirmCurrent() {
  if (!rect.value || !ready.value) return;
  boxes[activeId.value] = normalizeRect(rect.value, natural.width, natural.height);
  if (!confirmed.value.includes(activeId.value)) confirmed.value.push(activeId.value);
  record();
}
function done() {
  if (!complete.value || props.busy) return;
  const regions = Object.fromEntries(confirmed.value.map(id => [id, normalizeRect(boxes[id]!, natural.width, natural.height)]));
  emit('done', { imageWidth: natural.width, imageHeight: natural.height, regions });
}
function cancel() {
  if (props.busy) return;
  if (!dirty.value) return emit('cancel');
  dialog.warning({ title: '放弃本次修改？', content: '尚未应用的区域调整将丢失，已保存内容不变。', positiveText: '放弃修改', negativeText: '继续编辑', onPositiveClick: () => emit('cancel') });
}
const fitScale = () => Math.min((stage.value!.clientWidth - 48) / natural.width, (stage.value!.clientHeight - 48) / natural.height);
function limitScale(s: number) { const fit = Math.max(0.001, fitScale()); return clamp(s, fit, Math.max(fit * 8, 2)); }
function fit(r: PixelRect) {
  if (!stage.value || !ready.value) return;
  const w = stage.value.clientWidth, h = stage.value.clientHeight;
  camera.scale = limitScale(Math.min((w - 96) / r.width, (h - 96) / r.height));
  camera.x = w / 2 - (r.x + r.width / 2) * camera.scale;
  camera.y = h / 2 - (r.y + r.height / 2) * camera.scale;
}
function fitFull() { fit({ x: 0, y: 0, width: natural.width, height: natural.height }); }
function fitSelection() { if (rect.value) fit(rect.value); }
function zoom(factor: number, p?: Point) {
  if (!ready.value || !stage.value) return;
  const anchor = p ?? { x: stage.value.clientWidth / 2, y: stage.value.clientHeight / 2 };
  const point = imagePoint(anchor, camera);
  camera.scale = limitScale(camera.scale * factor);
  camera.x = anchor.x - point.x * camera.scale; camera.y = anchor.y - point.y * camera.scale;
}
function wheel(e: WheelEvent) { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.002), local(e)); }
async function select(id: string) { endGesture(); activeId.value = id; showReference.value = false; await nextTick(); fitSelection(); }
function loaded() {
  const img = image.value!;
  natural.width = img.naturalWidth; natural.height = img.naturalHeight;
  if (!natural.width || !natural.height) return;
  for (const item of props.items) {
    const size = Math.min(natural.width, natural.height) * 0.8;
    boxes[item.id] = normalizeRect(item.rect ?? (locked.value
      ? { x: (natural.width - size) / 2, y: (natural.height - size) / 2, width: size, height: size }
      : { x: natural.width * 0.1, y: natural.height * 0.1, width: natural.width * 0.8, height: natural.height * 0.8 }), natural.width, natural.height);
  }
  confirmed.value = props.items.filter(i => i.rect && !props.requiredConfirmation?.includes(i.id)).map(i => i.id);
  initial.value = snapshot(); history.value = [snapshot()]; historyIndex.value = 0;
  ready.value = true; error.value = '';
  nextTick(() => active.value.rect ? fitSelection() : fitFull());
}
function toggleSquare() {
  locked.value = !locked.value;
  if (locked.value && rect.value) {
    const r = rect.value, side = Math.min(r.width, r.height);
    changed({ x: r.x, y: r.y, width: side, height: side });
  }
  record();
}
function nudge(dx: number, dy: number, amount = step.value) {
  if (!rect.value || props.busy) return;
  changed(adjustRect(rect.value, edge.value, dx * amount, dy * amount, natural.width, natural.height, locked.value)); record();
}
function numeric(key: keyof PixelRect, event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value) || !rect.value) return;
  let next = normalizeRect({ ...rect.value, [key]: value }, natural.width, natural.height);
  if (locked.value) {
    const size = Math.min(key === 'height' ? next.height : next.width, natural.width - next.x, natural.height - next.y);
    next = { ...next, width: size, height: size };
  }
  changed(next); record();
}
function keydown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || props.busy) return;
  if (e.code === 'Space') { e.preventDefault(); space.value = true; }
  const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (directions[e.key]) { e.preventDefault(); nudge(...directions[e.key]!, e.shiftKey ? 10 : 1); }
}
function local(e: { clientX: number; clientY: number }): Point { const b = stage.value!.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
const points = new Map<number, Point>(), gate = new PointerGate();
let gesture: { kind: Handle | 'pan'; start: Point; rect: PixelRect; x: number; y: number } | undefined;
let pinch: { distance: number; center: Point; image: Point; scale: number } | undefined;
function pair() { const [a, b] = [...points.values()] as [Point, Point]; return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; }
function startPointer(e: PointerEvent) {
  if (!ready.value || props.busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
  stage.value!.focus({ preventScroll: true });
  stage.value!.setPointerCapture(e.pointerId);
  const p = local(e); points.set(e.pointerId, p); gate.down(e.pointerId);
  if (points.size === 2) {
    if (gesture && gesture.kind !== 'pan') record();
    gesture = undefined; lens.value = null;
    const pairState = pair(); pinch = { ...pairState, image: imagePoint(pairState.center, camera), scale: camera.scale }; return;
  }
  if (!gate.canEdit) return;
  const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined;
  gesture = { kind: mode.value === 'pan' || space.value ? 'pan' : handle ?? 'pan', start: p, rect: { ...rect.value! }, x: camera.x, y: camera.y };
}
function movePointer(e: PointerEvent) {
  if (!points.has(e.pointerId)) return;
  const p = local(e); points.set(e.pointerId, p); pointerScreen.value = p;
  if (points.size >= 2 && pinch) {
    const now = pair(); camera.scale = limitScale(pinch.scale * now.distance / pinch.distance);
    camera.x = now.center.x - pinch.image.x * camera.scale; camera.y = now.center.y - pinch.image.y * camera.scale; return;
  }
  if (!gesture || !gate.canEdit) return;
  const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
  if (Math.hypot(dx, dy) < 3) return;
  if (gesture.kind === 'pan') { camera.x = gesture.x + dx; camera.y = gesture.y + dy; return; }
  changed(adjustRect(gesture.rect, gesture.kind, dx / camera.scale, dy / camera.scale, natural.width, natural.height, locked.value));
  lens.value = gesture.kind === 'move' ? null : imagePoint(p, camera);
}
function endPointer(e: PointerEvent) {
  if (gesture && gesture.kind !== 'pan') record();
  points.delete(e.pointerId); gate.up(e.pointerId); gesture = undefined; pinch = undefined; lens.value = null;
  if (stage.value?.hasPointerCapture(e.pointerId)) stage.value.releasePointerCapture(e.pointerId);
}
function endGesture() { if (gesture && gesture.kind !== 'pan') record(); gesture = undefined; pinch = undefined; points.clear(); gate.clear(); lens.value = null; space.value = false; }
function boxStyle(r: PixelRect) { return { left: `${camera.x + r.x * camera.scale}px`, top: `${camera.y + r.y * camera.scale}px`, width: `${r.width * camera.scale}px`, height: `${r.height * camera.scale}px` }; }
function handleStyle(h: Handle) { return { left: h.includes('w') ? '0%' : h.includes('e') ? '100%' : '50%', top: h.includes('n') ? '0%' : h.includes('s') ? '100%' : '50%' }; }
const lensStyle = computed(() => ({ left: pointerScreen.value.x < (stage.value?.clientWidth ?? 0) / 2 ? 'auto' : '12px', right: pointerScreen.value.x < (stage.value?.clientWidth ?? 0) / 2 ? '12px' : 'auto' }));
let observer: ResizeObserver | undefined;
const viewportHeight = ref(0);
function viewportResize() { viewportHeight.value = window.visualViewport?.height ?? window.innerHeight; }
onMounted(() => {
  viewportResize(); window.visualViewport?.addEventListener('resize', viewportResize);
  window.addEventListener('blur', endGesture);
  observer = new ResizeObserver(() => { if (ready.value) fitSelection(); });
  if (stage.value) observer.observe(stage.value);
});
onBeforeUnmount(() => { observer?.disconnect(); window.visualViewport?.removeEventListener('resize', viewportResize); window.removeEventListener('blur', endGesture); endGesture(); });
</script>

<template>
  <n-modal :show="true" :mask-closable="false" :close-on-esc="false" @esc="cancel">
    <section class="region-editor" role="dialog" aria-modal="true" :aria-label="title || '选择楼层区域'" :style="{ '--editor-height': `${viewportHeight || 800}px` }">
      <header class="region-header">
        <button :disabled="busy" @click="cancel">返回</button>
        <label class="region-switch"><span>{{ title || '选择楼层区域' }}</span>
          <select :value="activeId" :disabled="busy || !ready" aria-label="当前编辑区域" @change="select(($event.target as HTMLSelectElement).value)">
            <option v-for="item in items" :key="item.id" :value="item.id">{{ item.label }} · {{ confirmed.includes(item.id) ? '已确认' : '待确认' }}</option>
          </select>
        </label>
        <button class="primary" :disabled="!complete || busy" @click="done">{{ busy ? '正在应用…' : '完成' }}</button>
      </header>
      <div v-if="error" role="alert" class="region-error">{{ error }} <button @click="image!.src = source">重试</button></div>
      <div class="region-body" :inert="busy">
        <div ref="stage" class="region-stage" tabindex="0" aria-label="图片编辑区：方向键微调，空格拖动图片" :class="{ panning: mode === 'pan' || space }"
          @keydown="keydown" @keyup.space="space = false" @blur="space = false" @wheel="wheel"
          @pointerdown.prevent="startPointer" @pointermove="movePointer" @pointerup="endPointer" @pointercancel="endPointer" @lostpointercapture="endPointer">
          <img ref="image" class="region-source" :src="source" alt="待选择区域的全图" draggable="false" @load="loaded" @error="error = '图片加载失败，请重试'"
            :style="{ width: `${natural.width || 1}px`, height: `${natural.height || 1}px`, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }" />
          <template v-if="ready && rect">
            <template v-if="showOthers"><div v-for="item in items.filter(i => i.id !== activeId)" :key="item.id" class="other-region" :style="boxStyle(boxes[item.id]!)">{{ item.label }}</div></template>
            <div class="active-region" data-handle="move" :style="boxStyle(rect)">
              <span class="region-tag">{{ active.label }}</span>
              <button v-for="handle in handles" :key="handle" class="region-handle" :class="`handle-${handle}`" :data-handle="handle" :aria-label="`调整${handleNames[handle]}`" :style="handleStyle(handle)" :disabled="mode === 'pan' || busy" tabindex="-1"><span></span></button>
            </div>
          </template>
          <div v-if="!ready && !error" class="region-loading" role="status">正在加载图片…</div>
          <div v-if="lens" class="region-lens" :style="lensStyle" aria-hidden="true">
            <svg :viewBox="`${lens.x - 24} ${lens.y - 24} 48 48`"><image :href="source" :width="natural.width" :height="natural.height" /><rect v-if="rect" :x="rect.x" :y="rect.y" :width="rect.width" :height="rect.height" fill="none" stroke="#60a5fa" stroke-width="0.5" /></svg><span>＋</span>
          </div>
        </div>
        <aside class="region-details" :class="{ expanded: showDetails }">
          <template v-if="ready && rect">
            <div class="region-preview-wrap"><RegionPreview :src="source" :width="natural.width" :height="natural.height" :rect="rect" label="当前区域预览" /></div>
            <button v-if="active.reference" @click="showReference = !showReference">{{ showReference ? '收起旧楼层图' : '对照旧楼层图' }}</button>
            <img v-if="showReference && active.reference" :src="active.reference" class="region-reference" alt="转换前的楼层图片" />
            <label>调整对象<select v-model="edge"><option value="move">整体</option><option value="n">上边</option><option value="s">下边</option><option value="w">左边</option><option value="e">右边</option></select></label>
            <label>每次调整<select v-model.number="step"><option :value="1">1 像素</option><option :value="10">10 像素</option></select></label>
            <div class="region-nudge"><button aria-label="向左微调" @click="nudge(-1, 0)">←</button><button aria-label="向上微调" @click="nudge(0, -1)">↑</button><button aria-label="向下微调" @click="nudge(0, 1)">↓</button><button aria-label="向右微调" @click="nudge(1, 0)">→</button></div>
            <details><summary>精确坐标（原图像素）</summary><label v-for="field in (['x', 'y', 'width', 'height'] as const)" :key="field">{{ { x: '左侧 X', y: '顶部 Y', width: '宽度', height: '高度' }[field] }}<input type="number" :aria-label="field" :value="Math.round(rect[field])" @change="numeric(field, $event)" /></label></details>
            <button v-if="allowSquare" :aria-pressed="locked" @click="toggleSquare">{{ locked ? '已锁定 1:1' : '自由比例' }}</button>
          </template>
        </aside>
      </div>
      <footer class="region-footer" :inert="busy">
        <div class="region-tools">
          <button :aria-pressed="mode === 'edit'" @click="mode = 'edit'">调整区域</button><button :aria-pressed="mode === 'pan'" @click="mode = 'pan'">移动图片</button>
          <button aria-label="缩小图片" @click="zoom(1 / 1.3)">−</button><button aria-label="放大图片" @click="zoom(1.3)">＋</button>
          <button @click="fitFull">查看全图</button><button @click="fitSelection">放大选区</button>
          <button :disabled="historyIndex === 0 || busy" @click="undo">撤销</button><button :disabled="historyIndex === history.length - 1 || busy" @click="redo">重做</button><button :disabled="!ready || busy" @click="reset">重置</button>
          <button v-if="items.length > 1" :aria-pressed="showOthers" @click="showOthers = !showOthers">显示其他楼层</button>

        </div>
        <div class="region-confirm"><button class="details-toggle" :aria-expanded="showDetails" @click="showDetails = !showDetails">{{ showDetails ? '收起精调' : '精确调整' }}</button><span role="status">{{ ready ? (confirmed.includes(activeId) ? '已确认；完成后应用到布局草稿' : '调整后请确认此区域；双指可缩放图片') : '等待图片加载' }}</span><button class="primary" :disabled="!ready || busy" @click="confirmCurrent">确认此区域</button></div>
      </footer>
    </section>
  </n-modal>
</template>

<style scoped>
.region-editor { width: min(1200px, 96vw); height: min(880px, calc(var(--editor-height) - 32px)); display: flex; flex-direction: column; background: #101a29; color: #eef2f8; border: 1px solid #40516a; border-radius: 16px; overflow: hidden; }
.region-editor button, .region-editor select, .region-editor input { min-height: 44px; min-width: 44px; border: 1px solid #51627b; border-radius: 8px; background: #1c2c42; color: #eef2f8; font: inherit; padding: 8px 12px; }
.region-editor button { cursor: pointer; touch-action: manipulation; }
.region-editor button:disabled { opacity: .45; cursor: default; }
.region-editor button.primary, .region-editor button[aria-pressed=true] { background: #235f99; border-color: #89c7ff; }
.region-editor :focus-visible { outline: 3px solid #b5dbff; outline-offset: -3px; }
.region-header { display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid #40516a; }
.region-switch { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.region-switch select { min-width: 0; max-width: 100%; }
.region-body { display: flex; flex: 1; min-height: 0; }
.region-stage { flex: 1; min-width: 0; min-height: 0; position: relative; overflow: hidden; background: #080e17; touch-action: none; user-select: none; cursor: grab; }
.region-source { position: absolute; top: 0; left: 0; max-width: none; max-height: none; transform-origin: 0 0; pointer-events: none; }
.active-region { position: absolute; border: 2px solid #80c3ff; box-shadow: 0 0 0 99999px #0009; box-sizing: border-box; cursor: move; }
.panning .active-region { cursor: grab; }
.panning .region-handle { pointer-events: none; }
.region-tag { position: absolute; top: 8px; left: 8px; padding: 2px 8px; border-radius: 4px; background: #163e63; white-space: nowrap; pointer-events: none; }
.region-editor .region-handle { position: absolute; width: 44px; height: 44px; transform: translate(-50%, -50%); padding: 0; background: transparent; border: 0; border-radius: 0; touch-action: none; }
.region-handle span { display: block; width: 12px; height: 12px; margin: auto; border: 2px solid white; background: #235f99; border-radius: 3px; pointer-events: none; }
.handle-n,.handle-s { cursor: ns-resize !important; } .handle-e,.handle-w { cursor: ew-resize !important; } .handle-nw,.handle-se { cursor: nwse-resize !important; } .handle-ne,.handle-sw { cursor: nesw-resize !important; }
.other-region { position: absolute; border: 1px dashed #a8c5de; color: #fff; pointer-events: none; }
.region-details { flex: 0 0 260px; overflow: auto; padding: 16px; border-left: 1px solid #40516a; display: flex; flex-direction: column; gap: 12px; }
.region-details label { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.region-details input { width: 120px; } .region-details summary { cursor: pointer; padding: 12px 0; }
.region-preview-wrap { height: 130px; background: #080e17; } .region-reference { max-width: 100%; max-height: 240px; object-fit: contain; }
.region-nudge { display: flex; gap: 8px; } .region-footer { border-top: 1px solid #40516a; padding: 12px 16px; }
.region-tools { display: flex; flex-wrap: wrap; gap: 8px; } .region-confirm { display: flex; align-items: center; gap: 12px; justify-content: space-between; margin-top: 10px; }
.region-confirm span { font-size: 13px; color: #c3d1e4; } .region-confirm button { flex-shrink: 0; }
.region-loading { position: absolute; inset: 45% 0 auto; text-align: center; } .region-error { padding: 8px 16px; color: #ffb9b9; }
.region-lens { position: absolute; top: 12px; width: 120px; height: 120px; border: 2px solid white; border-radius: 12px; overflow: hidden; pointer-events: none; background: #080e17; }
.region-lens svg { width: 100%; height: 100%; } .region-lens span { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #fff; }
.details-toggle { display: none; }
@media (max-width: 719px), (pointer: coarse) and (max-height: 500px) {
  .region-editor { width: 100vw; height: var(--editor-height); border: 0; border-radius: 0; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); box-sizing: border-box; }
  .region-header { padding: 8px; gap: 8px; } .region-switch { flex-direction: column; gap: 2px; align-items: stretch; } .region-switch > span { font-size: 12px; }
  .region-body { flex-direction: column; } .region-details { display: none; flex: 0 1 180px; border-left: 0; border-top: 1px solid #40516a; padding: 8px 12px; } .region-details.expanded { display: flex; }
  .region-preview-wrap { display: none; } .region-details select, .region-details input { font-size: 16px; }
  .region-footer { padding: 8px; } .region-tools { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; } .region-tools button { flex-shrink: 0; }
  .region-confirm span { font-size: 12px; flex: 1; } .region-confirm { gap: 8px; } .details-toggle { display: block; } .region-stage { flex-basis: 140px; }
}
@media (max-height: 500px) and (min-width: 720px) { .region-editor { height: var(--editor-height); } .region-header,.region-footer { padding: 6px 12px; } }

@media (pointer: coarse) and (max-height: 500px) {
  .region-editor { width: 100vw; border: 0; border-radius: 0; }
  .region-header .region-switch { flex-direction: row; align-items: center; }
  .region-body { flex-direction: row; }
  .region-stage { flex-basis: 0; }
  .region-details { flex: 0 0 240px; border-top: 0; border-left: 1px solid #40516a; }
}
</style>
