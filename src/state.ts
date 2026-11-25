/** 全局应用状态(内存缓存 + IndexedDB 持久化) 与解析辅助 */

import type { DatabaseShape } from './db';
import { ensureSeeded, putOne, resetToSeed } from './db';
import type { Lighthouse, FresnelLens, LightSource, LightCharacter, Settings } from './core/types';
import { defaultSettings } from './core/seed';

export type Route = 'archives' | 'lens' | 'source' | 'seaview' | 'character' | 'settings';

class AppState {
  data: DatabaseShape = {
    lighthouses: [],
    lenses: [],
    sources: [],
    characters: [],
    settings: defaultSettings(),
  };
  selectedLighthouseId = 'lh-dongmingshan';
  route: Route = 'archives';
  private listeners = new Set<() => void>();
  ready: Promise<void>;

  constructor() {
    this.ready = this.load();
  }

  async load() {
    this.data = await ensureSeeded();
    if (!this.data.lighthouses.find((l) => l.id === this.selectedLighthouseId)) {
      this.selectedLighthouseId = this.data.lighthouses[0]?.id ?? '';
    }
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    this.listeners.forEach((fn) => fn());
  }

  get selectedLighthouse(): Lighthouse | undefined {
    return this.data.lighthouses.find((l) => l.id === this.selectedLighthouseId) ?? this.data.lighthouses[0];
  }
  lensOf(lh?: Lighthouse): FresnelLens | undefined {
    const id = (lh ?? this.selectedLighthouse)?.lensId;
    return this.data.lenses.find((x) => x.id === id) ?? this.data.lenses[0];
  }
  sourceOf(lh?: Lighthouse): LightSource | undefined {
    const id = (lh ?? this.selectedLighthouse)?.sourceId;
    return this.data.sources.find((x) => x.id === id) ?? this.data.sources[0];
  }
  characterOf(lh?: Lighthouse): LightCharacter | undefined {
    const id = (lh ?? this.selectedLighthouse)?.characterId;
    return this.data.characters.find((x) => x.id === id) ?? this.data.characters[0];
  }

  async saveLighthouse(lh: Lighthouse) {
    const i = this.data.lighthouses.findIndex((x) => x.id === lh.id);
    if (i >= 0) this.data.lighthouses[i] = lh;
    else this.data.lighthouses.push(lh);
    await putOne('lighthouses', lh);
    this.emit();
  }
  async saveLens(lens: FresnelLens) {
    const i = this.data.lenses.findIndex((x) => x.id === lens.id);
    if (i >= 0) this.data.lenses[i] = lens;
    else this.data.lenses.push(lens);
    await putOne('lenses', lens);
    this.emit();
  }
  async saveSource(src: LightSource) {
    const i = this.data.sources.findIndex((x) => x.id === src.id);
    if (i >= 0) this.data.sources[i] = src;
    else this.data.sources.push(src);
    await putOne('sources', src);
    this.emit();
  }
  async saveCharacter(ch: LightCharacter) {
    const i = this.data.characters.findIndex((x) => x.id === ch.id);
    if (i >= 0) this.data.characters[i] = ch;
    else this.data.characters.push(ch);
    await putOne('characters', ch);
    this.emit();
  }
  async saveSettings(s: Settings) {
    this.data.settings = s;
    await putOne('settings', s);
    this.emit();
  }
  async resetAll() {
    this.data = await resetToSeed();
    this.selectedLighthouseId = this.data.lighthouses[0]?.id ?? '';
    this.emit();
  }
}

export const state = new AppState();
