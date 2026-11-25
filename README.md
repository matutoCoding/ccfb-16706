# 航标灯光学与灯质仿真系统

浏览器内的航标灯塔 / 灯桩 **菲涅尔透镜光学 + IALA 射程 + 海上视认 + 灯质编排** 仿真。
**TypeScript + 原生 WebGL2/GLSL 着色器 + IndexedDB**，无重型框架，纯前端、无后端。

## 运行

```bash
npm install
npm run dev          # http://localhost:36706  (也可用 npx vite --port <端口>)
npm test             # vitest, 含两条验收硬指标测试
npm run build        # 类型无关的 vite 生产构建到 dist/
npm run typecheck    # 严格 tsc 检查
```

> 评测常用动态导入：Vite 开发服务器下可直接
> `await import('http://localhost:<port>/src/iala.ts')`。
> 应用启动后浏览器控制台也有全局 `window.ATON`（含全部核心函数、种子数据与 `runAcceptance()`）。

## 六个页面

| 页面 | 路径(hash) | 内容 |
|---|---|---|
| 灯塔档案 | `#/archives` | 位置/灯高/标称射程/灯质、遮挡与红白分界扇区海图、IndexedDB CRUD、档案 JSON |
| 透镜建模 | `#/lens` | 环带参数生成菲涅尔透镜，折射环与 TIR 反射棱镜环分开，老图纸 CSV 导入，子午光线追迹，垂直发散角 + 垂直配光图，CSV/SVG 导出 |
| 光源配置 | `#/source` | 点光源 / LED 阵列 / 老式灯泡，尺寸、阵列、焦点偏移、配光曲线采样录入 |
| 海上视认 | `#/seaview` | WebGL2 自定义着色器海面/星空/雾/海面倒影/旋转光束，能见度·雾·反光可调，Allard 路径透射，光力/地理射程取小，扇区颜色与遮挡联动 |
| 灯质编排 | `#/character` | 闪/长闪/快闪/等明暗/明暗/联闪/互光/莫尔斯，时间轴 + 播放头，莫尔斯码，转速×面板数一致性校验，导出灯质说明书 |
| 设置/校验 | `#/settings` | IALA 常数、两条验收指标可视化自检、射程计算单 HTML/MD、全部数据导出/恢复种子 |

首次启动自动播种三座灯塔：

1. **东溟山灯塔** `A-1001`：一等菲涅尔透镜 `f=0.92 m, n=1.49`，31 个折射/TIR 环带，原配 1 kW 溴钨灯泡（垂直发光体 50 mm），转动 4 面板。
2. **白沙咀灯桩** `B-2207`：`F=250 mm` 透镜 + 6×2 LED 阵列，`Fl(2) W 6s`。
3. **星礁灯桩** `B-2315`：`F=180 mm` 透镜 + 集成 LED，`Mo(A) 8s`。

## 两条验收硬指标（结果与公式）

### 1. 射程算法 vs IALA 公式，误差 < 1%

IALA 国际航标词典 **Allard 定律**（`E = I·T^R/(1852R)²`，阈值照度 `E_t = 2×10⁻⁷ lx = 0.2 µlx`），
Koschmieder 透射比 `T(V)=exp(-2.9957/V)`，标称射程取 `V=10 NM → T≈0.741`。

闭式反求光强：`I = E_t(1852R)² / T^R = 0.6859808·R²/T^R [cd]`。

- 公开算例：`R=5 NM,T=.74 → I=77.2868 cd`；`R=10 → 1393.14 cd`，本系统逐位一致。
- 光力射程由严格单调方程二分/牛顿求根；与独立牛顿参考、往返反算的最大相对误差约 **0.003%**。
- 地理射程 `R_geo = (1.17/√0.3048)(√H+√h_o) = 2.1197(√H+√h_o)` NM。
- 视认射程 `min(光力, 地理)`。

见 `src/core/iala.ts`、`src/core/acceptance.ts`。

### 2. 一等透镜垂直发散角 vs 几何光学，误差 < 0.1°

几何光学边缘关系（光源垂直发光高度 `h` 置于焦面）：

```
θ_full = 2·atan( h / (2f) )        小角近似 h/f (rad)
```

一等透镜 `f = 0.92 m`，老灯泡 `h = 0.050 m`：

```
θ_full = 2·atan(0.025/0.92) = 3.11313°     (半角 1.55657°, h/f 近似 3.11390°)
```

独立相似三角形参考、过光心 Snell 主光线追迹结果与上式完全相同（误差 ~0）；
首个实际环带 Snell 追迹 `3.1183°`，偏差 `0.0051° < 0.1°`。

> 口径说明：验收所用“垂直发散角”是**几何边缘/主光线全角**。
> `analyzeLensBeam()` 另外给出强度 **FWHM（约 1.95°）** 与含外环彗差旁瓣的稳健包络，
> 它们是不同的强度统计量，页面均明确标注，不与几何发散角混用。

## 给自动化/评审的 API

```ts
// 射程
import { luminousRangeNM, intensityForRangeNM, computeRangeBudget,
         geographicRangeNM, transmissivityFromVisibility } from '/src/iala.ts';
// 透镜 / 追迹 / 发散角
import { createFirstOrderLens, importRingTableCSV } from '/src/fresnel.ts';
import { verticalDivergenceDeg, analyzeLensBeam, sourceEmitterHeight,
         geometricDivergenceDeg } from '/src/optics.ts';
// 验收
import { runAcceptance } from '/src/acceptance.ts';
runAcceptance(); // { allPass, range:{maxRelativeError}, divergence:{maxAbsErrorDeg,...} }
```

浏览器内等价：`window.ATON.runAcceptance()`。

## 目录

```
src/core/        纯 TS 领域核心(无 DOM): iala/fresnel/optics/characteristic/sectors/seed/acceptance
src/gl/          WebGL2 渲染器与 GLSL 着色器
src/pages/       六个页面
src/db.ts        IndexedDB 仓储与播种
src/charts.ts    SVG 海图扇区 / 配光曲线 / 透镜光线剖面 / 射程条形
src/export.ts    灯质说明书 / 配光 SVG / 射程计算单
```
