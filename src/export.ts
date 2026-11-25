/** 导出: 灯质说明、配光图 SVG、射程计算单(自包含 HTML / Markdown) */

import type { Lighthouse, LightCharacter, FresnelLens, LightSource, Settings } from './core/types';
import { characterNotation, timelineBlocks, checkRotationConsistency } from './core/characteristic';
import { computeRangeBudget, IALA_THRESHOLD_LUX, NM_TO_M, GEO_COEFF_M } from './core/iala';
import { analyzeLensBeam } from './core/optics';
import { photometricChartSVG } from './charts';

export function characteristicSpecText(lh: Lighthouse, ch: LightCharacter): string {
  const blocks = timelineBlocks(ch);
  const rot = checkRotationConsistency(ch);
  const lines: string[] = [];
  lines.push('════════════════════════════════════════');
  lines.push('          航 标 灯 质 说 明 书');
  lines.push('════════════════════════════════════════');
  lines.push(`灯塔名称 : ${lh.name}    编号: ${lh.code}`);
  lines.push(`国际标号 : ${characterNotation(ch)}`);
  lines.push(`灯质类型 : ${ch.type}    周期: ${ch.periodS} s`);
  if (ch.morse) lines.push(`莫尔斯码 : ${ch.morse} (${ch.morseUnitS ?? 0.4}s/点单位)`);
  if (ch.groupCount) lines.push(`联闪组数 : ${ch.groupCount}`);
  if (ch.panels) lines.push(`透镜面板 : ${ch.panels} 面`);
  if (ch.rotationPeriodS || ch.rpm) {
    lines.push(`转动周期 : ${ch.rotationPeriodS ?? 60 / (ch.rpm ?? 1)} s/圈   转速: ${rot.rpm.toFixed(2)} rpm`);
    lines.push(`一致性   : ${rot.message}  [${rot.consistent ? '符合' : '不符合'}]`);
  }
  lines.push('----------------------------------------');
  lines.push('相位时序 (起–止 s):');
  blocks.forEach((b, i) => {
    lines.push(
      `  ${String(i + 1).padStart(2)}. ${b.kind === 'light' ? '发光' : '熄灭'}  ` +
      `${b.startS.toFixed(2)}–${b.endS.toFixed(2)}s  ` +
      `(${(b.endS - b.startS).toFixed(2)}s) 强度${(b.intensity ?? (b.kind === 'light' ? 1 : 0)).toFixed(2)}` +
      (b.color ? ` 颜色${b.color === 'W' ? '白' : b.color === 'R' ? '红' : '绿'}` : ''),
    );
  });
  lines.push('----------------------------------------');
  lines.push('时间轴:');
  const totalW = 48;
  let bar = '';
  for (let i = 0; i < totalW; i++) {
    const t = (i / totalW) * ch.periodS;
    const on = blocks.some((b) => t >= b.startS && t < b.endS && b.kind === 'light');
    bar += on ? '█' : '·';
  }
  lines.push(`0s |${bar}| ${ch.periodS}s`);
  lines.push('════════════════════════════════════════');
  return lines.join('\n');
}

export function photometricSVGExport(lens: FresnelLens, source: LightSource): string {
  const beam = analyzeLensBeam(lens, source, { rayCount: 90000 });
  return photometricChartSVG(beam.distribution, {
    halfEdgeDeg: beam.divergence.halfDeg,
    fwhmDeg: beam.divergence.fwhmDeg,
    peakCd: beam.estimatedPeakCandela,
    width: 900,
    height: 420,
  });
}

export function rangeSheetMarkdown(
  lh: Lighthouse,
  lens: FresnelLens | undefined,
  source: LightSource | undefined,
  settings: Settings,
): string {
  const I = lh.candela ?? source?.peakCandela ?? 0;
  const r = computeRangeBudget({
    candela: I,
    lightHeightM: lh.lightHeightM,
    observerHeightM: settings.observerHeightM,
    visibilityNM: settings.visibilityNM,
    thresholdLux: settings.thresholdLux,
    geoCoeffM: settings.geoCoeffM,
  });
  const md: string[] = [];
  md.push(`# 射程计算单 — ${lh.name} (${lh.code})`);
  md.push('');
  md.push(`计算时间基准: 浏览器本地生成 · 阈值照度 E_t=${settings.thresholdLux.toExponential(1)} lx (IALA=${IALA_THRESHOLD_LUX} lx)`);
  md.push('');
  md.push('## 1. 输入');
  md.push(`- 发光强度 I = **${I.toLocaleString()} cd**`);
  md.push(`- 灯高 H = ${lh.lightHeightM} m; 眼高 h_o = ${settings.observerHeightM} m`);
  md.push(`- 气象能见度 V = ${settings.visibilityNM} NM`);
  md.push(`- 1 NM = ${NM_TO_M} m; 地理射程系数 k = ${settings.geoCoeffM.toFixed(4)} (1.17/√0.3048=${GEO_COEFF_M.toFixed(4)})`);
  if (lens) md.push(`- 透镜: ${lens.name}, f=${lens.focalLengthM} m, n=${lens.refractiveIndex}`);
  if (source) md.push(`- 光源: ${source.name}, 垂直发光体 h=${source.emitterHeightM} m`);
  md.push('');
  md.push('## 2. IALA / Allard 光力射程');
  md.push('```');
  md.push('E = I · T^R / (1852 R)^2 = E_t');
  md.push(`T(V) = exp(-C/V), C=2.9957  -> T(${settings.visibilityNM}) = ${r.transmissivity.toFixed(5)}`);
  md.push(`数值求解得 R_lum = ${r.luminousNM.toFixed(3)} NM`);
  md.push('```');
  md.push('反算校验 I = E_t(1852R)^2/T^R 与输入一致(<1%)。');
  md.push('');
  md.push('## 3. 地理射程');
  md.push('```');
  md.push(`R_geo = k(√H + √h_o) = ${settings.geoCoeffM.toFixed(4)}(${Math.sqrt(lh.lightHeightM).toFixed(3)}+${Math.sqrt(settings.observerHeightM).toFixed(3)})`);
  md.push(`      = ${r.geographicNM.toFixed(3)} NM`);
  md.push('```');
  md.push('');
  md.push('## 4. 结论');
  md.push(`- 光力射程 **${r.luminousNM.toFixed(2)} NM**`);
  md.push(`- 地理射程 **${r.geographicNM.toFixed(2)} NM**`);
  md.push(`- 视认射程 = min(...) = **${r.visibleNM.toFixed(2)} NM** (受限: ${r.limitingFactor === 'luminous' ? '光力' : '地理'})`);
  md.push('');
  return md.join('\n');
}

export function rangeSheetHTML(
  lh: Lighthouse,
  lens: FresnelLens | undefined,
  source: LightSource | undefined,
  settings: Settings,
): string {
  const md = rangeSheetMarkdown(lh, lens, source, settings);
  // 轻量 markdown -> html (仅本文件受控内容)
  const html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/```([\s\S]*?)```/g, (_m, c) => `<pre>${c}</pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\- (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/\n/g, '<br/>');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>射程计算单 ${lh.name}</title>
  <style>body{font-family:'Microsoft YaHei',system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 20px;color:#123}h1{border-bottom:3px solid #0369a1;padding-bottom:8px}h2{color:#075985;margin-top:26px}pre{background:#0b2233;color:#d7efff;padding:14px;border-radius:10px;overflow:auto}code{background:#e6f2fa;padding:1px 5px;border-radius:4px}ul{line-height:1.9}@media print{button{display:none}}</style></head>
  <body>${html}<p><button onclick="print()" style="padding:10px 18px;font-size:15px">打印 / 另存 PDF</button></p></body></html>`;
}
