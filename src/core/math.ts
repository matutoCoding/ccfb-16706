/** 纯几何/矢量与折射反射工具 (2D 子午面 + 3D) */

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

export const deg2rad = (d: number) => d * D2R;
export const rad2deg = (r: number) => r * R2D;

export interface V2 {
  x: number;
  y: number;
}
export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v2 = (x: number, y: number): V2 => ({ x, y });
export const add2 = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub2 = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale2 = (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s });
export const dot2 = (a: V2, b: V2) => a.x * b.x + a.y * b.y;
export const len2 = (a: V2) => Math.hypot(a.x, a.y);
export const norm2 = (a: V2): V2 => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};
/** 角度(弧度)对应的二维方向, 约定 atan2(y,x) */
export const dirFromAngle = (rad: number): V2 => ({ x: Math.cos(rad), y: Math.sin(rad) });
export const angleOf = (d: V2) => Math.atan2(d.y, d.x);

export const add3 = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale3 = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/**
 * 矢量形式 Snell 折射。
 * @param I 入射方向(单位, 指向界面)
 * @param N 面法线(单位, 方向任意, 内部会翻到与 I 相反)
 * @param eta n1/n2 (入射侧折射率 / 出射侧折射率)
 * @returns 折射方向; 全反射时返回 null
 */
export function refract3(I: V3, N: V3, eta: number): V3 | null {
  let n = N;
  let cosi = -dot3(I, n);
  if (cosi < 0) {
    n = scale3(n, -1);
    cosi = -dot3(I, n);
  }
  const sin2t = eta * eta * (1 - cosi * cosi);
  if (sin2t > 1) return null; // TIR
  const cost = Math.sqrt(Math.max(0, 1 - sin2t));
  // T = eta*I + (eta*cosi - cost)*N
  return norm3({
    x: eta * I.x + (eta * cosi - cost) * n.x,
    y: eta * I.y + (eta * cosi - cost) * n.y,
    z: eta * I.z + (eta * cosi - cost) * n.z,
  });
}

/** 反射 */
export function reflect3(I: V3, N: V3): V3 {
  const d = dot3(I, N);
  return norm3(sub3(I, scale3(N, 2 * d)));
}

/** 二维 Snell(带符号角), n1 sin θ1 = n2 sin θ2; 返回折射方向角(弧度), TIR 返回 null */
export function snellAngle(incidentRad: number, normalRad: number, n1: number, n2: number): number | null {
  let theta1 = incidentRad - normalRad;
  // 归一到 [-PI, PI]
  while (theta1 > Math.PI) theta1 -= 2 * Math.PI;
  while (theta1 < -Math.PI) theta1 += 2 * Math.PI;
  const s = (n1 / n2) * Math.sin(theta1);
  if (Math.abs(s) > 1) return null;
  // asin 结果自带符号, 直接加回法线角
  const theta2 = Math.asin(s);
  return normalRad + theta2;
}

/** 二分求根: f(x)=target (f 单调递减为正) */
export function bisectRoot(
  f: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
  tol = 1e-10,
  maxIter = 200,
): number {
  let flo = f(lo) - target;
  let fhi = f(hi) - target;
  if (flo * fhi > 0) {
    // 扩展上界
    for (let i = 0; i < 60 && Math.sign(f(hi) - target) === Math.sign(flo); i++) hi *= 2;
    fhi = f(hi) - target;
    if (flo * fhi > 0) return NaN;
  }
  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid) - target;
    if (Math.abs(fm) < tol || hi - lo < tol) return mid;
    if (flo * fm <= 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return 0.5 * (lo + hi);
}

/** 稳定的直方图统计 */
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
