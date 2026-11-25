/** 极简 hyperscript / 表单 / 下载 / toast 工具 */

export type Child = Node | string | number | false | null | undefined;

export type ElProps<K extends keyof HTMLElementTagNameMap> =
  & Partial<Omit<HTMLElementTagNameMap[K], 'style'>>
  & {
    class?: string;
    style?: string | Partial<CSSStyleDeclaration>;
    dataset?: Record<string, string>;
    html?: string;
  }
  & Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElProps<K> | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else Object.assign(el.style, v);
      } else if (k === 'dataset' && typeof v === 'object') {
        for (const [dk, dv] of Object.entries(v as Record<string, unknown>)) el.dataset[dk] = String(dv);
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === 'html') {
        el.innerHTML = String(v);
      } else if (k.includes('-')) {
        el.setAttribute(k, String(v));
      } else {
        try {
          (el as unknown as Record<string, unknown>)[k] = v;
        } catch {
          el.setAttribute(k, String(v));
        }
      }
    }
  }
  appendChildren(el, children);
  return el;
}

export function appendChildren(el: HTMLElement, children: Child[]) {
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: HTMLElement) {
  el.replaceChildren();
}

export function field(label: string, input: HTMLElement, hint?: string): HTMLLabelElement {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    input,
    hint ? h('small', { class: 'field-hint' }, hint) : null,
  );
}

export function numInput(value: number, opts: { step?: number; min?: number; max?: number; on: (v: number) => void }): HTMLInputElement {
  const inp = h('input', { type: 'number', value: String(value), step: opts.step == null ? 'any' : String(opts.step) }) as HTMLInputElement;
  if (opts.min != null) inp.min = String(opts.min);
  if (opts.max != null) inp.max = String(opts.max);
  inp.addEventListener('change', () => {
    const v = parseFloat(inp.value);
    if (Number.isFinite(v)) opts.on(v);
  });
  return inp;
}

export function textInput(value: string, on: (v: string) => void): HTMLInputElement {
  const inp = h('input', { type: 'text', value }) as HTMLInputElement;
  inp.addEventListener('change', () => on(inp.value));
  return inp;
}

export function selectInput<T extends string>(value: T, options: Array<[T, string]>, on: (v: T) => void): HTMLSelectElement {
  const sel = h('select') as HTMLSelectElement;
  for (const [val, label] of options) {
    const o = h('option', { value: val }, label) as HTMLOptionElement;
    if (val === value) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', () => on(sel.value as T));
  return sel;
}

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadSVG(filename: string, svg: SVGSVGElement | string) {
  const str = typeof svg === 'string' ? svg : new XMLSerializer().serializeToString(svg);
  downloadText(filename, `<?xml version="1.0" encoding="UTF-8"?>\n` + str, 'image/svg+xml;charset=utf-8');
}

let toastTimer: number | undefined;
export function toast(msg: string, kind: 'ok' | 'err' | 'info' = 'ok') {
  let host = document.getElementById('toast');
  if (!host) {
    host = h('div', { id: 'toast', class: 'toast-host' });
    document.body.append(host);
  }
  const item = h('div', { class: `toast toast-${kind}` }, msg);
  host.append(item);
  requestAnimationFrame(() => item.classList.add('show'));
  setTimeout(() => {
    item.classList.remove('show');
    setTimeout(() => item.remove(), 300);
  }, 2600);
  window.clearTimeout(toastTimer);
}

export function card(title: string, ...body: Child[]): HTMLElement {
  return h('section', { class: 'card' },
    h('header', { class: 'card-head' }, h('h2', {}, title)),
    h('div', { class: 'card-body' }, ...body),
  );
}

export function stat(label: string, value: string, sub?: string, tone?: string): HTMLElement {
  return h('div', { class: `stat ${tone ?? ''}` },
    h('div', { class: 'stat-value' }, value),
    h('div', { class: 'stat-label' }, label),
    sub ? h('div', { class: 'stat-sub' }, sub) : null,
  );
}
