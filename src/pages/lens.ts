import { state } from '../state';
import { h, field, numInput, selectInput, card, toast, downloadText, downloadSVG } from '../ui/dom';
import type { FresnelLens, LensRing } from '../core/types';
import {
  createFirstOrderLens, createFourthOrderLens, createBeaconLens,
  importRingTable, exportRingTableCSV, SAMPLE_DRAWING_CSV,
  designAlphaRad, refractExitNormalRad, tirNormalRad,
} from '../core/fresnel';
import { analyzeLensBeam, traceTargetedRayDeg, sourceEmitterHeight } from '../core/optics';
import { lensRaySVG, photometricChartSVG } from '../charts';
import type { PageHandle } from './archives';

function recomputeAngles(ring: LensRing, f: number, n: number) {
  const r = 0.5 * (ring.rInnerM + ring.rOuterM);
  ring.radiusM = r;
  ring.designRadiusM = r;
  const alpha = designAlphaRad(r, f);
  ring.entryNormalDeg = (alpha * 180) / Math.PI;
  if (ring.kind === 'refract') ring.exitNormalDeg = (refractExitNormalRad(alpha, n) * 180) / Math.PI;
  else ring.tirNormalDeg = (tirNormalRad(alpha) * 180) / Math.PI;
}

export function renderLens(_rerender: () => void): PageHandle {
  const el = h('div', { class: 'page' });
  const lh = state.selectedLighthouse;
  let lens: FresnelLens = state.lensOf(lh) ?? state.data.lenses[0];
  let source = state.sourceOf(lh) ?? state.data.sources[0];

  const sourceSel = selectInput(source.id, state.data.sources.map((s) => [s.id, s.name]), (v) => {
    source = state.data.sources.find((s) => s.id === v)!;
    refreshAnalysis();
  });
  const lensSel = selectInput(lens.id, state.data.lenses.map((l) => [l.id, l.name]), (v) => {
    lens = state.data.lenses.find((l) => l.id === v)!;
    fullRefresh();
  });

  // ---- 图表容器 ----
  const rayHost = h('div', { class: 'chart-stage' });
  const photoHost = h('div', { class: 'chart-stage' });
  const statsHost = h('div', { class: 'stats-row' });

  function drawRay() {
    rayHost.innerHTML = lensRaySVG(lens, {
      emitterH: sourceEmitterHeight(source),
      traceFn: (ys, r) => traceTargetedRayDeg(lens, ys, r),
    });
  }

  function refreshAnalysis() {
    const beam = analyzeLensBeam(lens, source, { rayCount: 70000 });
    statsHost.replaceChildren(
      stat('几何全发散角', `${beam.divergence.fullDeg.toFixed(3)}°`, `2atan(h/2f) · 半角 ${beam.divergence.halfDeg.toFixed(3)}°`, 'accent'),
      stat('主光线追迹', `${beam.divergence.chiefTraceFullDeg.toFixed(4)}°`, `与几何差 ${beam.divergence.chiefTraceErrorDeg.toExponential(1)}°`, 'green'),
      stat('首环追迹', `${beam.divergence.ring0TraceFullDeg.toFixed(3)}°`, `偏差 ${beam.divergence.ring0ErrorVsGeometricDeg.toFixed(4)}° (<0.1°)`, beam.divergence.ring0ErrorVsGeometricDeg < 0.1 ? 'green' : 'red'),
      stat('FWHM 束宽', `${beam.divergence.fwhmDeg.toFixed(2)}°`, `稳健包络 ${beam.divergence.robustEnvelopeDeg.toFixed(1)}° (含彗差旁瓣)`),
      stat('透射率', `${(beam.divergence.transmission * 100).toFixed(1)}%`, `${beam.divergence.transmittedRayCount}/${beam.divergence.tracedRayCount} 线`),
      stat('估算峰值光强', `${beam.estimatedPeakCandela.toExponential(2)} cd`, '按束宽立体角与效率 72%'),
    );
    photoHost.innerHTML = photometricChartSVG(beam.distribution, {
      halfEdgeDeg: beam.divergence.halfDeg,
      fwhmDeg: beam.divergence.fwhmDeg,
      peakCd: beam.estimatedPeakCandela,
    });
    drawRay();
  }

  function stat(label: string, value: string, sub?: string, tone?: string) {
    return h('div', { class: 'stat' },
      h('div', { class: `stat-value ${tone ?? ''}` }, value),
      h('div', { class: 'stat-label' }, label),
      sub ? h('div', { class: 'stat-sub' }, sub) : null);
  }

  // ---- 参数 ----
  const fInp = numInput(lens.focalLengthM, { step: 0.01, on: (v) => { lens.focalLengthM = v; lens.rings.forEach((r) => recomputeAngles(r, v, lens.refractiveIndex)); void state.saveLens(lens); fullRefresh(); } });
  const nInp = numInput(lens.refractiveIndex, { step: 0.001, on: (v) => { lens.refractiveIndex = v; lens.rings.forEach((r) => recomputeAngles(r, lens.focalLengthM, v)); void state.saveLens(lens); fullRefresh(); } });

  const presetFirst = h('button', { class: 'btn sm', onclick: () => { lens = createFirstOrderLens(); replaceLens(lens); } }, '一等透镜 F920');
  const presetFourth = h('button', { class: 'btn sm', onclick: () => { lens = createFourthOrderLens(); replaceLens(lens); } }, '四等 F250');
  const presetBeacon = h('button', { class: 'btn sm', onclick: () => { lens = createBeaconLens(); replaceLens(lens); } }, '灯桩 F250');
  function replaceLens(nl: FresnelLens) {
    const idx = state.data.lenses.findIndex((l) => l.id === lens.id);
    nl.id = lens.id; // 保留当前档案引用
    if (idx >= 0) state.data.lenses[idx] = nl;
    lens = nl;
    void state.saveLens(nl);
    fullRefresh();
  }

  // ---- 环表 ----
  const tableHost = h('div', { class: 'table-wrap', style: 'max-height:340px;overflow:auto' });
  function drawTable() {
    const table = h('table', { class: 'data' });
    table.append(h('thead', {}, h('tr', {},
      h('th', {}, '#'), h('th', {}, '类型'), h('th', { class: 'num' }, 'r内 m'), h('th', { class: 'num' }, 'r外 m'),
      h('th', { class: 'num' }, '入射面°'), h('th', { class: 'num' }, '出射面°'), h('th', { class: 'num' }, 'TIR面°'), h('th', {}, ''))));
    const tb = h('tbody');
    lens.rings.forEach((r, i) => {
      const ri = numInput(r.rInnerM, { step: 0.005, on: (v) => { r.rInnerM = v; recomputeAngles(r, lens.focalLengthM, lens.refractiveIndex); void state.saveLens(lens); fullRefresh(); } });
      const ro = numInput(r.rOuterM, { step: 0.005, on: (v) => { r.rOuterM = v; recomputeAngles(r, lens.focalLengthM, lens.refractiveIndex); void state.saveLens(lens); fullRefresh(); } });
      const kind = selectInput(r.kind, [['refract', '折射环'], ['tir', 'TIR反射']], (v) => { r.kind = v as LensRing['kind']; recomputeAngles(r, lens.focalLengthM, lens.refractiveIndex); void state.saveLens(lens); fullRefresh(); });
      const del = h('button', { class: 'btn sm danger', onclick: () => { lens.rings.splice(i, 1); void state.saveLens(lens); fullRefresh(); } }, '×');
      tb.append(h('tr', {},
        h('td', { class: 'mono' }, String(r.index)),
        h('td', {}, kind),
        h('td', {}, ri), h('td', {}, ro),
        h('td', { class: 'num mono' }, r.entryNormalDeg.toFixed(2)),
        h('td', { class: 'num mono' }, r.exitNormalDeg.toFixed(2)),
        h('td', { class: 'num mono' }, r.tirNormalDeg != null ? r.tirNormalDeg.toFixed(2) : '—'),
        h('td', {}, del)));
    });
    table.append(tb);
    tableHost.replaceChildren(table);
  }

  const addRing = h('button', { class: 'btn sm primary', onclick: () => {
    const last = lens.rings[lens.rings.length - 1];
    const rIn = last ? last.rOuterM : 0.02;
    const rOut = rIn + 0.04;
    const ring: LensRing = { index: lens.rings.length, kind: 'refract', radiusM: (rIn + rOut) / 2, rInnerM: rIn, rOuterM: rOut, designRadiusM: (rIn + rOut) / 2, entryNormalDeg: 0, exitNormalDeg: 0, thicknessM: 0.03 };
    recomputeAngles(ring, lens.focalLengthM, lens.refractiveIndex);
    lens.rings.push(ring); void state.saveLens(lens); fullRefresh();
  } }, '＋ 环带');

  // ---- CSV 导入导出 ----
  const csvArea = h('textarea', { placeholder: '粘贴老图纸环带表 CSV…' }) as HTMLTextAreaElement;
  const importBtn = h('button', { class: 'btn primary', onclick: () => {
    try {
      const rings = importRingTable(csvArea.value, lens.focalLengthM, lens.refractiveIndex);
      if (!rings.length) throw new Error('未解析到环带行');
      lens.rings = rings;
      lens.refractCount = rings.filter((r) => r.kind === 'refract').length;
      lens.tirCount = rings.filter((r) => r.kind === 'tir').length;
      void state.saveLens(lens);
      fullRefresh();
      toast(`已导入 ${rings.length} 个环带`);
    } catch (e) { toast('导入失败: ' + (e as Error).message, 'err'); }
  } }, '导入环带表');
  const sampleBtn = h('button', { class: 'btn ghost sm', onclick: () => { csvArea.value = SAMPLE_DRAWING_CSV; } }, '填入示例图纸表');
  const exportCsv = h('button', { class: 'btn', onclick: () => downloadText(`${lens.id}-rings.csv`, exportRingTableCSV(lens), 'text/csv') }, '导出 CSV');
  const exportSvg = h('button', { class: 'btn', onclick: () => downloadSVG(`${lens.id}-photometric.svg`, photometricChartSVG(analyzeLensBeam(lens, source, { rayCount: 90000 }).distribution, { halfEdgeDeg: analyzeLensBeam(lens, source).divergence.halfDeg, width: 900, height: 420 })) }, '导出配光图 SVG');

  function fullRefresh() {
    drawTable();
    refreshAnalysis();
  }
  fullRefresh();

  el.append(
    h('div', { class: 'page-head' },
      h('h2', {}, '透镜建模与光线追踪'),
      h('p', {}, '按环带参数生成菲涅尔透镜，折射环与全反射(TIR)棱镜环分开建模；逐面 Snell 追迹计算垂直发散角与垂直光强分布，可导入老图纸环带表。'),
    ),
    h('div', { class: 'grid', style: 'gap:16px' },
      card('透镜与光源',
        h('div', { class: 'grid cols-3' },
          field('选择透镜', lensSel), field('配对光源', sourceSel), field('焦距 f m', fInp, '一等透镜经典 0.92m'),
          field('折射率 n', nInp, '冕牌玻璃约 1.49'),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, '快速预设'), h('div', { class: 'flex wrap' }, presetFirst, presetFourth, presetBeacon)),
        ),
      ),
      statsHost,
      h('div', { class: 'grid cols-2' },
        card('子午剖面光线追迹', rayHost),
        card('垂直方向光强配光图', photoHost, h('div', { class: 'mt12' }, exportSvg)),
      ),
      card('环带参数表（折射 / TIR 分开）',
        h('div', { class: 'flex between mb12 wrap' },
          h('div', { class: 'flex' }, addRing, exportCsv, h('span', { class: 'muted' }, `共 ${lens.rings.length} 环 · 折射 ${lens.refractCount ?? 0} · TIR ${lens.tirCount ?? 0}`)),
        ),
        tableHost,
      ),
      card('导入老图纸环带表',
        h('p', { class: 'dim' }, '支持列: no,kind(refract/tir 或 折射/反射), rInner, rOuter 或 radius, 以及可选 entryNormalDeg/exitNormalDeg/tirNormalDeg。缺角度时按 f,n 精确设计补算。'),
        csvArea,
        h('div', { class: 'flex mt12 wrap' }, importBtn, sampleBtn),
      ),
    ),
  );
  return { el };
}
