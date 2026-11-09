// Local fallbacks for the APIs actually used by the compiled handbook.
export function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
if (!Object.fromEntries) Object.fromEntries = function (entries: any) {
  const result: any = {};
  for (const pair of entries) Object.defineProperty(result, pair[0], { value: pair[1], enumerable: true, configurable: true, writable: true });
  return result;
};
if (!Array.prototype.flatMap) Object.defineProperty(Array.prototype, 'flatMap', { configurable: true, writable: true, value: function (callback: any, thisArg: any) {
  const result: any[] = [];
  this.forEach((value: any, index: number, array: any[]) => {
    const mapped = callback.call(thisArg, value, index, array);
    if (Array.isArray(mapped)) mapped.forEach(item => result.push(item));
    else result.push(mapped);
  });
  return result;
} });

export class SizeObserver {
  private native: ResizeObserver | undefined;
  private targets = new Map<HTMLElement, { width: number; height: number }>();
  private mutation: MutationObserver | undefined;
  private frame = 0;
  private schedule = () => {
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      let changed = false;
      this.targets.forEach((last, element) => {
        const width = element.clientWidth, height = element.clientHeight;
        if (width !== last.width || height !== last.height) {
          this.targets.set(element, { width, height }); changed = true;
        }
      });
      if (changed) this.callback();
    });
  };
  constructor(private callback: () => void) {
    if (typeof ResizeObserver === 'function') this.native = new ResizeObserver(callback);
    else {
      window.addEventListener('resize', this.schedule);
      document.addEventListener('load', this.schedule, true);
      this.mutation = new MutationObserver(this.schedule);
    }
  }
  observe(element: HTMLElement) {
    if (this.native) this.native.observe(element);
    else {
      this.targets.set(element, { width: -1, height: -1 });
      this.mutation!.observe(element, { childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
      this.schedule();
    }
  }
  disconnect() {
    this.native?.disconnect(); this.mutation?.disconnect(); this.targets.clear();
    window.removeEventListener('resize', this.schedule);
    document.removeEventListener('load', this.schedule, true);
    cancelAnimationFrame(this.frame); this.frame = 0;
  }
}

// Dialog is absent in some target WebViews. A DOM backdrop preserves dismissal.
const dialog = document.createElement('dialog');
if (typeof dialog.showModal !== 'function') {
  const prototype = Object.getPrototypeOf(dialog);
  prototype.showModal = function () {
    if (this.hasAttribute('open')) return;
    this.__miniFocus = document.activeElement;
    this.__miniPlaceholder = document.createComment('mini-dialog');
    this.parentNode.insertBefore(this.__miniPlaceholder, this);
    const backdrop = document.createElement('div'); backdrop.className = 'mini-dialog-backdrop';
    backdrop.addEventListener('click', () => this.close());
    this.__miniBackdrop = backdrop; document.body.appendChild(backdrop);
    // Emulate the native top layer, outside any transformed/stacked application ancestor.
    document.body.appendChild(this);
    this.setAttribute('open', ''); this.setAttribute('role', 'dialog'); this.setAttribute('aria-modal', 'true');
    this.__miniKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key === 'Tab') {
        const buttons = this.querySelectorAll('button, [href], input, select, [tabindex="0"]');
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    this.addEventListener('keydown', this.__miniKeydown);
    this.__miniRemoval = new MutationObserver(() => { if (!this.isConnected) this.close(); });
    this.__miniRemoval.observe(document.body, { childList: true });
    this.querySelector('button')?.focus();
  };
  prototype.close = function () {
    this.__miniRemoval?.disconnect(); this.__miniRemoval = null;
    this.removeEventListener('keydown', this.__miniKeydown);
    this.__miniBackdrop?.remove(); this.__miniBackdrop = null;
    if (this.__miniPlaceholder?.parentNode) this.__miniPlaceholder.parentNode.replaceChild(this, this.__miniPlaceholder);
    this.__miniPlaceholder = null;
    this.removeAttribute('open'); this.dispatchEvent(new Event('close'));
    if (this.__miniFocus?.isConnected) this.__miniFocus.focus();
    this.__miniFocus = null;
  };
}

export function startLayoutFallbacks() {
  // Old WebViews lack :focus-visible. Track input modality instead of showing
  // keyboard outlines after every touch (especially inside the density pill).
  const root = document.documentElement;
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' || event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') root.classList.add('mini-keyboard-focus');
  }, true);
  const pointer = () => root.classList.remove('mini-keyboard-focus');
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('mousedown', pointer, true);
  document.addEventListener('touchstart', pointer, { capture: true, passive: true });
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px';
  probe.appendChild(document.createElement('div')); probe.appendChild(document.createElement('div'));
  document.body.appendChild(probe); const flexGap = probe.scrollHeight === 1; probe.remove();
  if (flexGap) return;
  let frame = 0;
  function update() {
    frame = 0;
    document.querySelectorAll<HTMLElement>('#app *').forEach(element => {
      const style = getComputedStyle(element);
      const row = style.getPropertyValue('--mini-row-gap').trim();
      const column = style.getPropertyValue('--mini-column-gap').trim();
      if ((parseFloat(row) || parseFloat(column)) && /^(inline-)?flex$/.test(style.display)) {
        element.dataset.miniFlex = style.flexDirection.startsWith('column') ? 'column' : 'row';
      } else delete element.dataset.miniFlex;
    });
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  new MutationObserver(schedule).observe(document.getElementById('app')!, { childList: true, subtree: true });
  window.addEventListener('resize', schedule); schedule();
}
