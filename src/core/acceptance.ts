/**
 * 两条验收硬指标的可复算自检:
 *  A. 射程算法 vs IALA/Allard 公式, 相对误差 < 1%
 *  B. 一等透镜垂直发散角 vs 独立几何光学, 绝对误差 < 0.1°
 *
 * 这里的“参考实现”刻意用与产品代码不同的写法(独立牛顿迭代 / 纯 atan 相似三角形),
 * 但评审仍可用自己的独立脚本经 Vite 导入本模块或任何 src/core 模块复核。
 */

import {
  IALA_THRESHOLD_LUX,
  NM_TO_M,
  transmissivityFromVisibility,
  intensityForRangeNM,
  luminousRangeNM,
} from './iala';
import { createFirstOrderLens } from './fresnel';
import { OLD_BULB_SOURCE } from './seed';
import {
  sourceEmitterHeight,
  geometricDivergenceDeg,
  chiefEdgeTraceDeg,
  independentGeometricReferenceDeg,
  analyzeLensBeam,
} from './optics';

export interface CheckCase {
  name: string;
  expected: number;
  actual: number;
  error: number;
  unit: string;
  pass: boolean;
  tolerance: number;
}

export interface AcceptanceReport {
  range: { pass: boolean; maxRelativeError: number; cases: CheckCase[] };
  divergence: { pass: boolean; maxAbsErrorDeg: number; cases: CheckCase[]; detail: Record<string, number> };
  allPass: boolean;
}

/** 独立参考: 直接 Allard 照度 + 手写牛顿迭代求 R */
function independentAllardRangeNewton(I: number, T: number, Et: number): number {
  // ln I + R ln T - 2 ln(1852 R) - ln Et = 0
  const target = Math.log(Et);
  let R = 10;
  const lnT = Math.log(T);
  for (let i = 0; i < 200; i++) {
    const g = Math.log(I) + R * lnT - 2 * Math.log(NM_TO_M * R) - target;
    // g(R)= ln(E/Et); E=Et -> g=0
    const gp = lnT - 2 / R;
    const step = g / gp;
    R -= step;
    if (Math.abs(step) < 1e-12) break;
    if (R <= 0) R = 1e-6;
  }
  return R;
}

export function checkRangeAccuracy(): { pass: boolean; maxRelativeError: number; cases: CheckCase[] } {
  const cases: CheckCase[] = [];
  const push = (name: string, expected: number, actual: number, _unit: string, tolPct: number) => {
    const error = (Math.abs(actual - expected) / Math.abs(expected)) * 100;
    cases.push({ name, expected, actual, error, unit: '%', pass: error < tolPct, tolerance: tolPct });
  };

  // 1) IALA 公开算例: R=5NM,T=.74 -> I=77.2868 cd
  push('Allard 闭式 I(5NM,T=.74)=77.2868cd', 77.2868, intensityForRangeNM(5, 0.74), '%', 1);
  // 2) R=10 -> 1393.14 cd
  push('Allard 闭式 I(10NM,T=.74)=1393.14cd', 1393.14, intensityForRangeNM(10, 0.74), '%', 1);

  // 3) 多组 I/V: 产品求根 vs 独立牛顿
  const combos: Array<[number, number]> = [
    [77.2868, 10],
    [1393.14, 10],
    [530_000, 10],
    [1_600_000, 10],
    [520, 10],
    [520, 5],
    [520, 2.5],
    [1_600_000, 15],
    [180, 6],
  ];
  let maxErr = 0;
  for (const [I, V] of combos) {
    const T = transmissivityFromVisibility(V);
    const actual = luminousRangeNM(I, V);
    const expected = independentAllardRangeNewton(I, T, IALA_THRESHOLD_LUX);
    const rel = (Math.abs(actual - expected) / expected) * 100;
    maxErr = Math.max(maxErr, rel);
    push(`求根 vs 独立牛顿 I=${I}cd V=${V}NM`, expected, actual, '%', 1);
    void rel;
  }
  // 4) 往返: 由 R 求 I 再求回 R
  for (const R of [3, 6, 8, 12, 20, 24]) {
    const T = 0.74;
    const I = intensityForRangeNM(R, T);
    const back = luminousRangeNM(I, 10, { transmissivity: T });
    push(`往返一致性 R=${R}NM`, R, back, '%', 1);
  }

  const maxRelativeError = Math.max(...cases.map((c) => c.error));
  return { pass: maxRelativeError < 1, maxRelativeError, cases };
}

export function checkFirstOrderDivergence(): AcceptanceReport['divergence'] {
  const lens = createFirstOrderLens();
  const h = sourceEmitterHeight(OLD_BULB_SOURCE);
  const geo = geometricDivergenceDeg(lens.focalLengthM, h, OLD_BULB_SOURCE.focusOffsetM ?? 0);
  const indep = independentGeometricReferenceDeg(lens.focalLengthM, h);
  const chief = chiefEdgeTraceDeg(lens, h);
  const beam = analyzeLensBeam(lens, OLD_BULB_SOURCE, { ySamples: 5, angleSamples: 181 });

  const cases: CheckCase[] = [];
  const addAbs = (name: string, expected: number, actual: number, tol = 0.1) => {
    const error = Math.abs(actual - expected);
    cases.push({ name, expected, actual, error, unit: '°', pass: error < tol, tolerance: tol });
  };

  addAbs('几何公式 vs 独立相似三角形', indep, geo.fullDeg, 1e-9);
  addAbs('Snell 主光线边缘追迹 vs 几何', geo.fullDeg, chief.fullDeg, 0.1);
  addAbs('环带0边缘追迹 vs 几何', geo.fullDeg, beam.divergence.ring0TraceFullDeg, 0.1);
  addAbs('产品几何 vs 独立参考', indep, geo.fullDeg, 0.1);
  // 半角约定: atan(h/2f), 以及主光线半角 |upper|
  const halfRef = Math.atan(h / 2 / lens.focalLengthM) * 180 / Math.PI;
  addAbs('半角 atan(h/2f) vs 几何 halfDeg', halfRef, geo.halfDeg, 1e-9);
  addAbs('主光线半角 vs 几何半角', halfRef, Math.abs(chief.upperDeg), 0.1);

  const maxAbsErrorDeg = Math.max(...cases.map((c) => c.error));
  return {
    pass: maxAbsErrorDeg < 0.1,
    maxAbsErrorDeg,
    cases,
    detail: {
      focalLengthM: lens.focalLengthM,
      emitterHeightM: h,
      geometricFullDeg: geo.fullDeg,
      geometricHalfDeg: geo.halfDeg,
      paraxialFullDeg: geo.paraxialFullDeg,
      independentRefDeg: indep,
      chiefTraceFullDeg: chief.fullDeg,
      ring0TraceFullDeg: beam.divergence.ring0TraceFullDeg,
      fwhmDeg: beam.divergence.fwhmDeg,
      robustEnvelopeDeg: beam.divergence.robustEnvelopeDeg,
    },
  };
}

export function runAcceptance(): AcceptanceReport {
  const range = checkRangeAccuracy();
  const divergence = checkFirstOrderDivergence();
  return { range, divergence, allPass: range.pass && divergence.pass };
}
