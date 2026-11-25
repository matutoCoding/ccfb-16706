/**
 * 菲涅尔透镜环带生成与老图纸环带表导入
 * ------------------------------------------------------------------
 * 子午截面坐标: Z 为光轴(向海, 光传播 +Z), R 为半径/垂直坐标。
 * 焦点(光源名义位置)在原点 (0,0), 设计点 P=(f, r)。
 *
 * 折射环(dioptric): 入射面取“垂直于焦点光线”(法入射, 不偏折),
 *   出射面法线 η 由 Snell 精确解出, 使焦点光线出射后平行光轴:
 *     n sin(α−η) = −sin η,  α=atan2(r,f)
 *     tan η = n sin α / (n cos α − 1)
 *
 * 反射棱镜环(catadioptric/TIR): 法入射 + 全反射面 + 法出射。
 *   TIR 法线角 = 90° + α/2, 把方向 α 反射成 +Z; 出射面法线 0°。
 *
 * 所有面角均为显式数值, 可用独立 Snell 逐线复核。
 * ------------------------------------------------------------------
 */

import type { FresnelLens, LensRing } from './types';
import { D2R, R2D } from './math';

export interface RingTableImportRow {
  /** 环号 */
  no?: number | string;
  kind?: 'refract' | 'tir' | 'R' | 'T' | '折射' | '反射' | string;
  rInner?: number;
  rOuter?: number;
  radius?: number;
  /** 图纸可能直接给角度 */
  entryNormalDeg?: number;
  exitNormalDeg?: number;
  tirNormalDeg?: number;
  thicknessM?: number;
  [k: string]: unknown;
}

/** 由半径与焦距计算焦点光线倾角 */
export function designAlphaRad(r: number, f: number): number {
  return Math.atan2(r, f);
}

/** 折射环出射面法线角(弧度), 精确 Snell 解 */
export function refractExitNormalRad(alpha: number, n: number): number {
  return Math.atan2(n * Math.sin(alpha), n * Math.cos(alpha) - 1);
}

/** TIR 环反射面法线角(弧度) */
export function tirNormalRad(alpha: number): number {
  return Math.PI / 2 + alpha / 2;
}

export interface GenerateRingsOptions {
  focalLengthM: number;
  refractiveIndex: number;
  /** 折射环半径边界(m), 长度 N+1 */
  refractEdgesM: number[];
  /** TIR 环半径边界(m) */
  tirEdgesM?: number[];
  thicknessM?: number;
}

function makeRing(
  index: number,
  kind: 'refract' | 'tir',
  rInner: number,
  rOuter: number,
  f: number,
  n: number,
  thickness: number,
): LensRing {
  const r = 0.5 * (rInner + rOuter);
  const alpha = designAlphaRad(r, f);
  const base: LensRing = {
    index,
    kind,
    radiusM: r,
    rInnerM: rInner,
    rOuterM: rOuter,
    designRadiusM: r,
    entryNormalDeg: alpha * R2D,
    exitNormalDeg: 0,
    thicknessM: thickness,
  };
  if (kind === 'refract') {
    base.exitNormalDeg = refractExitNormalRad(alpha, n) * R2D;
  } else {
    base.tirNormalDeg = tirNormalRad(alpha) * R2D;
    base.exitNormalDeg = 0;
  }
  return base;
}

/** 按环带边界生成完整环带表(折射环在前, TIR 环接续编号) */
export function generateRings(opts: GenerateRingsOptions): LensRing[] {
  const { focalLengthM: f, refractiveIndex: n } = opts;
  const th = opts.thicknessM ?? 0.035;
  const rings: LensRing[] = [];
  let idx = 0;
  const re = opts.refractEdgesM;
  for (let i = 0; i < re.length - 1; i++) {
    rings.push(makeRing(idx++, 'refract', re[i], re[i + 1], f, n, th));
  }
  const te = opts.tirEdgesM ?? [];
  for (let i = 0; i < te.length - 1; i++) {
    rings.push(makeRing(idx++, 'tir', te[i], te[i + 1], f, n, th * 1.4));
  }
  return rings;
}

/** 等宽(可指定环数)构造半径边界 */
export function uniformEdges(r0: number, r1: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(r0 + ((r1 - r0) * i) / count);
  return out;
}

/**
 * 一等透镜(First-order Fresnel)经典参数:
 * 焦距 920 mm, 冕牌玻璃 n≈1.49, 口径约 1.34 m。
 * 折射环覆盖到 α≈43°, 之外用 TIR 棱镜环。
 */
export function createFirstOrderLens(): FresnelLens {
  const f = 0.92;
  const n = 1.49;
  // 折射环 0.06..0.80 m, 18 环; 中心盘单独处理(r<0.06)
  const refractEdges = [0, ...uniformEdges(0.06, 0.8, 18)];
  // TIR 棱镜环 0.82..1.34 m, 12 环
  const tirEdges = uniformEdges(0.82, 1.34, 12);
  const rings = generateRings({ focalLengthM: f, refractiveIndex: n, refractEdgesM: refractEdges, tirEdgesM: tirEdges });
  return {
    id: 'lens-first-order',
    name: '一等菲涅尔透镜 (F=920mm)',
    order: 'first',
    focalLengthM: f,
    refractiveIndex: n,
    apertureRadiusM: 1.34,
    heightM: 2.58,
    rings,
    refractCount: rings.filter((r) => r.kind === 'refract').length,
    tirCount: rings.filter((r) => r.kind === 'tir').length,
  };
}

/** 小型 LED 灯桩透镜: 焦距 0.25m, 全折射环 */
export function createBeaconLens(id = 'lens-beacon', f = 0.25, radius = 0.19, name = 'LED灯桩菲涅尔透镜'): FresnelLens {
  const n = 1.49;
  const edges = [0, ...uniformEdges(0.02, radius, 14)];
  const rings = generateRings({ focalLengthM: f, refractiveIndex: n, refractEdgesM: edges, thicknessM: 0.012 });
  return {
    id,
    name,
    order: 'beacon',
    focalLengthM: f,
    refractiveIndex: n,
    apertureRadiusM: radius,
    heightM: radius * 2.1,
    rings,
    refractCount: rings.length,
    tirCount: 0,
  };
}

/** 四等/中型透镜, 供档案选择 */
export function createFourthOrderLens(): FresnelLens {
  const f = 0.25; // 四等焦距约 250mm
  const n = 1.49;
  const refractEdges = [0, ...uniformEdges(0.02, 0.2, 10)];
  const tirEdges = uniformEdges(0.205, 0.31, 6);
  const rings = generateRings({ focalLengthM: f, refractiveIndex: n, refractEdgesM: refractEdges, tirEdgesM: tirEdges, thicknessM: 0.014 });
  return {
    id: 'lens-fourth-order',
    name: '四等菲涅尔透镜 (F=250mm)',
    order: '4th',
    focalLengthM: f,
    refractiveIndex: n,
    apertureRadiusM: 0.31,
    heightM: 0.62,
    rings,
    refractCount: rings.filter((r) => r.kind === 'refract').length,
    tirCount: rings.filter((r) => r.kind === 'tir').length,
  };
}

function kindNormalize(k: unknown): 'refract' | 'tir' {
  const s = String(k ?? '').trim().toLowerCase();
  if (['tir', 't', 'r-fl', '反射', '全反射', '反射棱镜', 'catadioptric'].includes(s)) return 'tir';
  return 'refract';
}

/**
 * 导入老图纸环带表。支持 CSV 文本或对象数组。
 * CSV 表头可含: no,kind,rInner,rOuter,radius,entryNormalDeg,exitNormalDeg,tirNormalDeg,thicknessM
 * 角度若缺失且给了 radius, 用焦距按精确设计补算。
 */
export function importRingTable(
  data: string | RingTableImportRow[],
  focalLengthM: number,
  refractiveIndex = 1.49,
): LensRing[] {
  let rows: RingTableImportRow[];
  if (typeof data === 'string') {
    const lines = data.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const header = lines[0].split(delim).map((h) => h.trim());
    rows = lines.slice(1).map((line) => {
      const cells = line.split(delim);
      const row: RingTableImportRow = {};
      header.forEach((h, i) => {
        (row as Record<string, unknown>)[h] = cells[i]?.trim();
      });
      return row;
    });
  } else {
    rows = data;
  }

  const num = (v: unknown): number | undefined => {
    if (v == null || v === '') return undefined;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[°度]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };

  return rows.map((row, i) => {
    const rIn = num(row.rInner) ?? num(row.radius) ?? 0;
    const rOut = num(row.rOuter) ?? (num(row.radius) != null ? (num(row.radius) as number) + 0.02 : rIn + 0.02);
    const rMid = num(row.radius) ?? 0.5 * (rIn + rOut);
    const kind = kindNormalize(row.kind);
    const alpha = designAlphaRad(rMid, focalLengthM);
    const entry = num(row.entryNormalDeg) ?? alpha * R2D;
    const exit =
      num(row.exitNormalDeg) ??
      (kind === 'refract' ? refractExitNormalRad(alpha, refractiveIndex) * R2D : 0);
    const tir = num(row.tirNormalDeg) ?? (kind === 'tir' ? tirNormalRad(alpha) * R2D : undefined);
    return {
      index: num(row.no) ?? i,
      kind,
      radiusM: rMid,
      rInnerM: Math.min(rIn, rOut),
      rOuterM: Math.max(rIn, rOut),
      designRadiusM: rMid,
      entryNormalDeg: entry,
      exitNormalDeg: exit,
      tirNormalDeg: tir,
      thicknessM: num(row.thicknessM) ?? 0.03,
      drawingNo: row.no != null ? String(row.no) : undefined,
    } as LensRing;
  });
}

/** 导出可编辑的环带 CSV */
export function exportRingTableCSV(lens: FresnelLens): string {
  const head = 'no,kind,rInner_m,rOuter_m,rMid_m,entryNormal_deg,exitNormal_deg,tirNormal_deg,thickness_m';
  const lines = lens.rings.map((r) =>
    [
      r.index,
      r.kind,
      r.rInnerM.toFixed(5),
      r.rOuterM.toFixed(5),
      r.radiusM.toFixed(5),
      r.entryNormalDeg.toFixed(4),
      r.exitNormalDeg.toFixed(4),
      r.tirNormalDeg != null ? r.tirNormalDeg.toFixed(4) : '',
      r.thicknessM.toFixed(4),
    ].join(','),
  );
  return [head, ...lines].join('\n');
}

/** 示例老图纸环带表文本(一等透镜局部, 含中文表头别名也可) */
export const SAMPLE_DRAWING_CSV = `no,kind,rInner,rOuter,entryNormalDeg,exitNormalDeg
1,refract,0.000,0.060,0,0
2,refract,0.060,0.105,3.27,8.05
3,refract,0.105,0.150,7.97,19.9
4,refract,0.150,0.195,12.0,30.6`;

export { D2R };
