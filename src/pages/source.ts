import { state } from '../state';
import { h, field, numInput, selectInput, card, toast } from '../ui/dom';
import type { LightSource, CandelaSample } from '../core/types';
import { sourceEmitterHeight, geometricDivergenceDeg } from '../core/optics';
import type { PageHandle } from './archives';

function distributionSVG(curve: CandelaSample[]): string {
  const W = 520, H = 240, m = { l: 40, r: 14, t: 16, b: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const X = (a: number) => m.l + ((a + 90) / 180) * iw;
  const Y = (v: number) => m.t + ih - Math.min(1.4, v) / 1.4 * ih;
  let grid = '';
  for (let a = -90; a <= 90; a += 30) grid += `<line x1="${X(a)}" y1="${m.t}" x2="${X(a)}" y2="${m.t + ih}" stroke="#123049"/><text x="${X(a)}" y="${H - 10}" fill="#5f8099" font-size="10" text-anchor="middle">${a}°</text>`;
  for (let v = 0; v <= 1.001; v += 0.5) grid += `<line x1="${m.l}" y1="${Y(v)}" x2="${m.l + iw}" y2="${Y(v)}" stroke="#123049"/><text x="${m.l - 6}" y="${Y(v) + 3}" fill="#5f8099" font-size="10" text-anchor="end">${v}</text>`;
  const sorted = [...curve].sort((a, b) => a.angleDeg - b.angleDeg);
  const line = sorted.map((p, i) => `${i ? 'L' : 'M'}${X(p.angleDeg)},${Y(p.intensity)}`).join(' ');
  const dots = sorted.map((p) => `<circle cx="${X(p.angleDeg)}" cy="${Y(p.intensity)}" r="3.5" fill="#fbbf24"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><rect width="${W}" height="${H}" rx="10" fill="#07131f"/>${grid}<path d="${line}" fill="none" stroke="#38bdf8" stroke-width="2.4"/>${dots}</svg>`;
}

export function renderSource(_rerender: () => void): PageHandle {
  const el = h('div', { class: 'page' });
  const lh = state.selectedLighthouse;
  let src: LightSource = state.sourceOf(lh) ?? state.data.sources[0];
  const lens = state.lensOf(lh);

  const host = h('div', {});
  function commit() { void state.saveSource(src); }
  function rerenderLocal() { renderInto(); }

  function renderInto() {
    host.replaceChildren();
    const effH = sourceEmitterHeight(src);
    const divg = lens ? geometricDivergenceDeg(lens.focalLengthM, effH, src.focusOffsetM ?? 0) : null;

    const sel = selectInput(src.id, state.data.sources.map((s) => [s.id, s.name]), (v) => {
      src = state.data.sources.find((s) => s.id === v)!; renderInto();
    });
    const newBtn = h('button', { class: 'btn sm primary', onclick: () => {
      const n: LightSource = { id: 'src-' + Math.random().toString(36).slice(2, 7), name: '新光源', kind: 'led-array', lumens: 1000, emitterHeightM: 0.02, emitterWidthM: 0.02, beamAngleDeg: 120, distribution: [{ angleDeg: -60, intensity: .6 }, { angleDeg: 0, intensity: 1 }, { angleDeg: 60, intensity: .6 }] };
      state.data.sources.push(n); void state.saveSource(n); src = n; renderInto();
    } }, '＋ 新光源');

    const kindSel = selectInput(src.kind, [['point', '点光源'], ['led-array', 'LED 阵列'], ['bulb', '老式灯泡']], (v) => { src.kind = v as LightSource['kind']; commit(); renderInto(); });

    const basic = h('div', { class: 'grid cols-3' },
      field('名称', textInput2(src.name, (v) => { src.name = v; commit(); })),
      field('类型', kindSel),
      field('总光通量 lm', numInput(src.lumens, { on: (v) => { src.lumens = v; commit(); } })),
      field('峰值光强 cd(可选)', numInput(src.peakCandela ?? 0, { on: (v) => { src.peakCandela = v || undefined; commit(); } }), '填 0 表示由光通/束宽估算'),
      field('垂直发光体 m', numInput(src.emitterHeightM, { step: 0.001, on: (v) => { src.emitterHeightM = v; commit(); rerenderLocal(); } })),
      field('水平发光体 m', numInput(src.emitterWidthM, { step: 0.001, on: (v) => { src.emitterWidthM = v; commit(); } })),
      field('发光全角 °', numInput(src.beamAngleDeg ?? 180, { on: (v) => { src.beamAngleDeg = v; commit(); } })),
      field('焦点偏移 m', numInput(src.focusOffsetM ?? 0, { step: 0.005, on: (v) => { src.focusOffsetM = v; commit(); rerenderLocal(); } }), '+ 远离透镜，会带来离焦发散'),
      field('色温 K', numInput(src.colorK ?? 5800, { on: (v) => { src.colorK = v; commit(); } })),
    );

    const extra = h('div', { class: 'grid cols-3' });
    if (src.kind === 'led-array') {
      extra.append(
        field('阵列行数', numInput(src.arrayRows ?? 1, { step: 1, on: (v) => { src.arrayRows = Math.round(v); commit(); rerenderLocal(); } })),
        field('阵列列数', numInput(src.arrayCols ?? 1, { step: 1, on: (v) => { src.arrayCols = Math.round(v); commit(); } })),
        field('点间距 m', numInput(src.pitchM ?? 0.01, { step: 0.001, on: (v) => { src.pitchM = v; commit(); rerenderLocal(); } })),
      );
    } else if (src.kind === 'bulb') {
      extra.append(field('玻壳/灯丝直径 m', numInput(src.bulbDiameterM ?? 0.05, { step: 0.005, on: (v) => { src.bulbDiameterM = v; commit(); rerenderLocal(); } })));
    }

    // 配光曲线表
    const curveHost = h('div', { class: 'table-wrap' });
    const drawCurveTable = () => {
      const t = h('table', { class: 'data' });
      t.append(h('thead', {}, h('tr', {}, h('th', {}, '角度 °'), h('th', {}, '光强(相对/cd)'), h('th', {}, ''))));
      const tb = h('tbody');
      src.distribution.forEach((p, i) => {
        const a = numInput(p.angleDeg, { on: (v) => { p.angleDeg = v; commit(); refreshCurve(); } });
        const iv = numInput(p.intensity, { step: 0.05, on: (v) => { p.intensity = v; commit(); refreshCurve(); } });
        const del = h('button', { class: 'btn sm danger', onclick: () => { src.distribution.splice(i, 1); commit(); refreshCurve(); } }, '×');
        tb.append(h('tr', {}, h('td', {}, a), h('td', {}, iv), h('td', {}, del)));
      });
      t.append(tb);
      curveHost.replaceChildren(t);
    };
    const curveSvgHost = h('div', { class: 'chart-stage', style: 'padding:8px' });
    function refreshCurve() { curveSvgHost.innerHTML = distributionSVG(src.distribution); drawCurveTable(); }
    const addPoint = h('button', { class: 'btn sm primary', onclick: () => { src.distribution.push({ angleDeg: 0, intensity: 0.5 }); commit(); refreshCurve(); } }, '＋ 采样点');
    refreshCurve();

    const preview = h('div', { class: 'stats-row' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-value accent' }, `${(effH * 1000).toFixed(1)} mm`), h('div', { class: 'stat-label' }, '有效垂直发光高度')),
      divg ? h('div', { class: 'stat' }, h('div', { class: 'stat-value green' }, `${divg.fullDeg.toFixed(3)}°`), h('div', { class: 'stat-label' }, `配 ${lens!.name.slice(0, 12)} 几何发散全角`), h('div', { class: 'stat-sub' }, `半角 ${divg.halfDeg.toFixed(3)}° · h/f 近似 ${divg.paraxialFullDeg.toFixed(3)}°`))
        : h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, '—'), h('div', { class: 'stat-label' }, '当前档案无透镜')),
    );

    host.append(
      h('div', { class: 'flex between mb12 wrap' }, h('div', { class: 'flex' }, sel, newBtn)),
      preview,
      card('光源参数', basic, h('div', { class: 'mt12' }, extra)),
      h('div', { class: 'mt16' }, card('配光曲线录入',
        h('div', { class: 'grid cols-2' }, curveSvgHost, h('div', {}, curveHost, h('div', { class: 'mt8' }, addPoint))),
      )),
    );
  }
  renderInto();

  el.append(
    h('div', { class: 'page-head' }, h('h2', {}, '光源配置'),
      h('p', {}, '支持理想点光源、LED 阵列与老式灯泡；可录入外形尺寸与配光曲线，尺寸经焦距换算直接决定透镜出射光束的几何发散角。')),
    host,
  );
  return { el };
}

function textInput2(value: string, on: (v: string) => void) {
  const inp = h('input', { type: 'text', value }) as HTMLInputElement;
  inp.addEventListener('change', () => on(inp.value));
  return inp;
}
