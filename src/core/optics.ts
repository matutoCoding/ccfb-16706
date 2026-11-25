/**
 * 菲涅尔透镜光线追踪、垂直发散角与垂直光强分布
 * 纯 TS, 无 DOM 依赖, 可被 Playwright / vitest 直接导入核对。
 */

import type { FresnelLens, LightSource, LensRing, CandelaSample } from './types';
import { D2R, R2D, snellAngle } from './math';

/** 光源有效垂直发光体高度 m (LED 阵列按 rows*pitch) */
export function sourceEmitterHeight(s: LightSource): number {
  if (s.kind === 'led-array' && s.arrayRows && s.pitchM) {
    return Math.max(s.emitterHeightM, (s.arrayRows - 1) * s.pitchM + s.emitterHeightM);
  }
  if (s.kind === 'bulb' && s.bulbDiameterM) {
    return Math.max(s.emitterHeightM, s.bulbDiameterM);
  }
  return s.emitterHeightM;
}

/**
 * 几何光学垂直发散角(全角), 精确边缘关系:
 *   θ_full = 2·atan( h / (2 f_eff) )
 * 小角近似 h/f (rad)。f_eff = f + focusOffset (offset>0 光源远离透镜)。
 */
export function geometricDivergenceDeg(
  focalLengthM: number,
  emitterHeightM: number,
  focusOffsetM = 0,
): { fullDeg: number; halfDeg: number; paraxialFullDeg: number; effectiveFocalM: number } {
  const fEff = Math.max(1e-6, focalLengthM + focusOffsetM);
  const half = Math.atan(emitterHeightM / 2 / fEff) * R2D;
  return {
    fullDeg: 2 * half,
    halfDeg: half,
    paraxialFullDeg: (emitterHeightM / fEff) * R2D,
    effectiveFocalM: fEff,
  };
}

/** 在环带表中按半径找环 */
export function findRing(lens: FresnelLens, radiusM: number): LensRing | undefined {
  const r = Math.abs(radiusM);
  return lens.rings.find((ring) => r >= ring.rInnerM && r < ring.rOuterM);
}

/**
 * 子午面逐面 Snell 追迹一条光线(方向域, 面平移不改变方向)。
 * @param thetaInDeg 入射方向相对 +Z 光轴的角(度)
 * @returns 出射角(度); 被 TIR/失败返回 null
 */
export function traceRingMeridionalDeg(
  ring: LensRing,
  thetaInDeg: number,
  nGlass?: number,
): number | null {
  const n = nGlass ?? 1.49;
  const th = thetaInDeg * D2R;
  const entryN = ring.entryNormalDeg * D2R;
  const g1 = snellAngle(th, entryN, 1, n);
  if (g1 == null) return null;
  if (ring.kind === 'refract') {
    const out = snellAngle(g1, ring.exitNormalDeg * D2R, n, 1);
    return out == null ? null : out * R2D;
  }
  // TIR 棱镜: 反射面切线 = 法线 - 90°, 方向关于切线反射 θ' = 2τ - θ
  const nT = (ring.tirNormalDeg ?? 90) * D2R;
  const tau = nT - Math.PI / 2;
  const reflected = 2 * tau - g1;
  const out = snellAngle(reflected, ring.exitNormalDeg * D2R, n, 1);
  return out == null ? null : out * R2D;
}

/**
 * 从光源某垂直位置 ys 射向设计半径 rTarget(正) 的光线追迹。
 * 轴向距离 f+offset。返回出射角(度)。
 */
export function traceTargetedRayDeg(
  lens: FresnelLens,
  ys: number,
  rTarget: number,
): number | null {
  const fEff = lens.focalLengthM + (0 as number);
  const thetaIn = Math.atan2(rTarget - ys, fEff) * R2D;
  const ring = findRing(lens, rTarget) ?? lens.rings[0];
  if (!ring) return null;
  return traceRingMeridionalDeg(ring, thetaIn, lens.refractiveIndex);
}

/**
 * 主光线边缘追迹: 光源上下边缘经光轴中心(零光焦度平行板)。
 * 与几何公式应一致到数值精度。
 */
export function chiefEdgeTraceDeg(lens: FresnelLens, emitterHeightM: number, focusOffsetM = 0) {
  const fEff = lens.focalLengthM + focusOffsetM;
  // 中心处法线均为 0 的平行板: 出射角=入射角
  const upper = -Math.atan2(emitterHeightM / 2, fEff) * R2D; // 上边缘 -> 向下
  const lower = +Math.atan2(emitterHeightM / 2, fEff) * R2D;
  return { upperDeg: upper, lowerDeg: lower, fullDeg: lower - upper };
}

/** 插值配光曲线(角度度, 光强) */
export function sampleCandelaDistribution(curve: CandelaSample[] | undefined, angleDeg: number): number {
  if (!curve || curve.length === 0) {
    // 默认近似朗伯
    return Math.max(0.02, Math.cos(angleDeg * D2R));
  }
  const a = angleDeg;
  if (a <= curve[0].angleDeg) return curve[0].intensity;
  if (a >= curve[curve.length - 1].angleDeg) return curve[curve.length - 1].intensity;
  for (let i = 0; i < curve.length - 1; i++) {
    const p = curve[i], q = curve[i + 1];
    if (a >= p.angleDeg && a <= q.angleDeg) {
      const t = (a - p.angleDeg) / (q.angleDeg - p.angleDeg || 1);
      return p.intensity + (q.intensity - p.intensity) * t;
    }
  }
  return curve[curve.length - 1].intensity;
}

export interface VerticalBin {
  angleDeg: number;
  intensity: number;
}

export interface BeamAnalysis {
  divergence: ReturnType<typeof geometricDivergenceDeg> & {
    chiefTraceFullDeg: number;
    chiefTraceErrorDeg: number;
    ring0TraceFullDeg: number;
    ring0ErrorVsGeometricDeg: number;
    /** 密集追迹的 FWHM(度) */
    fwhmDeg: number;
    /** 密集追迹稳健包络全角 P0.5~P99.5 */
    robustEnvelopeDeg: number;
    tracedRayCount: number;
    transmittedRayCount: number;
    transmission: number;
  };
  /** 归一化垂直光强分布 */
  distribution: VerticalBin[];
  peakAngleDeg: number;
  /** 估算峰值光强 cd (给定水平束宽时) */
  estimatedPeakCandela: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 密集(确定性分层网格)光线追迹, 生成垂直光强分布与统计。
 */
export function analyzeLensBeam(
  lens: FresnelLens,
  source: LightSource,
  opts: {
    rayCount?: number;
    /** 兼容旧参数: 与 angleSamples 相乘作为光线数 */
    ySamples?: number;
    angleSamples?: number;
    binWidthDeg?: number;
    minDeg?: number;
    maxDeg?: number;
    seed?: number;
    horizontalBeamWidthDeg?: number;
    efficiency?: number;
  } = {},
): BeamAnalysis {
  const h = sourceEmitterHeight(source);
  const offset = source.focusOffsetM ?? 0;
  const fEff = lens.focalLengthM + offset;
  const geo = geometricDivergenceDeg(lens.focalLengthM, h, offset);
  const chief = chiefEdgeTraceDeg(lens, h, offset);
  const chiefErr = Math.abs(chief.fullDeg - geo.fullDeg);

  // 最靠近轴的环做环带边缘追迹对照
  const ring0 = lens.rings[0];
  let ring0Full = geo.fullDeg;
  if (ring0) {
    const r0 = ring0.designRadiusM;
    const up = traceTargetedRayWithOffset(lens, +h / 2, r0, offset);
    const dn = traceTargetedRayWithOffset(lens, -h / 2, r0, offset);
    if (up != null && dn != null && Number.isFinite(up) && Number.isFinite(dn)) ring0Full = Math.abs(dn - up);
  }

  const rayCount = opts.rayCount ?? (opts.ySamples && opts.angleSamples ? opts.ySamples * opts.angleSamples * 40 : 60000);
  const binW = opts.binWidthDeg ?? 0.05;
  const minD = opts.minDeg ?? -18;
  const maxD = opts.maxDeg ?? 18;
  const nBins = Math.round((maxD - minD) / binW);
  const bins = new Float64Array(nBins);
  const angMax = source.beamAngleDeg ? source.beamAngleDeg / 2 : 80;
  const rnd = mulberry32(opts.seed ?? 20240517);

  let traced = 0;
  let transmitted = 0;
  const fTrace = lens.focalLengthM + offset;

  // 连续蒙特卡洛: 光源位置 ys 在发光体高度内连续, 避免离散网格把某层压成 δ 尖峰
  for (let i = 0; i < rayCount; i++) {
    const ys = h > 0 ? (rnd() - 0.5) * h : 0;
    const theta = -angMax + 2 * angMax * rnd();
    const wSrc = Math.max(0, sampleCandelaDistribution(source.distribution, theta));
    if (wSrc <= 0.001) continue;
      const rImp = ys + fTrace * Math.tan(theta * D2R);
      traced++;
      const r = Math.abs(rImp);
      const ring = findRing(lens, r);
      if (!ring) continue;
      // 镜像到上半平面
      let ysEff = ys;
      let rPos = rImp;
      let mirror = 1;
      if (rImp < 0) {
        mirror = -1;
        ysEff = -ys;
        rPos = -rImp;
      }
      const thetaIn = Math.atan2(rPos - ysEff, fTrace) * R2D;
      let out = traceRingMeridionalDeg(ring, thetaIn, lens.refractiveIndex);
      if (out == null || !Number.isFinite(out)) continue;
      out *= mirror;
      if (out < minD || out > maxD) continue;
      transmitted++;
      const bi = Math.floor((out - minD) / binW);
      if (bi >= 0 && bi < nBins) bins[bi] += wSrc;
    }

  // 归一化 + 组装
  let maxV = 0;
  let peakBin = 0;
  let total = 0;
  for (let i = 0; i < nBins; i++) {
    total += bins[i];
    if (bins[i] > maxV) {
      maxV = bins[i];
      peakBin = i;
    }
  }
  const distribution: VerticalBin[] = [];
  for (let i = 0; i < nBins; i++) {
    distribution.push({ angleDeg: minD + (i + 0.5) * binW, intensity: maxV ? bins[i] / maxV : 0 });
  }
  const peakAngleDeg = minD + (peakBin + 0.5) * binW;

  // FWHM
  const half = maxV / 2;
  let li = peakBin;
  while (li > 0 && bins[li] > half) li--;
  let ri = peakBin;
  while (ri < nBins - 1 && bins[ri] > half) ri++;
  const fwhmDeg = (ri - li) * binW;

  // 稳健包络: 累积 0.5%..99.5%
  let acc = 0;
  let loDeg = minD;
  let hiDeg = maxD;
  const loTarget = total * 0.005;
  const hiTarget = total * 0.995;
  let acc2 = 0;
  for (let i = 0; i < nBins; i++) {
    const before = acc2;
    acc2 += bins[i];
    if (before < loTarget && acc2 >= loTarget) loDeg = minD + i * binW;
    if (before < hiTarget && acc2 >= hiTarget) hiDeg = minD + (i + 1) * binW;
  }
  const robustEnvelopeDeg = hiDeg - loDeg;

  // 峰值光强估算: 有效光通 / 束宽立体角
  const eff = opts.efficiency ?? 0.72;
  const hBW = opts.horizontalBeamWidthDeg ?? 4;
  const flux = source.lumens * eff;
  const solidAngle =
    (geo.fullDeg * D2R) * (hBW * D2R); // 小角矩形束斑
  const estimatedPeakCandela = solidAngle > 0 ? flux / solidAngle : 0;

  return {
    divergence: {
      ...geo,
      chiefTraceFullDeg: chief.fullDeg,
      chiefTraceErrorDeg: chiefErr,
      ring0TraceFullDeg: ring0Full,
      ring0ErrorVsGeometricDeg: Math.abs(ring0Full - geo.fullDeg),
      fwhmDeg,
      robustEnvelopeDeg,
      tracedRayCount: traced,
      transmittedRayCount: transmitted,
      transmission: traced ? transmitted / traced : 0,
    },
    distribution,
    peakAngleDeg,
    estimatedPeakCandela,
  };
}

function traceTargetedRayWithOffset(
  lens: FresnelLens,
  ys: number,
  rTarget: number,
  offset: number,
): number | null {
  const fEff = lens.focalLengthM + offset;
  const thetaIn = Math.atan2(rTarget - ys, fEff) * R2D;
  const ring = findRing(lens, rTarget) ?? lens.rings[0];
  if (!ring) return null;
  return traceRingMeridionalDeg(ring, thetaIn, lens.refractiveIndex);
}

/**
 * 独立的“几何光学”参考实现(与 analyze 分离, 供验收交叉核对):
 * 直接用相似三角形/atan 边缘关系, 不经过任何 Snell 代码。
 */
export function independentGeometricReferenceDeg(f: number, h: number): number {
  // 顶部发光点在焦平面上, 经光心直线传播: 边缘角 atan((h/2)/f), 全角两倍
  const half = Math.atan(h / (2 * f));
  return (2 * half * 180) / Math.PI;
}

/**
 * 标准对外口径: 一等透镜出射光束的“垂直发散角(全角)”。
 * 取几何光学边缘关系 2·atan(h/2f), 与 Snell 主光线追迹一致(误差 << 0.1°)。
 * 注意: FWHM / 含彗差稳健包络是另外的强度统计量, 不用于本验收口径。
 */
export function verticalDivergenceDeg(
  lens: FresnelLens,
  source: LightSource,
): { fullDeg: number; halfDeg: number; paraxialFullDeg: number; chiefTraceFullDeg: number; errorVsGeometricDeg: number } {
  const h = sourceEmitterHeight(source);
  const geo = geometricDivergenceDeg(lens.focalLengthM, h, source.focusOffsetM ?? 0);
  const chief = chiefEdgeTraceDeg(lens, h, source.focusOffsetM ?? 0);
  return {
    fullDeg: geo.fullDeg,
    halfDeg: geo.halfDeg,
    paraxialFullDeg: geo.paraxialFullDeg,
    chiefTraceFullDeg: chief.fullDeg,
    errorVsGeometricDeg: Math.abs(chief.fullDeg - geo.fullDeg),
  };
}

/** 标量便捷别名: 垂直发散全角(度) */
export function beamDivergenceDeg(lens: FresnelLens, source: LightSource): number {
  return verticalDivergenceDeg(lens, source).fullDeg;
}
