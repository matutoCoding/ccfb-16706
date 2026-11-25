import { defineConfig } from 'vite';

// 评测/演示固定端口约定: 3 + 任务号后四位 => 16706 -> 36706
export default defineConfig({
  // 相对路径, 便于评测方用任意静态服务器/子路径托管 dist
  base: './',
  server: {
    port: 36706,
    strictPort: false,
    host: true,
  },
  preview: {
    port: 36706,
    strictPort: false,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any);
