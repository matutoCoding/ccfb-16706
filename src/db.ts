/** IndexedDB 仓储: 灯塔档案 / 透镜 / 光源 / 灯质 / 设置, 首次启动播种三座灯塔 */

import type { Lighthouse, FresnelLens, LightSource, LightCharacter, Settings } from './core/types';
import {
  seedLighthouses,
  seedLenses,
  seedSources,
  seedCharacters,
  defaultSettings,
} from './core/seed';

const DB_NAME = 'aton-optics';
const DB_VERSION = 1;
export const STORES = ['lighthouses', 'lenses', 'sources', 'characters', 'settings'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return tx(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}
export async function getOne<T>(store: StoreName, id: string): Promise<T | undefined> {
  return tx(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>);
}
export async function putOne<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  await tx(store, 'readwrite', (s) => s.put(value) as IDBRequest<IDBValidKey>);
}
export async function deleteOne(store: StoreName, id: string): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
}
export async function clearStore(store: StoreName): Promise<void> {
  await tx(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
}

export interface DatabaseShape {
  lighthouses: Lighthouse[];
  lenses: FresnelLens[];
  sources: LightSource[];
  characters: LightCharacter[];
  settings: Settings;
}

/** 首次运行播种; 已存在则跳过 */
export async function ensureSeeded(force = false): Promise<DatabaseShape> {
  const existing = await getAll<Lighthouse>('lighthouses');
  if (force || existing.length === 0) {
    for (const l of seedLighthouses()) await putOne('lighthouses', l);
    for (const l of seedLenses()) await putOne('lenses', l);
    for (const s of seedSources()) await putOne('sources', s);
    for (const c of seedCharacters()) await putOne('characters', c);
    await putOne('settings', defaultSettings());
  }
  const [lighthouses, lenses, sources, characters, settingsAll] = await Promise.all([
    getAll<Lighthouse>('lighthouses'),
    getAll<FresnelLens>('lenses'),
    getAll<LightSource>('sources'),
    getAll<LightCharacter>('characters'),
    getAll<Settings>('settings'),
  ]);
  return {
    lighthouses,
    lenses,
    sources,
    characters,
    settings: settingsAll.find((s) => s.id === 'app') ?? defaultSettings(),
  };
}

export async function resetToSeed(): Promise<DatabaseShape> {
  for (const name of STORES) await clearStore(name);
  return ensureSeeded(true);
}
