/** 灯质编排: 相位展开、莫尔斯码、转动式转速/面板一致性 */

import type { LightCharacter, PhaseStep } from './types';

export const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
  H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
  O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
  V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
};

/** 由类型与参数构造规范相位序列 */
export function buildPhases(input: {
  type: LightCharacter['type'];
  periodS: number;
  flashS?: number;
  eclipseS?: number;
  groupCount?: number;
  morse?: string;
  morseUnitS?: number;
  color?: 'W' | 'R' | 'G';
}): PhaseStep[] {
  const c = input.color ?? 'W';
  const flash = input.flashS ?? 0.5;
  const eclipse = input.eclipseS ?? 1.5;
  const g = Math.max(1, input.groupCount ?? 1);
  switch (input.type) {
    case 'F':
      return [{ kind: 'light', durationS: input.periodS, intensity: 1, color: c }];
    case 'Fl':
    case 'LFl': {
      const fl = input.type === 'LFl' ? Math.max(2, flash * 4) : flash;
      return [
        { kind: 'light', durationS: fl, intensity: 1, color: c },
        { kind: 'dark', durationS: Math.max(0.05, input.periodS - fl), intensity: 0 },
      ];
    }
    case 'Q': {
      // 快闪: 亮暗各半, 周期通常 1s
      const on = input.periodS / 2;
      return [
        { kind: 'light', durationS: on, intensity: 1, color: c },
        { kind: 'dark', durationS: on, intensity: 0 },
      ];
    }
    case 'Iso': {
      const half = input.periodS / 2;
      return [
        { kind: 'light', durationS: half, intensity: 1, color: c },
        { kind: 'dark', durationS: half, intensity: 0 },
      ];
    }
    case 'Oc': {
      // 明暗: 暗时长于/等于闪; 这里用给定 eclipse
      const dark = Math.min(eclipse, input.periodS - flash);
      return [
        { kind: 'light', durationS: input.periodS - dark, intensity: 1, color: c },
        { kind: 'dark', durationS: dark, intensity: 0 },
      ];
    }
    case 'Gr': {
      const gap = 0.6;
      const cycle = g * flash + (g - 1) * gap;
      const tail = Math.max(0.1, input.periodS - cycle);
      const phases: PhaseStep[] = [];
      for (let i = 0; i < g; i++) {
        phases.push({ kind: 'light', durationS: flash, intensity: 1, color: c });
        phases.push({ kind: 'dark', durationS: i < g - 1 ? gap : tail, intensity: 0 });
      }
      return phases;
    }
    case 'Alt': {
      const half = input.periodS / 2;
      return [
        { kind: 'light', durationS: half, intensity: 1, color: 'R' },
        { kind: 'light', durationS: half, intensity: 1, color: 'W' },
      ];
    }
    case 'Mo':
      return morsePhases(input.morse ?? 'A', input.morseUnitS ?? 0.4, c);
    case 'Rot':
      return [
        { kind: 'light', durationS: flash, intensity: 1, color: c },
        { kind: 'dark', durationS: Math.max(0.05, input.periodS - flash), intensity: 0 },
      ];
    default:
      return [];
  }
}

/** 莫尔斯码 -> 亮暗相位 (点=1u, 划=3u, 码内间隔1u, 字符间隔3u, 词间隔7u) */
export function morsePhases(text: string, unitS: number, color: 'W' | 'R' | 'G' = 'W'): PhaseStep[] {
  const code = MORSE[text.toUpperCase()] ?? '';
  const phases: PhaseStep[] = [];
  code.split('').forEach((sym, i) => {
    phases.push({ kind: 'light', durationS: (sym === '.' ? 1 : 3) * unitS, intensity: 1, color });
    phases.push({ kind: 'dark', durationS: unitS, intensity: 0 }); // 码内间隔
    void i;
  });
  // 末尾把最后一个 1u 间隔扩展到字符间隔 3u
  if (phases.length) phases[phases.length - 1].durationS = 3 * unitS;
  return phases;
}

export interface TimelineSample {
  t: number;
  on: boolean;
  intensity: number;
  color?: 'W' | 'R' | 'G';
}

/** 取周期内某时刻状态 */
export function sampleCharacter(ch: LightCharacter, timeS: number): TimelineSample {
  const period = ch.periodS || 1;
  let t = ((timeS % period) + period) % period;
  const phases = ch.phases?.length ? ch.phases : buildPhases({ type: ch.type, periodS: period, groupCount: ch.groupCount, morse: ch.morse, morseUnitS: ch.morseUnitS });
  for (const p of phases) {
    if (t < p.durationS) {
      return { t: timeS, on: p.kind === 'light', intensity: p.kind === 'light' ? p.intensity ?? 1 : 0, color: p.color };
    }
    t -= p.durationS;
  }
  const last = phases[phases.length - 1];
  return { t: timeS, on: last?.kind === 'light', intensity: last?.intensity ?? 0, color: last?.color };
}

/** 生成时间轴条带(用于 DOM/canvas) */
export function timelineBlocks(ch: LightCharacter): Array<PhaseStep & { startS: number; endS: number }> {
  let t = 0;
  const phases = ch.phases?.length ? ch.phases : buildPhases({ type: ch.type, periodS: ch.periodS, groupCount: ch.groupCount, morse: ch.morse, morseUnitS: ch.morseUnitS });
  return phases.map((p) => {
    const block = { ...p, startS: t, endS: t + p.durationS };
    t += p.durationS;
    return block;
  });
}

export interface RotationCheck {
  consistent: boolean;
  rpm: number;
  flashIntervalS: number;
  expectedPeriodS: number;
  message: string;
  flashesPerRevolution: number;
}

/**
 * 转动式灯塔一致性: P 个面板 -> 每转 P 闪, 闪光间隔 T_rot/P。
 * 单闪灯质周期应等于该间隔(或其整数组周期)。
 */
export function checkRotationConsistency(ch: LightCharacter): RotationCheck {
  const panels = Math.max(1, ch.panels ?? 1);
  const rotS = ch.rotationPeriodS ?? (ch.rpm ? 60 / ch.rpm : ch.periodS * panels);
  const rpm = ch.rpm ?? 60 / rotS;
  const interval = rotS / panels;
  // 允许灯质周期 = 间隔的整数倍(分组)
  const k = Math.round(ch.periodS / interval);
  const expectedPeriod = interval;
  const consistent = Math.abs(k * interval - ch.periodS) < 0.06 || Math.abs(interval - ch.periodS) < 0.06;
  return {
    consistent,
    rpm,
    flashIntervalS: interval,
    expectedPeriodS: expectedPeriod,
    flashesPerRevolution: panels,
    message: consistent
      ? `${panels} 面板 × ${rpm.toFixed(2)} rpm → 每 ${interval.toFixed(2)}s 一闪, 与灯质周期 ${ch.periodS}s 一致`
      : `转速/面板不匹配: ${panels} 面板在 ${rotS}s/转 下应每 ${interval.toFixed(2)}s 一闪, 灯质周期为 ${ch.periodS}s`,
  };
}

/** 灯质的国际标号文本, 如 Fl(3) W 15s / Mo(A) W 8s / Alt WR 12s */
export function characterNotation(ch: LightCharacter): string {
  const col = ch.colors && ch.colors.length > 1 ? ch.colors.join('').replace('W', 'W').replace('R', 'R') : (ch.colors?.[0] ?? 'W');
  switch (ch.type) {
    case 'F': return `F ${col} ${ch.periodS}s`;
    case 'Fl': return `Fl ${col} ${ch.periodS}s`;
    case 'LFl': return `LFl ${col} ${ch.periodS}s`;
    case 'Q': return `Q ${col} ${ch.periodS}s`;
    case 'VQ': return `VQ ${col} ${ch.periodS}s`;
    case 'Iso': return `Iso ${col} ${ch.periodS}s`;
    case 'Oc': return `Oc ${col} ${ch.periodS}s`;
    case 'Gr': return `Fl(${ch.groupCount ?? 2}) ${col} ${ch.periodS}s`;
    case 'Alt': return `Al ${ch.colors?.join('') ?? 'WR'} ${ch.periodS}s`;
    case 'Mo': return `Mo(${ch.morse ?? 'A'}) ${col} ${ch.periodS}s`;
    case 'Rot': return `Rot ${col} ${ch.periodS}s`;
    default: return `${ch.type} ${col} ${ch.periodS}s`;
  }
}
