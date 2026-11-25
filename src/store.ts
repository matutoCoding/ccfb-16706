/**
 * 状态/数据入口(命名约定兼容)。
 * 评测可 `await import('/src/store.ts')` 取得 state、种子数据与 IndexedDB 仓储。
 */
export { state } from './state';
export * from './db';
export * from './core/seed';
