import { state } from '../state';
import { h, field, numInput, textInput, selectInput, card, toast, downloadText } from '../ui/dom';
import type { Lighthouse, Sector, SectorKind } from '../core/types';
import { sectorChartSVG } from '../charts';
import { candelaFromNominalRangeNM } from '../core/iala';

export interface PageHandle { el: HTMLElement; dispose?: () => void }

function uid(prefix: string) {
  return prefix + '-' + Math.random().toString(36).slice(2, 8);
}

export function renderArchives(rerender: () => void): PageHandle {
  const lh = state.selectedLighthouse;
  const el = h('div', { class: 'page' });

  if (!lh) {
    el.append(h('div', { class: 'card' }, h('div', { class: 'card-body' }, '暂无灯塔档案，请新建。')));
    return { el };
  }

  const update = (patch: Partial<Lighthouse>, opts: { rerender?: boolean } = { rerender: true }) => {
    Object.assign(lh, patch);
    void state.saveLighthouse(lh);
    if (opts.rerender !== false) rerender();
  };

  // ---- 左: 列表 ----
  const list = h('div', { class: 'lh-list' });
  for (const item of state.data.lighthouses) {
    list.append(
      h('div', {
        class: 'lh-item' + (item.id === lh.id ? ' active' : ''),
        onclick: () => { state.selectedLighthouseId = item.id; rerender(); },
      },
        h('div', { class: 'row1' },
          h('span', { class: 'name' }, item.name),
          h('span', { class: 'badge accent' }, `${item.nominalRangeNM} NM`),
        ),
        h('div', { class: 'meta' }, `${item.code} · ${item.lat.toFixed(4)}N ${item.lon.toFixed(4)}E · 灯高 ${item.lightHeightM}m`),
        h('div', { class: 'tag-row' },
          ...(item.tags ?? []).map((t) => h('span', { class: 'badge gray' }, t)),
          item.order ? h('span', { class: 'badge white' }, item.order) : null,
        ),
      ),
    );
  }

  const newBtn = h('button', {
    class: 'btn primary',
    onclick: () => {
      const n: Lighthouse = {
        id: uid('lh'), name: '新灯塔', code: 'X-0000', lat: 30, lon: 122,
        lightHeightM: 20, nominalRangeNM: 8, candela: 500, sectors: [], tags: ['LED 灯桩'],
      };
      state.data.lighthouses.push(n);
      state.selectedLighthouseId = n.id;
      void state.saveLighthouse(n).then(rerender);
    },
  }, '＋ 新建灯塔');

  // ---- 右: 表单 ----
  const lensOptions = state.data.lenses.map((l) => [l.id, l.name] as [string, string]);
  const srcOptions = state.data.sources.map((s) => [s.id, s.name] as [string, string]);
  const charOptions = state.data.characters.map((c) => [c.id, c.name] as [string, string]);

  const form = h('div', { class: 'grid cols-2' },
    field('灯塔名称', textInput(lh.name, (v) => update({ name: v }))),
    field('航标编号', textInput(lh.code, (v) => update({ code: v }))),
    field('纬度 °N', numInput(lh.lat, { step: 0.0001, on: (v) => update({ lat: v }) })),
    field('经度 °E', numInput(lh.lon, { step: 0.0001, on: (v) => update({ lon: v }) })),
    field('灯高 m', numInput(lh.lightHeightM, { min: 0, on: (v) => update({ lightHeightM: v }) }), '灯光相对平均高潮面高度'),
    field('塔身高度 m', numInput(lh.structureHeightM ?? 0, { min: 0, on: (v) => update({ structureHeightM: v }) })),
    field('标称射程 NM', numInput(lh.nominalRangeNM, { min: 0, on: (v) => update({ nominalRangeNM: v }) }), 'IALA 定义在能见度 10NM 下'),
    field('发光强度 cd', numInput(lh.candela ?? 0, { min: 0, on: (v) => update({ candela: v }) })),
    field('透镜', selectInput(lh.lensId ?? '', lensOptions, (v) => update({ lensId: v }))),
    field('光源', selectInput(lh.sourceId ?? '', srcOptions, (v) => update({ sourceId: v }))),
    field('灯质', selectInput(lh.characterId ?? '', charOptions, (v) => update({ characterId: v }))),
    field('建成年份', numInput(lh.builtYear ?? 2000, { on: (v) => update({ builtYear: v }) })),
    field('厂家', textInput(lh.manufacturer ?? '', (v) => update({ manufacturer: v }))),
    field('等级', textInput(lh.order ?? '', (v) => update({ order: v }))),
  );

  const calcI = h('button', {
    class: 'btn sm',
    onclick: () => {
      const cd = Math.round(candelaFromNominalRangeNM(lh.nominalRangeNM));
      update({ candela: cd });
      toast(`已按 IALA Allard 反算: ${cd.toLocaleString()} cd`);
    },
  }, '由标称射程反算光强');

  const desc = h('textarea', {
    onchange: (e: Event) => update({ description: (e.target as HTMLTextAreaElement).value }),
  }) as HTMLTextAreaElement;
  desc.value = lh.description ?? '';

  const delBtn = h('button', {
    class: 'btn danger',
    onclick: () => {
      if (!confirm(`确认删除 ${lh.name}?`)) return;
      state.data.lighthouses = state.data.lighthouses.filter((x) => x.id !== lh.id);
      void import('../db').then(({ deleteOne }) => deleteOne('lighthouses', lh.id));
      state.selectedLighthouseId = state.data.lighthouses[0]?.id ?? '';
      rerender();
    },
  }, '删除本档案');

  // ---- 扇区编辑 + 海图 ----
  const chartHost = h('div', { class: 'chart-stage' });
  const bearingState = { b: 45 };
  const drawChart = () => {
    chartHost.innerHTML = sectorChartSVG(lh, { bearing: bearingState.b });
  };
  drawChart();

  const bearingSlider = h('input', { type: 'range', min: '0', max: '359', value: String(bearingState.b) }) as HTMLInputElement;
  const bearingOut = h('output', {}, `${bearingState.b}°`);
  bearingSlider.addEventListener('input', () => {
    bearingState.b = parseInt(bearingSlider.value, 10);
    bearingOut.textContent = `${bearingState.b}°`;
    drawChart();
  });

  const sectorRows = h('div', {});
  const renderSectors = () => {
    sectorRows.replaceChildren();
    lh.sectors.forEach((s, idx) => {
      const kindSel = selectInput<SectorKind>(s.kind, [
        ['white', '白光'], ['red', '红光'], ['green', '绿光'], ['obscured', '遮挡'],
      ], (k) => { s.kind = k; commitSectors(); });
      const startInp = numInput(s.startBearing, { on: (v) => { s.startBearing = v; commitSectors(false); } });
      const widthInp = numInput(s.widthDeg, { on: (v) => { s.widthDeg = v; commitSectors(false); } });
      const softInp = numInput(s.edgeSoftnessDeg ?? 0, { step: 0.1, on: (v) => { s.edgeSoftnessDeg = v; commitSectors(false); } });
      const labelInp = textInput(s.label ?? '', (v) => { s.label = v; commitSectors(false); });
      const remove = h('button', { class: 'btn sm danger', onclick: () => { lh.sectors.splice(idx, 1); commitSectors(); } }, '删');
      sectorRows.append(
        h('div', { class: 'pill-input-row', style: 'display:grid;grid-template-columns:repeat(5,1fr) 56px 40px;gap:6px;align-items:center' },
          startInp, widthInp, kindSel, softInp, labelInp, remove),
      );
    });
  };
  function commitSectors(full = true) {
    void state.saveLighthouse(lh!);
    drawChart();
    renderSectors();
    if (full) rerender();
  }
  renderSectors();

  const addSector = h('button', {
    class: 'btn sm primary',
    onclick: () => {
      const s: Sector = { id: uid('sec'), startBearing: 0, widthDeg: 40, kind: 'white', edgeSoftnessDeg: 0.5, label: '新扇区' };
      lh.sectors.push(s);
      commitSectors();
    },
  }, '＋ 添加扇区');

  const exportJSON = h('button', {
    class: 'btn sm ghost',
    onclick: () => downloadText(`${lh.code}-archive.json`, JSON.stringify(lh, null, 2), 'application/json'),
  }, '导出档案 JSON');

  el.append(
    h('div', { class: 'page-head' },
      h('h2', {}, '灯塔档案'),
      h('p', {}, '登记位置、灯高、标称射程、灯质与周边地形遮挡 / 红白分界扇区。数据保存在浏览器 IndexedDB。'),
    ),
    h('div', { class: 'grid cols-12' },
      h('div', { class: 'grid', style: 'gap:16px;align-content:start' },
        card('档案列表', h('div', { style: 'margin-bottom:12px' }, newBtn), list),
      ),
      h('div', { class: 'grid', style: 'gap:16px;align-content:start' },
        card('基本信息',
          h('div', { class: 'flex between mb12' }, h('span', { class: 'dim' }, '带 * 数值参与射程/视认计算'), h('div', { class: 'flex' }, calcI, exportJSON, delBtn)),
          form,
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, '描述'), desc),
        ),
        card('海图扇区 · 遮挡与红白分界',
          h('div', { class: 'grid cols-2' },
            h('div', {}, chartHost,
              h('div', { class: 'range-row mt12' }, bearingSlider, bearingOut),
              h('div', { class: 'muted', style: 'font-size:12px;margin-top:6px' }, '拖动改变船位方位，查看该方位扇区颜色 / 遮挡。虚线边界表示存在过渡宽度（锐度）。'),
            ),
            h('div', {},
              h('div', { class: 'table-wrap mb8' },
                h('table', { class: 'data' },
                  h('thead', {}, h('tr', {},
                    h('th', {}, '起始°'), h('th', {}, '宽度°'), h('th', {}, '种类'), h('th', {}, '过渡°'), h('th', {}, '标签'), h('th', {}, ''))),
                  h('tbody', {}, sectorRows),
                ),
              ),
              addSector,
              h('p', { class: 'muted mt12', style: 'font-size:12.5px' },
                '“过渡°”= 分界线柔化角宽度：0 为几何锐界（明暗截然），越大分界线越模糊。海图边界线与海上视认着色器都会反映该锐度。'),
            ),
          ),
        ),
      ),
    ),
  );
  return { el };
}
