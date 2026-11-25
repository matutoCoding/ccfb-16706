import { state } from '../state';
import { h, numInput, card, stat } from '../ui/dom';
import { SeaRenderer } from '../gl/sea';
import { computeRangeBudget, transmissivityFromVisibility } from '../core/iala';
import { sampleCharacter } from '../core/characteristic';
import { evaluateBearing } from '../core/sectors';
import type { PageHandle } from './archives';

export function renderSeaview(_rerender: () => void): PageHandle {
  const el = h('div', { class: 'page' });
  const lh = state.selectedLighthouse!;
  const ch = state.characterOf(lh);
  const src = state.sourceOf(lh);
  const s = state.data.settings;

  const controls = {
    visibilityNM: s.visibilityNM,
    fog: s.fogDensity,
    reflect: s.seaReflectivity,
    eyeH: s.observerHeightM,
    distanceNM: 5,
    bearing: 45,
    playing: true,
    timeScale: 1,
  };
  let simTime = 0;
  let last = performance.now();

  // ---- HUD / 数据 ----
  const rangeStats = h('div', { class: 'stats-row' });
  const hud = h('div', { class: 'hud' });
  const flashChip = h('div', { class: 'chip' }, '灯质 —');
  const rangeChip = h('div', { class: 'chip' });
  const sectorChip = h('div', { class: 'chip' });
  hud.append(flashChip, rangeChip, sectorChip);

  const canvas = h('canvas') as HTMLCanvasElement;
  canvas.style.height = '520px';
  const wrap = h('div', { class: 'canvas-wrap' }, canvas, hud);
  const renderer = new SeaRenderer(canvas);
  (window as unknown as { __sea?: SeaRenderer }).__sea = renderer;

  if (renderer.failed) {
    wrap.append(h('div', { class: 'webgl-fallback' },
      h('div', { style: 'font-size:18px;margin-bottom:8px' }, '当前环境无法创建 WebGL2 上下文'),
      h('div', {}, '射程计算、灯质与时序等核心功能仍可使用；请在支持 WebGL2 / 硬件加速的浏览器中查看海上视认画面。')));
  }

  const I = lh.candela ?? src?.peakCandela ?? 1000;

  function calc() {
    return computeRangeBudget({
      candela: I,
      lightHeightM: lh.lightHeightM,
      observerHeightM: controls.eyeH,
      visibilityNM: controls.visibilityNM,
      thresholdLux: s.thresholdLux,
      geoCoeffM: s.geoCoeffM,
    });
  }

  function refreshStats() {
    const r = calc();
    const T = transmissivityFromVisibility(controls.visibilityNM);
    const pathT = Math.pow(T, controls.distanceNM);
    const visible = controls.distanceNM <= r.finalNM;
    rangeStats.replaceChildren(
      stat('光力射程', `${r.luminousNM.toFixed(2)} NM`, `Allard · T(V)=${r.transmissivity.toFixed(3)}`, 'accent'),
      stat('地理射程', `${r.geographicNM.toFixed(2)} NM`, `灯高${lh.lightHeightM}m / 眼高${controls.eyeH}m`, 'green'),
      stat('视认射程(取小)', `${r.visibleNM.toFixed(2)} NM`, `受限: ${r.limitingFactor === 'luminous' ? '光力' : '地理'}`, 'amber'),
      stat('当前距离', `${controls.distanceNM.toFixed(1)} NM`, `路径透射 T^R=${pathT.toExponential(2)}`, visible ? 'green' : 'red'),
      stat('能否看到', visible ? '可见' : '超射程', visible ? '照度≥阈值' : '低于 IALA 阈值', visible ? 'green' : 'red'),
    );
    rangeChip.innerHTML = `光力 <b>${r.luminousNM.toFixed(1)}</b> · 地理 <b>${r.geographicNM.toFixed(1)}</b> NM`;
    return { r, pathT };
  }
  refreshStats();

  // ---- 渲染帧 ----
  renderer.onFrame = (_wall) => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (controls.playing) simTime += dt * controls.timeScale;
    const sample = ch ? sampleCharacter(ch, simTime) : { intensity: 1, color: 'W' as const, on: true, t: simTime };
    const { pathT } = refreshStatsLite();
    const sec = evaluateBearing(controls.bearing, lh.sectors);
    const cdGain = Math.min(2.2, Math.max(0.55, 0.5 + Math.log10(Math.max(1, I)) / 8));
    const haze = Math.min(1, controls.fog * 0.5 + Math.max(0, 1 - controls.visibilityNM / 14) * 0.5);
    const col: [number, number, number] = sample.color === 'R' ? [1, 0.25, 0.2]
      : sample.color === 'G' ? [0.3, 1, 0.6]
        : src?.color ?? [1, 0.86, 0.55];
    const secCol: [number, number, number] = sec.color === 'R' ? [1, 0.25, 0.2] : sec.color === 'G' ? [0.3, 1, 0.6] : [1, 1, 1];
    renderer.uniforms.beam = sample.on ? sample.intensity : 0.04;
    renderer.uniforms.transmission = pathT;
    renderer.uniforms.haze = haze;
    renderer.uniforms.reflect = controls.reflect;
    renderer.uniforms.intensity = cdGain;
    renderer.uniforms.lightColor = col;
    renderer.uniforms.sectorColor = secCol;
    renderer.uniforms.blocked = sec.occlusion;
    renderer.uniforms.sweep = simTime * (ch?.rpm ? ch.rpm / 60 * Math.PI * 2 : 0.5);

    flashChip.innerHTML = `${ch ? ch.name : '定光'} · t=${simTime.toFixed(1)}s · ` +
      (sample.on ? `<b style="color:${sample.color === 'R' ? '#f87171' : sample.color === 'G' ? '#34d399' : '#fbbf24'}">● 发光 ${(sample.intensity * 100) | 0}%</b>` : '<span style="color:#5f8099">○ 熄灭</span>');
    sectorChip.innerHTML = `方位 <b>${controls.bearing}°</b> · ${sec.blocked ? '<span style="color:#94a3b8">地形遮挡</span>' : sec.color === 'R' ? '<span style="color:#f87171">红光扇区</span>' : sec.color === 'G' ? '<span style="color:#34d399">绿光扇区</span>' : '白光扇区'}`;
  };
  // 每帧只更新 HUD 文本, 不重建统计 DOM
  let lastStat = 0;
  function refreshStatsLite() {
    const T = transmissivityFromVisibility(controls.visibilityNM);
    const pathT = Math.pow(T, controls.distanceNM);
    const now = performance.now();
    if (now - lastStat > 250) { lastStat = now; refreshStats(); }
    return { pathT };
  }
  if (!renderer.failed) renderer.startLoop();

  // ---- 控件 ----
  const visSlider = labeledSlider('大气能见度 (MOR)', controls.visibilityNM, 0.5, 30, 0.1, ' NM', (v) => { controls.visibilityNM = v; s.visibilityNM = v; void state.saveSettings(s); refreshStats(); });
  const fogSlider = labeledSlider('雾浓度', controls.fog, 0, 1, 0.01, '', (v) => { controls.fog = v; s.fogDensity = v; void state.saveSettings(s); });
  const refSlider = labeledSlider('海面反光', controls.reflect, 0, 1, 0.01, '', (v) => { controls.reflect = v; s.seaReflectivity = v; void state.saveSettings(s); });
  const eyeSlider = labeledSlider('观察者眼高', controls.eyeH, 1, 40, 0.5, ' m', (v) => { controls.eyeH = v; s.observerHeightM = v; void state.saveSettings(s); refreshStats(); });
  const distSlider = labeledSlider('与灯塔距离', controls.distanceNM, 0.5, 30, 0.1, ' NM', (v) => { controls.distanceNM = v; refreshStats(); });
  const bearSlider = labeledSlider('观察方位', controls.bearing, 0, 359, 1, '°', (v) => { controls.bearing = Math.round(v); });
  const speedSlider = labeledSlider('时间倍速', controls.timeScale, 0.25, 8, 0.25, '×', (v) => { controls.timeScale = v; });

  const playBtn = h('button', { class: 'btn primary', onclick: () => { controls.playing = !controls.playing; playBtn.textContent = controls.playing ? '⏸ 暂停' : '▶ 播放'; } }, '⏸ 暂停');
  const nowBtn = h('button', { class: 'btn', onclick: () => { simTime = 0; } }, '↺ 回到周期起点');
  const edgeBtn = h('button', { class: 'btn', onclick: () => { controls.distanceNM = Math.max(0.5, calc().finalNM); const inp = distSlider.querySelector('input')!; inp.value = String(controls.distanceNM); refreshStats(); } }, '开到视认射程边缘');

  el.append(
    h('div', { class: 'page-head' }, h('h2', {}, '海上视认'),
      h('p', {}, '从船舶驾驶台视角看灯塔：按 IALA Allard 光强×能见度计算路径透射，联动雾、海面反光与灯质闪光；光力射程与地理射程取小。红白分界与遮挡扇区随方位生效。')),
    statsHost(),
    card('船视画面 (WebGL2 + GLSL)', wrap),
    h('div', { class: 'grid cols-2 mt16' },
      card('环境与观察', visSlider, fogSlider, refSlider, eyeSlider),
      card('船舶 / 时间 / 方位', distSlider, bearSlider, speedSlider,
        h('div', { class: 'flex mt12 wrap' }, playBtn, nowBtn, edgeBtn)),
    ),
  );

  function statsHost() { return rangeStats; }
  return {
    el,
    dispose: () => {
      renderer.dispose();
      if ((window as unknown as { __sea?: SeaRenderer }).__sea === renderer) delete (window as unknown as { __sea?: SeaRenderer }).__sea;
    },
  };
}

function labeledSlider(label: string, value: number, min: number, max: number, step: number, unit: string, on: (v: number) => void): HTMLElement {
  const out = h('output', {}, `${value}${unit}`);
  const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    out.textContent = `${Number.isInteger(step) ? v.toFixed(0) : v}${unit}`;
    on(v);
  });
  return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), h('div', { class: 'range-row' }, inp, out));
}

// 保持 numInput 引用(预留数值输入)
void numInput;
