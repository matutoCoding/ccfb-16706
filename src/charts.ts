/** 纯 SVG 图表: 垂直配光曲线、海图扇区、透镜光线剖面、射程对比 */

import type { FresnelLens, Lighthouse } from './core/types';
import type { VerticalBin } from './core/optics';
import { sectorArcPath, bearingToXY, norm360 } from './core/sectors';

function svgWrap(w: number, h: number, body: string, bg = true): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">
  ${bg ? `<rect x="0" y="0" width="${w}" height="${h}" rx="10" fill="#07131f"/>` : ''}
  ${body}</svg>`;
}

/** 垂直方向光强分布 I(elevation) */
export function photometricChartSVG(
  dist: VerticalBin[],
  opts: { halfEdgeDeg?: number; fwhmDeg?: number; width?: number; height?: number; peakCd?: number } = {},
): string {
  const W = opts.width ?? 720;
  const H = opts.height ?? 340;
  const m = { l: 52, r: 18, t: 20, b: 40 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const xmin = -12, xmax = 12;
  const X = (a: number) => m.l + ((a - xmin) / (xmax - xmin)) * iw;
  const Y = (v: number) => m.t + ih - v * ih;

  let grid = '';
  for (let a = -12; a <= 12; a += 2) {
    grid += `<line x1="${X(a)}" y1="${m.t}" x2="${X(a)}" y2="${m.t + ih}" stroke="#123049" stroke-width="1"/>`;
    grid += `<text x="${X(a)}" y="${H - 16}" fill="#5f8099" font-size="11" text-anchor="middle" font-family="monospace">${a}°</text>`;
  }
  for (let v = 0; v <= 1.0001; v += 0.25) {
    grid += `<line x1="${m.l}" y1="${Y(v)}" x2="${m.l + iw}" y2="${Y(v)}" stroke="#123049" stroke-width="1"/>`;
    grid += `<text x="${m.l - 8}" y="${Y(v) + 4}" fill="#5f8099" font-size="11" text-anchor="end" font-family="monospace">${v.toFixed(2)}</text>`;
  }
  grid += `<line x1="${X(0)}" y1="${m.t}" x2="${X(0)}" y2="${m.t + ih}" stroke="#2c5a7a" stroke-dasharray="3 4"/>`;

  // 几何边缘
  let edge = '';
  if (opts.halfEdgeDeg != null) {
    for (const sgn of [-1, 1]) {
      const a = sgn * opts.halfEdgeDeg;
      edge += `<line x1="${X(a)}" y1="${m.t}" x2="${X(a)}" y2="${m.t + ih}" stroke="#fbbf24" stroke-width="1.6" stroke-dasharray="6 4"/>`;
      edge += `<text x="${X(a)}" y="${m.t + 12}" fill="#fbbf24" font-size="11" text-anchor="middle">几何边缘 ${a > 0 ? '+' : ''}${a.toFixed(2)}°</text>`;
    }
  }

  const pts = dist.filter((d) => d.angleDeg >= xmin && d.angleDeg <= xmax);
  const line = pts.map((d, i) => `${i === 0 ? 'M' : 'L'}${X(d.angleDeg).toFixed(1)},${Y(d.intensity).toFixed(1)}`).join(' ');
  const area = `${line} L${X(pts[pts.length - 1]?.angleDeg ?? xmax)},${Y(0)} L${X(pts[0]?.angleDeg ?? xmin)},${Y(0)} Z`;

  const title = opts.peakCd
    ? `<text x="${m.l}" y="14" fill="#8fb0c8" font-size="11">归一化垂直光强 · 峰值≈${opts.peakCd.toExponential(2)} cd</text>`
    : `<text x="${m.l}" y="14" fill="#8fb0c8" font-size="11">归一化垂直光强分布</text>`;

  return svgWrap(W, H, `
    ${grid}${edge}
    <path d="${area}" fill="rgba(56,189,248,.18)"/>
    <path d="${line}" fill="none" stroke="#38bdf8" stroke-width="2.2"/>
    ${title}
    <text x="${W / 2}" y="${H - 2}" fill="#8fb0c8" font-size="12" text-anchor="middle">垂直角 elevation (°，相对灯轴)</text>
  `);
}

const SECTOR_COLORS: Record<string, { fill: string; stroke: string }> = {
  red: { fill: 'rgba(239,68,68,.28)', stroke: '#ef4444' },
  white: { fill: 'rgba(226,240,255,.22)', stroke: '#e2f0ff' },
  green: { fill: 'rgba(52,211,153,.26)', stroke: '#34d399' },
  obscured: { fill: 'rgba(100,116,139,.30)', stroke: '#64748b' },
};

/** 海图扇区 polar; bearing 可选当前船位方位 */
export function sectorChartSVG(lh: Lighthouse, opts: { bearing?: number; rangeNM?: number; size?: number } = {}): string {
  const S = opts.size ?? 460;
  const cx = S / 2, cy = S / 2, R = S / 2 - 56;
  let body = '';
  // 距离圈
  for (const f of [0.25, 0.5, 0.75, 1]) {
    body += `<circle cx="${cx}" cy="${cy}" r="${R * f}" fill="none" stroke="#123049" stroke-width="1"/>`;
  }
  // 方位刻度
  for (let b = 0; b < 360; b += 30) {
    const p1 = bearingToXY(cx, cy, R, b);
    const p2 = bearingToXY(cx, cy, R + 8, b);
    body += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#2c5a7a"/>`;
    const pt = bearingToXY(cx, cy, R + 24, b);
    body += `<text x="${pt.x}" y="${pt.y + 4}" fill="#5f8099" font-size="11" text-anchor="middle" font-family="monospace">${b === 0 ? 'N' : b === 90 ? 'E' : b === 180 ? 'S' : b === 270 ? 'W' : b}</text>`;
  }
  // 扇区
  for (const s of lh.sectors) {
    const c = SECTOR_COLORS[s.kind];
    const path = sectorArcPath(cx, cy, R, s.startBearing, s.widthDeg);
    body += `<path d="${path}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6"/>`;
    // 分界线锐度: softness>0 时在边界画渐变带宽度示意
    const soft = s.edgeSoftnessDeg ?? 0;
    for (const edgeB of [s.startBearing, norm360(s.startBearing + s.widthDeg)]) {
      body += `<line x1="${cx}" y1="${cy}" x2="${bearingToXY(cx, cy, R, edgeB).x}" y2="${bearingToXY(cx, cy, R, edgeB).y}" stroke="${c.stroke}" stroke-width="${soft > 0 ? 1 : 2.4}" stroke-dasharray="${soft > 0 ? '2 3' : '0'}" opacity="${soft > 0 ? 0.7 : 1}"/>`;
      if (soft > 0) {
        const w = Math.max(2, soft * 1.4);
        body += `<line x1="${cx}" y1="${cy}" x2="${bearingToXY(cx, cy, R, edgeB - w).x}" y2="${bearingToXY(cx, cy, R, edgeB - w).y}" stroke="${c.stroke}" stroke-width="1" opacity=".25"/>`;
        body += `<line x1="${cx}" y1="${cy}" x2="${bearingToXY(cx, cy, R, edgeB + w).x}" y2="${bearingToXY(cx, cy, R, edgeB + w).y}" stroke="${c.stroke}" stroke-width="1" opacity=".25"/>`;
      }
    }
    // 标签
    const mid = s.startBearing + s.widthDeg / 2;
    const lp = bearingToXY(cx, cy, R * 0.62, mid);
    body += `<text x="${lp.x}" y="${lp.y}" fill="${c.stroke}" font-size="12" text-anchor="middle" font-weight="700">${s.label ?? s.kind}</text>`;
  }
  // 灯塔中心
  body += `<circle cx="${cx}" cy="${cy}" r="7" fill="#fbbf24" stroke="#fff" stroke-width="2"/>`;
  // 船位方位线
  if (opts.bearing != null) {
    const b = norm360(opts.bearing);
    const bp = bearingToXY(cx, cy, R, b);
    body += `<line x1="${cx}" y1="${cy}" x2="${bp.x}" y2="${bp.y}" stroke="#38bdf8" stroke-width="2" stroke-dasharray="7 5"/>`;
    body += `<circle cx="${bp.x}" cy="${bp.y}" r="6" fill="#38bdf8"/>`;
    body += `<text x="${bp.x + 10}" y="${bp.y - 8}" fill="#7dd3fc" font-size="12" font-family="monospace">船 ${b.toFixed(0)}°</text>`;
  }
  return svgWrap(S, S, body);
}

/** 透镜子午剖面 + 焦点光线追迹示意 */
export function lensRaySVG(lens: FresnelLens, opts: { emitterH?: number; traceFn?: (ys: number, r: number) => number | null; width?: number; height?: number } = {}): string {
  const W = opts.width ?? 760;
  const H = opts.height ?? 460;
  const pad = 40;
  // 坐标: z 0..~1.6, r -1.45..1.45
  const zmin = -0.15, zmax = 1.7;
  const rmax = lens.apertureRadiusM * 1.08;
  const X = (z: number) => pad + ((z - zmin) / (zmax - zmin)) * (W - 2 * pad);
  const Y = (r: number) => H / 2 - (r / rmax) * (H / 2 - pad);

  let body = '';
  // 轴
  body += `<line x1="${X(zmin)}" y1="${Y(0)}" x2="${X(zmax)}" y2="${Y(0)}" stroke="#2c5a7a" stroke-dasharray="5 5"/>`;
  body += `<text x="${X(zmax) - 6}" y="${Y(0) - 7}" fill="#5f8099" font-size="11" text-anchor="end">光轴 Z</text>`;
  // 焦距标注
  body += `<line x1="${X(0)}" y1="${Y(-rmax * 0.92)}" x2="${X(lens.focalLengthM)}" y2="${Y(-rmax * 0.92)}" stroke="#fbbf24" stroke-width="1.4"/>`;
  body += `<text x="${(X(0) + X(lens.focalLengthM)) / 2}" y="${Y(-rmax * 0.92) - 6}" fill="#fbbf24" font-size="12" text-anchor="middle" font-family="monospace">f=${lens.focalLengthM.toFixed(2)}m</text>`;
  body += `<circle cx="${X(0)}" cy="${Y(0)}" r="4" fill="#fbbf24"/>`;

  // 环带面标记
  for (const ring of lens.rings) {
    const r = ring.designRadiusM;
    for (const sgn of [1, -1]) {
      const rr = sgn * r;
      const z = lens.focalLengthM;
      const color = ring.kind === 'tir' ? '#a78bfa' : '#38bdf8';
      body += `<circle cx="${X(z)}" cy="${Y(rr)}" r="2.4" fill="${color}"/>`;
    }
  }

  // 光线: 从光源中心与上下边缘到每个环
  const h = opts.emitterH ?? 0.05;
  const sources: Array<[number, string]> = [[0, '#fde68a'], [h / 2, '#f87171'], [-h / 2, '#34d399']];
  for (const [ys, col] of sources) {
    for (const ring of lens.rings) {
      for (const sgn of [1, -1] as const) {
        const rTarget = sgn * ring.designRadiusM;
        // 入射段: 光源 -> (f, rTarget)
        body += `<line x1="${X(0)}" y1="${Y(ys)}" x2="${X(lens.focalLengthM)}" y2="${Y(rTarget)}" stroke="${col}" stroke-width="0.7" opacity="0.5"/>`;
        let outDeg: number | null = null;
        if (opts.traceFn) outDeg = opts.traceFn(ys, Math.abs(rTarget));
        if (outDeg == null) continue;
        if (sgn < 0) outDeg = -outDeg; // 镜像
        const len = 0.55;
        const z2 = lens.focalLengthM + len * Math.cos((outDeg * Math.PI) / 180);
        const r2 = rTarget + len * Math.sin((outDeg * Math.PI) / 180);
        body += `<line x1="${X(lens.focalLengthM)}" y1="${Y(rTarget)}" x2="${X(z2)}" y2="${Y(r2)}" stroke="${col}" stroke-width="1.1" opacity="0.9"/>`;
      }
    }
  }
  // 光源高度
  body += `<line x1="${X(0) - 12}" y1="${Y(h / 2)}" x2="${X(0) - 12}" y2="${Y(-h / 2)}" stroke="#fff" stroke-width="2"/>`;
  body += `<text x="${X(0) - 16}" y="${Y(0) + 4}" fill="#fff" font-size="11" text-anchor="end" font-family="monospace">h=${(h * 1000).toFixed(0)}mm</text>`;

  body += `<text x="${pad}" y="20" fill="#8fb0c8" font-size="12">子午剖面 · 蓝=折射环 紫=TIR反射棱镜 · 红/绿=光源上下边缘光线</text>`;
  return svgWrap(W, H, body);
}

/** 射程对比条形 */
export function rangeBarsSVG(luminousNM: number, geographicNM: number, finalNM: number, width = 560, height = 210): string {
  const W = width, H = height;
  const m = { l: 110, r: 40, t: 16, b: 34 };
  const iw = W - m.l - m.r;
  const max = Math.max(luminousNM, geographicNM, finalNM) * 1.15;
  const rows: Array<[string, number, string]> = [
    ['光力射程', luminousNM, '#38bdf8'],
    ['地理射程', geographicNM, '#34d399'],
    ['视认射程(取小)', finalNM, '#fbbf24'],
  ];
  let body = '';
  rows.forEach(([label, v, color], i) => {
    const y = m.t + i * 52;
    const w = (v / max) * iw;
    body += `<text x="${m.l - 10}" y="${y + 17}" fill="#cfe3f2" font-size="13" text-anchor="end">${label}</text>`;
    body += `<rect x="${m.l}" y="${y}" width="${iw}" height="26" rx="7" fill="#0c2133"/>`;
    body += `<rect x="${m.l}" y="${y}" width="${w}" height="26" rx="7" fill="${color}" opacity=".85"/>`;
    body += `<text x="${m.l + w + 8}" y="${y + 18}" fill="#fff" font-size="13" font-family="monospace">${v.toFixed(2)} NM</text>`;
  });
  return svgWrap(W, H, body);
}
