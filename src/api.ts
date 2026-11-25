/**
 * 统一自动化入口。浏览器控制台 / Playwright 可用:
 *   window.ATON.runAcceptance()
 *   const { luminousRangeNM } = await import('/src/core/iala.ts')
 */
export * from './core/types';
export * from './core/math';
export * from './core/iala';
export * from './core/fresnel';
export * from './core/optics';
export * from './core/characteristic';
export * from './core/sectors';
export * from './core/seed';
export * from './core/acceptance';
export { state } from './state';
