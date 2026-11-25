/**
 * 航标仿真核心领域模型
 * 所有几何角度: 方位角 bearing 为从正北顺时针的度数;
 *              垂直角 elevation 为相对灯轴(水平)向上为正的度数。
 */

export type ID = string;

export interface LatLon {
  lat: number;
  lon: number;
}

/** 扇区种类: 遮挡 / 红光 / 白光 / 绿光 */
export type SectorKind = 'obscured' | 'red' | 'white' | 'green';

export interface Sector {
  id: ID;
  /** 起始方位(度, 正北顺时针) */
  startBearing: number;
  /** 顺时针宽度(度), 可以 > 180 */
  widthDeg: number;
  kind: SectorKind;
  label?: string;
  /** 分界线过渡宽度(度), 0 = 几何锐界; 越大边缘越糊 */
  edgeSoftnessDeg?: number;
  /** 扇区内标称射程覆盖(海里), 不填用灯塔主值 */
  rangeNM?: number;
}

export type SourceKind = 'point' | 'led-array' | 'bulb';

/** 配光曲线采样点: 角度(度, 相对光轴), 光强权重 0..1 或 cd */
export interface CandelaSample {
  angleDeg: number;
  intensity: number;
}

export interface LightSource {
  id: ID;
  name: string;
  kind: SourceKind;
  /** 总光通量 lm */
  lumens: number;
  /** 峰值光强 cd (若给出则优先于 lm 估算) */
  peakCandela?: number;
  /** 光源垂直发光体高度 m (决定垂直发散) */
  emitterHeightM: number;
  /** 光源水平发光体宽度 m */
  emitterWidthM: number;
  /** LED 阵列: 行数 / 列数 / 间距 m */
  arrayRows?: number;
  arrayCols?: number;
  pitchM?: number;
  /** 老式灯泡: 灯丝/玻壳直径 m */
  bulbDiameterM?: number;
  /** 发光角(全角, 度) */
  beamAngleDeg?: number;
  /** 配光曲线(极坐标), intensity 可为相对权重 */
  distribution: CandelaSample[];
  /** 光源相对透镜焦点的轴向偏移 m (+ 远离透镜) */
  focusOffsetM?: number;
  colorK?: number;
  color?: [number, number, number];
}

export type RingKind = 'refract' | 'tir';

/**
 * 菲涅尔透镜单个环带(子午截面)。
 * 几何采用“灯在焦点、出射水平”的精确 Snell 设计, 面角均显式给出,
 * 便于评审/第三方用独立 Snell 光线追踪复核。
 */
export interface LensRing {
  index: number;
  kind: RingKind;
  /** 环带中心半径(光轴到环带) m */
  radiusM: number;
  rInnerM: number;
  rOuterM: number;
  /** 该环带设计采样半径(通常为中分半径) m */
  designRadiusM: number;
  /** 入射面外法线相对 +光轴 的倾角(度) */
  entryNormalDeg: number;
  /** 出射折射面外法线相对 +光轴 的倾角(度) */
  exitNormalDeg: number;
  /** TIR 反射面切线/法线倾角(度), 仅 tir */
  tirNormalDeg?: number;
  /** 环带轴向厚度 m */
  thicknessM: number;
  /** 图纸原始编号/备注 */
  drawingNo?: string;
}

export interface FresnelLens {
  id: ID;
  name: string;
  /** 透镜等级, 如 'first' 一等 / '4th' 四等 / 'beacon' 灯桩 */
  order: string;
  /** 焦距 m (一等透镜经典 0.92m) */
  focalLengthM: number;
  /** 折射率 */
  refractiveIndex: number;
  /** 口径半径 m */
  apertureRadiusM: number;
  /** 透镜总高 m */
  heightM: number;
  rings: LensRing[];
  /** 中心盘/折射环数量与 TIR 棱镜环数量 */
  refractCount?: number;
  tirCount?: number;
}

/** 灯质相位片段 */
export type PhaseKind = 'light' | 'dark';
export interface PhaseStep {
  kind: PhaseKind;
  /** 持续秒 */
  durationS: number;
  /** 该片段光强系数 0..1 (明暗灯用) */
  intensity?: number;
  color?: 'W' | 'R' | 'G';
}

export type CharacterType =
  | 'F'        // 定光 fixed
  | 'Fl'       // 闪光 flashing
  | 'LFl'      // 长闪 long flashing
  | 'Q'        // 快闪 quick
  | 'VQ'       // 甚快闪
  | 'Iso'      // 等明暗 isophase
  | 'Oc'       // 明暗 occulting
  | 'Gr'       // 联闪 group flashing
  | 'Alt'      // 互光 alternating
  | 'Mo'       // 莫尔斯 Morse
  | 'Rot';     // 转动式 rotating beam

export interface LightCharacter {
  id: ID;
  name: string;
  type: CharacterType;
  /** 完整周期 s */
  periodS: number;
  /** 一个周期内的相位序列 */
  phases: PhaseStep[];
  /** 联闪组数, 如 Gr(2) */
  groupCount?: number;
  /** 莫尔斯码, 如 'A' 'U' */
  morse?: string;
  morseUnitS?: number;
  /** 转动式: 转速 秒/圈 或 RPM */
  rotationPeriodS?: number;
  rpm?: number;
  /** 透镜面板数(光束数), 必须与灯质对上 */
  panels?: number;
  /** 射程/光强随相位的有效光强用 */
  nominalCandela?: number;
  colors?: Array<'W' | 'R' | 'G'>;
}

export interface Lighthouse {
  id: ID;
  name: string;
  code: string;
  lat: number;
  lon: number;
  /** 灯高 m (灯光相对平均高潮面) */
  lightHeightM: number;
  structureHeightM?: number;
  nominalRangeNM: number;
  /** 标称射程对应的光强 cd */
  candela?: number;
  lensId?: ID;
  sourceId?: ID;
  characterId?: ID;
  sectors: Sector[];
  order?: string;
  builtYear?: number;
  manufacturer?: string;
  description?: string;
  /** 标签: 老灯塔 / LED 灯桩 */
  tags?: string[];
}

export interface Settings {
  id: 'app';
  observerHeightM: number;
  visibilityNM: number;
  /** 阈值照度 lux */
  thresholdLux: number;
  /** Koschmieder 常数 (0.05 对比阈值 -> 2.996) */
  koschmiederC: number;
  /** 地理射程米制系数 (1.17/sqrt(0.3048)=2.119) */
  geoCoeffM: number;
  fogDensity: number;
  seaReflectivity: number;
  ambientLux: number;
  /** 主题 */
  theme: 'dark' | 'light';
}
