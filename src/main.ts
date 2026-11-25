import './styles.css';
import { state, type Route } from './state';
import { h, clear } from './ui/dom';
import { runAcceptance } from './core/acceptance';
import * as ATON from './api';
import { renderArchives, type PageHandle } from './pages/archives';
import { renderLens } from './pages/lens';
import { renderSource } from './pages/source';
import { renderSeaview } from './pages/seaview';
import { renderCharacter } from './pages/character';
import { renderSettings } from './pages/settings';

// 暴露给 Playwright / 控制台
declare global {
  interface Window { ATON: typeof ATON & { __app?: unknown } }
}
window.ATON = ATON;

const NAV: Array<{ id: Route; label: string; ico: string }> = [
  { id: 'archives', label: '灯塔档案', ico: '🗼' },
  { id: 'lens', label: '透镜建模', ico: '🔷' },
  { id: 'source', label: '光源配置', ico: '💡' },
  { id: 'seaview', label: '海上视认', ico: '🌊' },
  { id: 'character', label: '灯质编排', ico: '✨' },
  { id: 'settings', label: '设置 / 校验', ico: '⚙️' },
];

let current: PageHandle | null = null;
const content = h('main', { class: 'content', id: 'content' });

function renderRoute() {
  current?.dispose?.();
  current = null;
  clear(content);
  const route = state.route;
  const rerender = () => renderRoute();
  switch (route) {
    case 'archives': current = renderArchives(rerender); break;
    case 'lens': current = renderLens(rerender); break;
    case 'source': current = renderSource(rerender); break;
    case 'seaview': current = renderSeaview(rerender); break;
    case 'character': current = renderCharacter(rerender); break;
    case 'settings': current = renderSettings(rerender); break;
  }
  if (current) content.append(current.el);
  content.scrollTop = 0;
  // 高亮导航
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.route === route));
}

function renderShell() {
  const lhSelect = h('select', { 'aria-label': '选择灯塔' }) as HTMLSelectElement;
  for (const l of state.data.lighthouses) {
    const o = h('option', { value: l.id }, `${l.name} · ${l.code}`) as HTMLOptionElement;
    if (l.id === state.selectedLighthouseId) o.selected = true;
    lhSelect.append(o);
  }
  lhSelect.addEventListener('change', () => {
    state.selectedLighthouseId = lhSelect.value;
    renderRoute();
  });

  const gate = runAcceptance();
  const sideFoot = h('div', { class: 'side-foot' },
    h('div', {}, h('span', { class: `gate-dot ${gate.allPass ? 'ok' : 'bad'}` }), gate.allPass ? '两项精度验收通过' : '精度自检未通过'),
    h('div', { class: 'mt8' }, `射程误差 ${gate.range.maxRelativeError.toExponential(1)}%`),
    h('div', {}, `发散误差 ${gate.divergence.maxAbsErrorDeg.toExponential(3)}°`),
  );

  const nav = h('nav', { class: 'sidebar' },
    ...NAV.map((n) => h('button', {
      class: 'nav-btn' + (state.route === n.id ? ' active' : ''),
      dataset: { route: n.id },
      onclick: () => { state.route = n.id; location.hash = '#/' + n.id; renderRoute(); },
    }, h('span', { class: 'ico' }, n.ico), h('span', {}, n.label))),
    sideFoot,
  );

  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('div', { class: 'lens-mark' }),
      h('div', {}, h('h1', {}, '航标灯光学与灯质仿真系统'), h('small', {}, 'AtoN Optics · Fresnel Ray-Trace · IALA Range'))),
    h('div', { class: 'spacer' }),
    h('div', { class: 'lh-switcher' }, h('span', { class: 'dim' }, '当前灯塔'), lhSelect),
  );

  const shell = h('div', { class: 'app-shell' }, topbar, nav, content);
  const app = document.getElementById('app')!;
  app.replaceChildren(shell);
  renderRoute();

  window.addEventListener('hashchange', () => {
    const r = location.hash.replace('#/', '') as Route;
    if (NAV.some((n) => n.id === r) && r !== state.route) { state.route = r; renderRoute(); }
  });
  if (!location.hash) location.hash = '#/' + state.route;
}

// 启动: 从初始 hash 恢复路由, 等 IndexedDB 播种完成
const initialHash = location.hash.replace('#/', '') as Route;
if (NAV.some((n) => n.id === initialHash)) state.route = initialHash;
const boot = h('div', { class: 'boot' }, h('div', { class: 'beacon' }), h('div', {}, '正在装载灯塔档案与光学核心…'));
document.getElementById('app')!.append(boot);
state.ready.then(() => renderShell()).catch((e) => {
  console.error(e);
  boot.innerHTML = `<div class="webgl-fallback">初始化 IndexedDB 失败: ${(e as Error).message}<br>请使用现代浏览器。</div>`;
});
