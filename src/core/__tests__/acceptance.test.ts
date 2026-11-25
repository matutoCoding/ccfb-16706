import { describe, it, expect } from 'vitest';
import { runAcceptance, checkRangeAccuracy, checkFirstOrderDivergence } from '../acceptance';
import {
  IALA_THRESHOLD_LUX,
  intensityForRangeNM,
  luminousRangeNM,
  transmissivityFromVisibility,
} from '../iala';

describe('IALA 射程公式 (验收点 1, 误差 < 1%)', () => {
  it('复现 IALA/Allard 公开算例 77.2868cd @5NM 与 1393.14cd @10NM (系数取整差异 <0.01%)', () => {
    // 公开算例用取整系数 0.686; 代码用精确 Et*1852^2=0.6859808, 差异极小
    expect(intensityForRangeNM(5, 0.74)).toBeCloseTo(77.29, 1);
    expect(intensityForRangeNM(10, 0.74)).toBeCloseTo(1393.14, 0);
    expect(Math.abs(intensityForRangeNM(5, 0.74) - 77.2868) / 77.2868).toBeLessThan(0.001);
  });

  it('T(10NM)=0.7412 ≈ 0.74, 阈值照度=2e-7 lx', () => {
    expect(transmissivityFromVisibility(10)).toBeCloseTo(0.7412, 3);
    expect(IALA_THRESHOLD_LUX).toBe(2e-7);
  });

  it('光力射程求根与独立参考/往返的最大相对误差 < 1%', () => {
    const rep = checkRangeAccuracy();
    for (const c of rep.cases) {
      expect(c.error, `${c.name}: expected ${c.expected}, got ${c.actual}`).toBeLessThan(1);
    }
    expect(rep.pass).toBe(true);
    expect(rep.maxRelativeError).toBeLessThan(1);
  });

  it('典型值: 77.29cd 在 T=.74 下射程≈5NM', () => {
    expect(luminousRangeNM(77.2868, 10, { transmissivity: 0.74 })).toBeCloseTo(5, 2);
  });
});

describe('一等透镜垂直发散角 (验收点 2, 误差 < 0.1°)', () => {
  const rep = checkFirstOrderDivergence();
  it('几何/Snell 各独立算法最大绝对误差 < 0.1°', () => {
    for (const c of rep.cases) {
      expect(c.error, `${c.name}: expected ${c.expected}, got ${c.actual}`).toBeLessThan(0.1);
    }
    expect(rep.pass).toBe(true);
  });

  it('数值稳定在约 3.11° 全角 (f=0.92m, h=0.05m)', () => {
    expect(rep.detail.geometricFullDeg).toBeCloseTo(3.113, 2);
    expect(rep.detail.chiefTraceFullDeg - rep.detail.geometricFullDeg).toBeLessThan(1e-9);
  });
});

describe('总验收', () => {
  it('runAcceptance().allPass === true', () => {
    const r = runAcceptance();
    // 打印一份可读报告, 便于 node/vitest 输出核查
    console.log('RANGE maxRelErr% =', r.range.maxRelativeError.toExponential(3));
    console.log('DIV maxAbsErr°  =', r.divergence.maxAbsErrorDeg.toExponential(3));
    console.log('DIV detail =', JSON.stringify(r.divergence.detail));
    expect(r.allPass).toBe(true);
  });
});
