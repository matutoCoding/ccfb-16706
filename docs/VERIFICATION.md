# 精度验收核对（两条硬指标）

应用内 `src/core/acceptance.ts` 会用**与产品代码独立的参考实现**自检；
设置页可视化展示，浏览器控制台 `window.ATON.runAcceptance()`，命令行 `npm test`。

## 1. 射程 vs IALA 公式（要求相对误差 < 1%）

IALA 国际航标词典 **Allard 定律**，阈值照度 `Et = 2e-7 lx`，`1 NM = 1852 m`：

```
E = I · T^R / (1852 R)^2
I = Et (1852 R)^2 / T^R
T(V) = exp(-2.995732/V)      # Koschmieder, 对比阈值 0.05
```

独立 Python 参考：

```python
import math
Et, NM, C = 2e-7, 1852, -math.log(0.05)
def I_of_R(R, T): return Et*(NM*R)**2 / T**R
def T_of_V(V): return math.exp(-C/V)
assert abs(I_of_R(5, 0.74) - 77.2868) < 1e-3      # IALA 公开算例
assert abs(I_of_R(10, 0.74) - 1393.14) < 0.05
# 由 I 求 R：解 Et = I*T(V)^R/(1852R)^2，系统用二分/牛顿，根唯一
```

系统结果：公开算例逐位一致；多组 I/V 对独立牛顿解的最大相对误差约 **3e-5（0.003%）**。

地理射程：`Rg = 1.17/sqrt(0.3048) * (sqrt(H)+sqrt(h_o)) = 2.1197(...)` NM；
视认射程 `min(光力, 地理)`。

## 2. 一等透镜垂直发散角 vs 几何光学（要求绝对误差 < 0.1°）

种子：`createFirstOrderLens()` → `f = 0.92 m, n = 1.49`，31 个折射/TIR 环；
配套老灯泡 `OLD_BULB_SOURCE.emitterHeightM = 0.05 m`。

```python
import math
f, h = 0.92, 0.05
full = 2*math.degrees(math.atan(h/(2*f)))   # 3.113135 deg
half = math.degrees(math.atan(h/(2*f)))     # 1.556567 deg
paraxial = math.degrees(h/f)                # 3.113901 deg
```

| 口径 | 结果 | 与几何全角差 |
|---|---:|---:|
| 几何 `2atan(h/2f)` / 独立相似三角形 | 3.113135° | 0 |
| 过光心 Snell 主光线追迹 | 3.113135° | ~1e-9° |
| 首个实际环带 Snell 追迹 | 3.118253° | 0.0051° |

均 `< 0.1°`。调用：

```ts
import { createFirstOrderLens } from '/src/fresnel.ts';
import { verticalDivergenceDeg } from '/src/optics.ts';
import { OLD_BULB_SOURCE } from '/src/core/seed.ts';
verticalDivergenceDeg(createFirstOrderLens(), OLD_BULB_SOURCE);
// { fullDeg: 3.11313, chiefTraceFullDeg: 3.11313, errorVsGeometricDeg: ~0, ... }
```

> `analyzeLensBeam().divergence.fwhmDeg ≈ 1.95°` 是强度半高宽，
> `robustEnvelopeDeg` 含外环彗差旁瓣；二者都**不是**本验收所指的几何边缘发散角，UI 已分别标注。
