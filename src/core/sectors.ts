/** 遮挡扇区与红白分界: 方位角工具、海图扇形路径、分界线锐度 */

import type { Sector } from './types';

export function norm360(a: number): number {
  return ((a % 360) + 360) % 360;
}

/** 方位 b 是否落在扇区内(考虑顺时针宽度与跨 0) */
export function inSector(bearing: number, s: Sector): boolean {
  const b = norm360(bearing);
  const start = norm360(s.startBearing);
  const end = start + s.widthDeg; // 展开到 >360
  let x = b;
  if (x < start) x += 360;
  if (x >= start && x <= end) return true;
  // 再试一圈
  x = b + 360;
  return x >= start && x <= end;
}

/**
 * 扇区在方位 b 处的可见/颜色权重, 含边界柔化。
 * edgeSoftnessDeg 越大分界线越糊; 0 = 锐利几何分界。
 * 返回 0..1 的该扇区贡献权重(边界线性过渡)。
 */
export function sectorEdgeWeight(bearing: number, s: Sector): number {
  if (!inSector(bearing, s)) {
    // 边界外的柔化过渡
    const d = distanceToSectorEdge(bearing, s);
    const soft = s.edgeSoftnessDeg ?? 0;
    if (soft <= 0 || d > soft) return 0;
    return 1 - d / soft;
  }
  const dIn = distanceInsideToEdge(bearing, s);
  const soft = s.edgeSoftnessDeg ?? 0;
  if (soft <= 0) return 1;
  return Math.min(1, dIn / soft);
}

/** 到最近扇区边界的角距离(度), 外部为正距离 */
export function distanceToSectorEdge(bearing: number, s: Sector): number {
  const b = norm360(bearing);
  const start = norm360(s.startBearing);
  const end = norm360(start + s.widthDeg);
  const dStart = angularDistance(b, start);
  const dEnd = angularDistance(b, end);
  return Math.min(dStart, dEnd);
}

function distanceInsideToEdge(bearing: number, s: Sector): number {
  return distanceToSectorEdge(bearing, s);
}

export function angularDistance(a: number, b: number): number {
  const d = Math.abs(norm360(a) - norm360(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/** 给定方位, 决定灯光颜色与是否被遮挡(叠加所有扇区) */
export function evaluateBearing(
  bearing: number,
  sectors: Sector[],
): { blocked: boolean; color: 'W' | 'R' | 'G'; occlusion: number; boundaryMix: number } {
  let color: 'W' | 'R' | 'G' = 'W';
  let occlusion = 0; // 0 无遮挡, 1 全遮
  let boundaryMix = 0;
  for (const s of sectors) {
    const w = sectorEdgeWeight(bearing, s);
    if (w <= 0) continue;
    if (s.kind === 'obscured') occlusion = Math.max(occlusion, w);
    if (s.kind === 'red' && w > boundaryMix) {
      color = 'R';
      boundaryMix = w;
    }
    if (s.kind === 'green' && w > boundaryMix) {
      color = 'G';
      boundaryMix = w;
    }
    if (s.kind === 'white' && color === 'W') boundaryMix = Math.max(boundaryMix, w);
  }
  return { blocked: occlusion >= 0.999, color, occlusion, boundaryMix };
}

/**
 * 生成海图扇形的 SVG path (以 cx,cy 为顶点, 半径 rPx)。
 * bearing: 正北 0, 顺时针; SVG 坐标 y 向下。
 */
export function sectorArcPath(cx: number, cy: number, rPx: number, startBearing: number, widthDeg: number): string {
  const p1 = bearingToXY(cx, cy, rPx, startBearing);
  const end = startBearing + widthDeg;
  const p2 = bearingToXY(cx, cy, rPx, end);
  const large = widthDeg > 180 ? 1 : 0;
  // 顺时针方位在 SVG(y 向下) 下也是顺时针 sweep=1
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${rPx} ${rPx} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
}

export function bearingToXY(cx: number, cy: number, r: number, bearingDeg: number): { x: number; y: number } {
  const a = ((bearingDeg - 90) * Math.PI) / 180; // 正北 -> -y
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** 分界线锐度: 由过渡宽度换算梯度 (归一化/度), 供海图与视认页使用 */
export function boundarySharpness(edgeSoftnessDeg: number): { transitionDeg: number; gradientPerDeg: number; label: string } {
  const t = Math.max(0, edgeSoftnessDeg);
  if (t === 0) return { transitionDeg: 0, gradientPerDeg: Infinity, label: '几何锐界' };
  return {
    transitionDeg: t,
    gradientPerDeg: 1 / t,
    label: t < 0.5 ? '锐利' : t < 1.2 ? '中等过渡' : '模糊边缘',
  };
}
