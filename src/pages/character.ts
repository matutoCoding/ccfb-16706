import { state } from '../state';
import { h, field, numInput, selectInput, card, toast, downloadText } from '../ui/dom';
import type { LightCharacter, CharacterType } from '../core/types';
import {
  buildPhases, timelineBlocks, sampleCharacter, checkRotationConsistency,
  characterNotation, MORSE,
} from '../core/characteristic';
import { characteristicSpecText } from '../export';
import type { PageHandle } from './archives';

const TYPE_OPTIONS: Array<[CharacterType, string]> = [
  ['F', '定光 F'], ['Fl', '单闪 Fl'], ['LFl', '长闪 LFl'], ['Q', '快闪 Q'], ['VQ', '甚快闪 VQ'],
  ['Iso', '等明暗 Iso'], ['Oc', '明暗 Oc'], ['Gr', '联闪 Gr(n)'], ['Alt', '互光 Alt'],
  ['Mo', '莫尔斯 Mo'], ['Rot', '转动 Rot'],
];

export function renderCharacter(rerender: () => void): PageHandle {
  const el = h('div', { class: 'page' });
  const lh = state.selectedLighthouse!;
  let ch: LightCharacter = state.characterOf(lh) ?? state.data.characters[0];

  const timelineHost = h('div', {});
  const notationHost = h('div', { class: 'morse-display' });
  const checkHost = h('div', {});
  let playhead: HTMLDivElement | null = null;
  let simTime = 0;
  let playing = true;
  let raf = 0;
  let last = performance.now();

  function commit() { void state.saveCharacter(ch); }

  function rebuildPhasesFromForm() {
    ch.phases = buildPhases({
      type: ch.type, periodS: ch.periodS, groupCount: ch.groupCount,
      morse: ch.morse, morseUnitS: ch.morseUnitS,
    });
    commit();
    renderAll();
  }

  function renderTimeline() {
    timelineHost.replaceChildren();
    const blocks = timelineBlocks(ch);
    const tl = h('div', { class: 'timeline', style: 'position:relative' });
    for (const b of blocks) {
      const widthPct = (b.durationS / ch.periodS) * 100;
      const cls = b.kind === 'light' ? `tl-block light ${b.color ?? ''}` : 'tl-block dark';
      tl.append(h('div', { class: cls, style: `flex:0 0 ${widthPct}%` },
        widthPct > 4 ? `${b.durationS.toFixed(1)}s` : ''));
    }
    playhead = h('div', { style: 'position:absolute;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 8px #fff;left:0' }) as HTMLDivElement;
    tl.append(playhead);
    const ruler = h('div', { class: 'tl-ruler' },
      h('span', {}, '0s'), h('span', {}, `${(ch.periodS / 2).toFixed(1)}s`), h('span', {}, `${ch.periodS}s`));
    timelineHost.append(tl, ruler);
  }

  function renderNotation() {
    notationHost.innerHTML = '';
    notationHost.append(h('div', { style: 'font-size:15px;color:#8fb0c8;letter-spacing:2px;margin-bottom:8px' }, characterNotation(ch)));
    if (ch.type === 'Mo' && ch.morse) {
      const code = MORSE[ch.morse.toUpperCase()] ?? '';
      const row = h('div', {});
      for (const sym of code) {
        row.append(h('span', { class: 'morse-sym', dataset: { sym } }, sym === '.' ? '·' : '—'));
        row.append(h('span', { style: 'display:inline-block;width:14px' }, ' '));
      }
      notationHost.append(h('div', { style: 'font-size:40px;letter-spacing:8px;color:#fbbf24' }, row));
      notationHost.append(h('div', { class: 'dim mt8', style: 'font-size:14px;letter-spacing:1px' }, `莫尔斯 "${ch.morse}" = ${code} · 点=${ch.morseUnitS ?? 0.4}s，划=3 点`));
    } else {
      notationHost.append(h('div', { style: 'font-size:18px;color:#fde68a' }, ch.name));
    }
  }

  function renderCheck() {
    const r = checkRotationConsistency(ch);
    checkHost.replaceChildren(
      h('div', { class: `gate ${r.consistent ? 'pass' : 'fail'}` },
        h('h3', {}, r.consistent ? '✅ 转速 / 面板与灯质一致' : '⚠️ 转速 / 面板与灯质不匹配'),
        h('div', {}, r.message),
        h('div', { class: 'kv mt12' },
          h('dt', {}, '面板数'), h('dd', {}, String(ch.panels ?? 1)),
          h('dt', {}, '转速'), h('dd', {}, `${r.rpm.toFixed(2)} rpm`),
          h('dt', {}, '每转闪光'), h('dd', {}, `${r.flashesPerRevolution} 次`),
          h('dt', {}, '闪光间隔'), h('dd', {}, `${r.flashIntervalS.toFixed(2)} s`),
        ),
      ),
    );
  }

  function renderAll() {
    renderTimeline(); renderNotation(); renderCheck();
  }

  // 播放头 + 莫尔斯点亮
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) simTime = (simTime + dt) % ch.periodS;
    if (playhead) playhead.style.left = `${(simTime / ch.periodS) * 100}%`;
    const s = sampleCharacter(ch, simTime);
    notationHost.style.boxShadow = s.on ? `inset 0 0 60px ${s.color === 'R' ? 'rgba(239,68,68,.35)' : 'rgba(251,191,36,.35)'}` : 'none';
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // ---- 表单 ----
  const sel = selectInput(ch.id, state.data.characters.map((c) => [c.id, c.name]), (v) => {
    ch = state.data.characters.find((c) => c.id === v)!;
    lh.characterId = ch.id;
    void state.saveLighthouse(lh).then(rerender);
  });
  const newBtn = h('button', { class: 'btn sm primary', onclick: () => {
    const n: LightCharacter = { id: 'char-' + Math.random().toString(36).slice(2, 7), name: '新灯质 Fl 6s', type: 'Fl', periodS: 6, phases: buildPhases({ type: 'Fl', periodS: 6 }) };
    state.data.characters.push(n);
    void state.saveCharacter(n).then(() => {
      lh.characterId = n.id;
      return state.saveLighthouse(lh);
    }).then(rerender);
  } }, '＋ 新灯质');

  const typeSel = selectInput(ch.type, TYPE_OPTIONS, (v) => { ch.type = v; rebuildPhasesFromForm(); });
  const periodInp = numInput(ch.periodS, { min: 1, step: 0.5, on: (v) => { ch.periodS = v; rebuildPhasesFromForm(); } });
  const groupInp = numInput(ch.groupCount ?? 2, { min: 1, step: 1, on: (v) => { ch.groupCount = Math.round(v); rebuildPhasesFromForm(); } });
  const morseInp = h('input', { type: 'text', value: ch.morse ?? 'A', maxlength: '1' }) as HTMLInputElement;
  morseInp.addEventListener('change', () => { ch.morse = morseInp.value.toUpperCase(); rebuildPhasesFromForm(); });
  const unitInp = numInput(ch.morseUnitS ?? 0.4, { step: 0.05, on: (v) => { ch.morseUnitS = v; rebuildPhasesFromForm(); } });
  const panelsInp = numInput(ch.panels ?? 1, { min: 1, step: 1, on: (v) => { ch.panels = Math.round(v); commit(); renderCheck(); } });
  const rotInp = numInput(ch.rotationPeriodS ?? 0, { step: 0.5, on: (v) => { ch.rotationPeriodS = v || undefined; if (v) ch.rpm = 60 / v; commit(); renderCheck(); } });
  const rpmInp = numInput(ch.rpm ?? 0, { step: 0.1, on: (v) => { ch.rpm = v || undefined; if (v) ch.rotationPeriodS = 60 / v; commit(); renderCheck(); } });

  const phaseRows = h('div', { class: 'table-wrap' });
  function renderPhaseTable() {
    const t = h('table', { class: 'data' });
    t.append(h('thead', {}, h('tr', {}, h('th', {}, '亮/暗'), h('th', {}, '时长 s'), h('th', {}, '强度'), h('th', {}, '颜色'))));
    const tb = h('tbody');
    ch.phases.forEach((p) => {
      const dur = numInput(p.durationS, { step: 0.1, min: 0.05, on: (v) => {
        p.durationS = v;
        ch.periodS = ch.phases.reduce((a, x) => a + x.durationS, 0);
        periodInp.value = ch.periodS.toFixed(2);
        commit(); renderTimeline(); renderNotation(); renderCheck(); renderPhaseTable();
      } });
      const inten = numInput(p.intensity ?? (p.kind === 'light' ? 1 : 0), { step: 0.1, min: 0, max: 1, on: (v) => { p.intensity = v; commit(); } });
      tb.append(h('tr', {}, h('td', {}, p.kind === 'light' ? '发光' : '熄灭'), h('td', {}, dur), h('td', {}, inten), h('td', {}, p.color ?? '—')));
    });
    t.append(tb); phaseRows.replaceChildren(t);
  }

  const playBtn = h('button', { class: 'btn primary', onclick: () => { playing = !playing; playBtn.textContent = playing ? '⏸ 暂停预览' : '▶ 播放预览'; } }, '⏸ 暂停预览');
  const exportBtn = h('button', { class: 'btn', onclick: () => downloadText(`${lh.code}-characteristic.txt`, characteristicSpecText(lh, ch), 'text/plain;charset=utf-8') }, '导出灯质说明书');

  renderAll();
  renderPhaseTable();

  el.append(
    h('div', { class: 'page-head' }, h('h2', {}, '灯质编排'),
      h('p', {}, '录入单闪、联闪、等明暗、明暗、互光与莫尔斯码；在时间轴上查看闪光序列。转动式灯塔的转速与透镜面板数会自动与灯质周期核对。')),
    h('div', { class: 'flex between mb12 wrap' }, h('div', { class: 'flex' }, sel, newBtn), h('div', { class: 'flex' }, playBtn, exportBtn)),
    h('div', { class: 'grid cols-2' },
      h('div', { class: 'grid', style: 'gap:16px' },
        card('国际标号与莫尔斯', notationHost),
        card('一个周期的时间轴', timelineHost),
        card('相位明细', phaseRows),
      ),
      h('div', { class: 'grid', style: 'gap:16px' },
        card('灯质参数',
          h('div', { class: 'grid cols-2' },
            field('类型', typeSel), field('周期 s', periodInp),
            field('联闪组数', groupInp), field('莫尔斯字符', morseInp),
            field('点单位 s', unitInp), h('span'),
            field('面板数', panelsInp), field('转动周期 s/圈', rotInp),
            field('转速 rpm', rpmInp),
          ),
          h('p', { class: 'muted', style: 'font-size:12.5px' }, '提示: 填转动周期会自动算 rpm，反之亦然。单闪灯质周期应≈转动周期/面板数。'),
        ),
        checkHost,
      ),
    ),
  );

  return { el, dispose: () => cancelAnimationFrame(raf) };
}
