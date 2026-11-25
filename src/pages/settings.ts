import { state } from '../state';
import { h, field, numInput, card, toast, downloadText } from '../ui/dom';
import { runAcceptance, type AcceptanceReport } from '../core/acceptance';
import { rangeSheetMarkdown, rangeSheetHTML } from '../export';
import { IALA_THRESHOLD_LUX, KOSCHMIEDER_C, GEO_COEFF_M } from '../core/iala';
import type { PageHandle } from './archives';

export function renderSettings(rerender: () => void): PageHandle {
  const el = h('div', { class: 'page' });
  const s = state.data.settings;
  const lh = state.selectedLighthouse;

  const reportHost = h('div', {});
  function renderReport(r: AcceptanceReport) {
    reportHost.replaceChildren();

    const rangeRows = r.range.cases.map((c) =>
      [c.name, c.expected.toFixed(5), c.actual.toFixed(5), c.error.toExponential(2) + '%', c.pass] as [string, string, string, string, boolean]);
    const rangeGate = h('div', { class: `gate ${r.range.pass ? 'pass' : 'fail'}` },
      h('h3', {}, r.range.pass ? '✅ 验收点 1 通过：射程算法 vs IALA 公式 < 1%' : '❌ 射程误差超限'),
      h('div', {}, `全部 ${r.range.cases.length} 组算例（公开算例 + 独立牛顿迭代 + 往返）最大相对误差 `,
        h('span', { class: 'pill ' + (r.range.pass ? 'ok' : 'bad') }, `${r.range.maxRelativeError.toExponential(3)} %`)),
      caseTable(rangeRows),
    );

    const divRows = r.divergence.cases.map((c) =>
      [c.name, c.expected.toFixed(6) + '°', c.actual.toFixed(6) + '°', c.error.toExponential(2) + '°', c.pass] as [string, string, string, string, boolean]);
    const divGate = h('div', { class: `gate ${r.divergence.pass ? 'pass' : 'fail'}` },
      h('h3', {}, r.divergence.pass ? '✅ 验收点 2 通过：一等透镜垂直发散角 vs 几何光学 < 0.1°' : '❌ 发散角误差超限'),
      h('div', { class: 'flex wrap', style: 'gap:18px' },
        h('span', {}, `f=${r.divergence.detail.focalLengthM} m, h=${r.divergence.detail.emitterHeightM} m`),
        h('span', {}, `几何全角 = ${r.divergence.detail.geometricFullDeg.toFixed(4)}°`),
        h('span', {}, `主光线追迹 = ${r.divergence.detail.chiefTraceFullDeg.toFixed(6)}°`),
        h('span', {}, `最大误差 `),
        h('span', { class: 'pill ' + (r.divergence.pass ? 'ok' : 'bad') }, `${r.divergence.maxAbsErrorDeg.toExponential(3)}°`),
      ),
      caseTable(divRows),
    );

    reportHost.append(rangeGate, divGate);
  }
  function caseTable(rows: Array<[string, string, string, string, boolean]>) {
    return h('div', { class: 'table-wrap mt12' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, '核对项'), h('th', { class: 'num' }, '独立参考'), h('th', { class: 'num' }, '系统结果'), h('th', { class: 'num' }, '误差'), h('th', {}, '判定'))),
        h('tbody', {}, ...rows.map(([name, e, a, err, pass]) =>
          h('tr', {}, h('td', {}, name), h('td', { class: 'num mono' }, e), h('td', { class: 'num mono' }, a),
            h('td', { class: 'num mono' }, err), h('td', {}, h('span', { class: 'badge ' + (pass ? 'green' : 'red') }, pass ? 'PASS' : 'FAIL')))))));
  }

  const runBtn = h('button', { class: 'btn primary', onclick: () => { const r = runAcceptance(); renderReport(r); toast(r.allPass ? '两项验收全部通过' : '存在未通过项', r.allPass ? 'ok' : 'err'); } }, '▶ 重新运行精度自检');
  // 首次自动运行(延迟以先绘制页面)
  setTimeout(() => { try { renderReport(runAcceptance()); } catch (e) { console.error(e); } }, 30);

  // IALA 常数
  const constCard = card('射程模型常数 (IALA / Allard / Koschmieder)',
    h('div', { class: 'grid cols-2' },
      field('默认眼高 m', numInput(s.observerHeightM, { on: (v) => { s.observerHeightM = v; void state.saveSettings(s); } })),
      field('默认能见度 NM', numInput(s.visibilityNM, { on: (v) => { s.visibilityNM = v; void state.saveSettings(s); } })),
      field('阈值照度 lux', numInput(s.thresholdLux, { step: 1e-8, on: (v) => { s.thresholdLux = v; void state.saveSettings(s); } }), `IALA 标准 ${IALA_THRESHOLD_LUX} (0.2µlx)`),
      field('Koschmieder C', numInput(s.koschmiederC, { step: 0.0001, on: (v) => { s.koschmiederC = v; void state.saveSettings(s); } }), `−ln0.05 = ${KOSCHMIEDER_C.toFixed(4)}`),
      field('地理射程系数', numInput(s.geoCoeffM, { step: 0.0001, on: (v) => { s.geoCoeffM = v; void state.saveSettings(s); } }), `1.17/√0.3048 = ${GEO_COEFF_M.toFixed(4)}`),
    ),
    h('p', { class: 'muted', style: 'font-size:12.5px' }, '修改后立即持久化，并作用于海上视认与射程计算单。评估可直接导入 src/core/iala.ts 核对公式。'),
  );

  const exportCard = card('导出当前灯塔计算单',
    h('div', { class: 'flex wrap' },
      h('button', { class: 'btn primary', onclick: () => {
        if (!lh) return;
        const html = rangeSheetHTML(lh, state.lensOf(lh), state.sourceOf(lh), s);
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
        else downloadText(`${lh.code}-range-sheet.html`, html, 'text/html');
      } }, '射程计算单 HTML / 打印 PDF'),
      h('button', { class: 'btn', onclick: () => lh && downloadText(`${lh.code}-range-sheet.md`, rangeSheetMarkdown(lh, state.lensOf(lh), state.sourceOf(lh), s), 'text/markdown') }, '下载 Markdown'),
      h('button', { class: 'btn', onclick: () => toast('配光图请在“透镜建模”页导出 SVG') }, '配光图 SVG 在透镜页'),
    ),
  );

  const dataCard = card('数据管理 (IndexedDB)',
    h('div', { class: 'flex wrap' },
      h('button', { class: 'btn', onclick: async () => {
        const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = 'aton-db-export.json'; a.click(); URL.revokeObjectURL(url);
      } }, '导出全部数据 JSON'),
      h('button', { class: 'btn danger', onclick: async () => { await state.resetAll(); toast('已恢复三座测试灯塔种子数据'); rerender(); } }, '恢复出厂种子（三座灯塔）'),
    ),
    h('p', { class: 'muted mt12', style: 'font-size:12.5px' }, '内置：东溟山灯塔（一等 F920 老透镜 + 溴钨灯泡）、白沙咀与星礁两座 LED 灯桩。'),
  );

  const apiCard = card('自动化 / 评测接口',
    h('p', { class: 'dim' }, '所有核心算法均为无 DOM 依赖的纯 TypeScript，Vite 开发服务器下可直接动态导入：'),
    h('pre', { class: 'mono', style: 'background:#07131f;border:1px solid var(--line);border-radius:10px;padding:12px;overflow:auto;font-size:12.5px' },
`await import('/src/core/iala.ts')        // Allard / IALA 射程
await import('/src/core/fresnel.ts')     // 菲涅尔环带生成/导入
await import('/src/core/optics.ts')      // Snell 追迹/发散角/配光
await import('/src/core/acceptance.ts') // runAcceptance() 两条硬指标
window.ATON.runAcceptance()             // 等价全局入口`),
  );

  el.append(
    h('div', { class: 'page-head' }, h('h2', {}, '设置与精度校验'),
      h('p', {}, 'IALA 常数、两条验收指标自检、计算单导出与 IndexedDB 数据管理。')),
    card('验收自检', runBtn, h('div', { class: 'mt12' }, reportHost)),
    h('div', { class: 'mt16' }, constCard),
    h('div', { class: 'grid cols-2 mt16' }, exportCard, dataCard),
    h('div', { class: 'mt16' }, apiCard),
  );
  return { el };
}
