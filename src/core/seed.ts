import type { FresnelLens, LightSource, LightCharacter, Lighthouse, Settings } from './types';
import { createFirstOrderLens, createBeaconLens } from './fresnel';
import { candelaFromNominalRangeNM } from './iala';

/** 一等透镜老灯塔配用的老式白炽灯泡(验收基准光源) */
export const OLD_BULB_SOURCE: LightSource = {
  id: 'src-old-bulb',
  name: '1kW 溴钨灯泡(原灯)',
  kind: 'bulb',
  lumens: 22000,
  emitterHeightM: 0.05,
  emitterWidthM: 0.03,
  bulbDiameterM: 0.05,
  beamAngleDeg: 220,
  focusOffsetM: 0,
  colorK: 2900,
  color: [1, 0.78, 0.45],
  distribution: [
    { angleDeg: -90, intensity: 0.15 },
    { angleDeg: -60, intensity: 0.55 },
    { angleDeg: -30, intensity: 0.92 },
    { angleDeg: 0, intensity: 1 },
    { angleDeg: 30, intensity: 0.92 },
    { angleDeg: 60, intensity: 0.55 },
    { angleDeg: 90, intensity: 0.15 },
  ],
};

export const LED_ARRAY_SOURCE: LightSource = {
  id: 'src-led-array',
  name: 'CREE 大功率 LED 阵列 6×2',
  kind: 'led-array',
  lumens: 4200,
  emitterHeightM: 0.036,
  emitterWidthM: 0.12,
  arrayRows: 6,
  arrayCols: 2,
  pitchM: 0.007,
  beamAngleDeg: 120,
  focusOffsetM: 0,
  colorK: 6200,
  color: [0.85, 0.92, 1],
  distribution: [
    { angleDeg: -60, intensity: 0.5 },
    { angleDeg: -30, intensity: 0.9 },
    { angleDeg: 0, intensity: 1 },
    { angleDeg: 30, intensity: 0.9 },
    { angleDeg: 60, intensity: 0.5 },
  ],
};

export const POINT_SOURCE: LightSource = {
  id: 'src-point',
  name: '理想点光源(焦点)',
  kind: 'point',
  lumens: 1000,
  emitterHeightM: 0,
  emitterWidthM: 0,
  beamAngleDeg: 180,
  focusOffsetM: 0,
  colorK: 5800,
  color: [1, 1, 1],
  distribution: [{ angleDeg: -90, intensity: 1 }, { angleDeg: 90, intensity: 1 }],
};

export const BULB_SMALL_SOURCE: LightSource = {
  id: 'src-bulb-small',
  name: '老式白炽灯泡 220V/200W',
  kind: 'bulb',
  lumens: 2800,
  emitterHeightM: 0.028,
  emitterWidthM: 0.02,
  bulbDiameterM: 0.06,
  beamAngleDeg: 240,
  focusOffsetM: 0,
  colorK: 2700,
  color: [1, 0.72, 0.4],
  distribution: [
    { angleDeg: -90, intensity: 0.2 },
    { angleDeg: 0, intensity: 1 },
    { angleDeg: 90, intensity: 0.2 },
  ],
};

export function seedLenses(): FresnelLens[] {
  const first = createFirstOrderLens();
  const beacon1 = createBeaconLens('lens-beacon-baisha', 0.25, 0.18, '白沙咀灯桩透镜 F=250');
  const beacon2 = createBeaconLens('lens-beacon-xingjiao', 0.18, 0.13, '星礁灯桩透镜 F=180');
  return [first, beacon1, beacon2];
}

export function seedSources(): LightSource[] {
  return [
    OLD_BULB_SOURCE,
    LED_ARRAY_SOURCE,
    { ...POINT_SOURCE, id: 'src-point-beacon', name: 'LED 集成点光源', emitterHeightM: 0.012, emitterWidthM: 0.012 },
    BULB_SMALL_SOURCE,
  ];
}

export function seedCharacters(): LightCharacter[] {
  return [
    {
      id: 'char-dongming',
      name: '闪白 10s (转动 4 面板)',
      type: 'Fl',
      periodS: 10,
      phases: [
        { kind: 'light', durationS: 0.6, intensity: 1, color: 'W' },
        { kind: 'dark', durationS: 9.4, intensity: 0 },
      ],
      rotationPeriodS: 40,
      rpm: 1.5,
      panels: 4,
      nominalCandela: 1_600_000,
      colors: ['W'],
    },
    {
      id: 'char-baisha',
      name: '联闪(2)白 6s',
      type: 'Gr',
      periodS: 6,
      groupCount: 2,
      phases: [
        { kind: 'light', durationS: 0.3, intensity: 1, color: 'W' },
        { kind: 'dark', durationS: 0.7, intensity: 0 },
        { kind: 'light', durationS: 0.3, intensity: 1, color: 'W' },
        { kind: 'dark', durationS: 4.7, intensity: 0 },
      ],
      nominalCandela: 520,
      colors: ['W'],
    },
    {
      id: 'char-xingjiao',
      name: '莫尔斯 A · 白 8s',
      type: 'Mo',
      periodS: 8,
      morse: 'A',
      morseUnitS: 0.5,
      phases: [],
      nominalCandela: 180,
      colors: ['W'],
    },
    {
      id: 'char-alt-demo',
      name: '互光 红白 12s',
      type: 'Alt',
      periodS: 12,
      phases: [
        { kind: 'light', durationS: 6, intensity: 1, color: 'R' },
        { kind: 'light', durationS: 6, intensity: 1, color: 'W' },
      ],
      colors: ['R', 'W'],
    },
  ];
}

export function seedLighthouses(): Lighthouse[] {
  return [
    {
      id: 'lh-dongmingshan',
      name: '东溟山灯塔',
      code: 'A-1001',
      lat: 30.7264,
      lon: 122.8531,
      lightHeightM: 92,
      structureHeightM: 24.6,
      nominalRangeNM: 24,
      candela: Math.round(candelaFromNominalRangeNM(24) / 100) * 100, // ≈5.3e5, 与标称射程严格自洽
      lensId: 'lens-first-order',
      sourceId: 'src-old-bulb',
      characterId: 'char-dongming',
      order: '一等',
      builtYear: 1899,
      manufacturer: 'Barbier Bénard (巴黎)',
      description: '百年一等菲涅尔透镜老塔, 原配溴钨灯泡, 拟评估 LED 改造后的发散与射程变化。',
      tags: ['老灯塔', '一等透镜'],
      sectors: [
        { id: 'sec-dm-1', startBearing: 32, widthDeg: 46, kind: 'red', label: '危险物红光扇区', edgeSoftnessDeg: 0.4 },
        { id: 'sec-dm-2', startBearing: 78, widthDeg: 168, kind: 'white', label: '主航道白光', edgeSoftnessDeg: 0.25 },
        { id: 'sec-dm-3', startBearing: 246, widthDeg: 38, kind: 'obscured', label: '山体遮挡', edgeSoftnessDeg: 1.2 },
      ],
    },
    {
      id: 'lh-baishazui',
      name: '白沙咀灯桩',
      code: 'B-2207',
      lat: 30.4128,
      lon: 122.1367,
      lightHeightM: 18,
      structureHeightM: 12,
      nominalRangeNM: 8,
      candela: Math.round(candelaFromNominalRangeNM(8)),
      lensId: 'lens-beacon-baisha',
      sourceId: 'src-led-array',
      characterId: 'char-baisha',
      order: '小型',
      builtYear: 2016,
      manufacturer: '海仪所',
      description: '6×2 大功率 LED 阵列灯桩, 替代原白炽灯泡。',
      tags: ['LED 灯桩'],
      sectors: [
        { id: 'sec-bs-1', startBearing: 300, widthDeg: 24, kind: 'red', label: '礁石红光', edgeSoftnessDeg: 0.6 },
        { id: 'sec-bs-2', startBearing: 324, widthDeg: 200, kind: 'white', label: '航道白光', edgeSoftnessDeg: 0.5 },
        { id: 'sec-bs-3', startBearing: 164, widthDeg: 60, kind: 'obscured', label: '岬角遮挡', edgeSoftnessDeg: 2.0 },
      ],
    },
    {
      id: 'lh-xingjiao',
      name: '星礁灯桩',
      code: 'B-2315',
      lat: 30.1885,
      lon: 122.4722,
      lightHeightM: 12,
      structureHeightM: 8.5,
      nominalRangeNM: 6,
      candela: Math.round(candelaFromNominalRangeNM(6)),
      lensId: 'lens-beacon-xingjiao',
      sourceId: 'src-point-beacon',
      characterId: 'char-xingjiao',
      order: '小型',
      builtYear: 2021,
      manufacturer: '海仪所',
      description: '集成 LED 点光源莫尔斯码灯桩, 标示星礁危险区。',
      tags: ['LED 灯桩'],
      sectors: [
        { id: 'sec-xj-1', startBearing: 10, widthDeg: 90, kind: 'red', label: '星礁危险红', edgeSoftnessDeg: 0.5 },
        { id: 'sec-xj-2', startBearing: 100, widthDeg: 150, kind: 'white', label: '可航白', edgeSoftnessDeg: 0.5 },
        { id: 'sec-xj-3', startBearing: 250, widthDeg: 120, kind: 'obscured', label: '陆影遮挡', edgeSoftnessDeg: 2.5 },
      ],
    },
  ];
}

export function defaultSettings(): Settings {
  return {
    id: 'app',
    observerHeightM: 5,
    visibilityNM: 10,
    thresholdLux: 2e-7,
    koschmiederC: 2.9957,
    geoCoeffM: 2.1197,
    fogDensity: 0.35,
    seaReflectivity: 0.55,
    ambientLux: 0.02,
    theme: 'dark',
  };
}
