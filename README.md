# LIGHTS OUT · 1250 米极限刹停

中文单车 F1 起步与精准刹停挑战。五组双红灯熄灭后点击踏板或按空格起步；冲向 1250 米处的终点线，控制刹车压力，车头在线前停得越近越好。黄黑路障位于终点线后 10 米。

## 当前规则

- 赛程 **1250 米**，最高速度 **300 km/h**，自动加速。
- 第一次按下刹车会立即、永久切断本轮动力。之后松开踏板只会滑行减速，重新按下则继续手动刹车；不会再自动加速。
- 滑行减速度为 **1.1 m/s²**；刹车减速度随压力增加，保留逐步建立压力、松开卸压的操作方式。
- 压力按实时车速增长：每秒 `18.75 + 75 × (当前 km/h ÷ 300)` 个百分点，比上版增长快 25%；松开每秒卸压 100 个百分点。
- 压力 **100% 时仍能制动，达到 115% 且仍在行驶才会锁死打滑**。这是“打滑压力再加 15%”的实现方式；未改为真实轮胎摩擦模型。
- 终点线位于 **1250 米**，路障前表面位于 **1260 米**，两者之间有 10 米缓冲区。越线停稳为越线失败；车头接触路障为碰撞失败。两种失败均为 0 分，不可上榜。
- 横跨车道的三排黑白棋盘格标线贴合沥青并接受光照和阴影。标线朝向来车的近端与 1250 米测距平面对齐，行驶数据、赛后距离与排行榜均以车头到此平面的距离为准。
- 赛道两侧不再摆放黑色米数距离牌，剩余距离由行驶仪表显示。
- 行驶距离与起步反应移到画面右侧，采用透明背景、白色大字和文字阴影，提升浅色建筑前的可读性。界面统一为黑、白、赛车红。
- 五组双灯使用现成灯具网格，横向放大 35%、纵向放大 18%，居中安装在发车横梁上。竖屏视野保持至少 42° 水平视角，保证五组灯完整显示。
- 提前起步算抢跑，灯灭后 10 秒未起步算超时。切走页面会取消本轮。每次重试完整重置动力、压力和统计。

## 赛后数据

有效刹停、越线、打滑和碰撞均有结算面板；未起步或未刹车的数据用“—”显示，不生成虚构曲线。

- 车头距终点线的停车距离；超过终点线时改为显示越线距离。完成时间和起步反应分行，起步反应字号加大。
- 刹停用时、制动距离、最高刹车压力；前两项并排，压力卡片占满下一行。
- 从首次刹车开始记录速度与压力曲线，包括松开踏板后的滑行，红虚线标出 115% 打滑阈值。
- 失败回合的“制动历时”记录从首次刹车到失败结算的时间；碰撞曲线保留实际碰撞速度，不画成正常减速到零。
- 综合得分以加大字号展示，使用距离 50%、完成时间 30%、起步反应 20%；失败为 0 分。计算为：

  `50/(1+距离cm/500) + 30/(1+完成ms/20000) + 20/(1+反应ms/300)`

此处展示游戏实际使用的**压力百分比**，不虚构牛顿力度、刹车踏板断裂或车辆翻滚数据。

## 本地预览

无需 npm 安装、无需构建，使用现代浏览器与 WebGL。

```sh
node preview.cjs
```

打开 <http://127.0.0.1:4173>。也可使用其他静态 HTTP 服务。由于浏览器模块和模型加载规则，请通过 HTTP 预览，不要直接双击 `index.html`。

## GitHub Pages 部署

将本目录的内容上传到仓库根目录，保留 `assets/`、`vendor/`、`src/`、`styles.css` 和 `index.html` 的相对位置。**不能只替换 index.html**。

在仓库 Settings → Pages 中选择 Deploy from a branch，分支选择 main，目录选择 /(root)。保留 `.nojekyll`，无需 npm 或后端。全部模型、材质、字体和渲染库均在本项目内，运行时不从第三方 CDN 下载资源。

## 本地成绩

用户主动点击“记录成绩”、填写名字并提交后才写入当前浏览器的 `localStorage`；姓名和成绩不上传。

排行榜分为**距终点线、起步反应、完成时间、综合得分**四栏，各自独立排序；前三项越小越好，综合得分越高越好。每个名字在每栏只出现一次，取该车手此项最佳回合；相同数值并列排名。综合分按展示的两位小数判定并列。距离用米，反应用毫秒，完成时间用秒。面板保留栏目标题、名次、车手与数值，删除各栏规则说明及底部注记。

终点线新规则使用 `lights-out-finish-line-leaderboard-v7`。原来的 `lights-out-roadblock-leaderboard-v6` 与 `lights-out-braking-leaderboard-v5` 不会被覆盖或删除，不与新距离基准和物理规则混排。清除浏览器数据或更换设备后，本地记录不会保留。

## 模型、实拍纹理与光照

没有创建新的车、路障、赛道或灯具模型。保留原下载模型的网格形状，使用复制、摆放、材质调整和现成部件组合。

- 赛车：**F1 2022**，Blender458，CC BY 4.0；沿用原项目由 FetchCFD / [RM-RAIN-MASTER](https://github.com/Pilot123321/RM-RAIN-MASTER#credits) 获取的模型。合并绘制，调整车漆、金属、轮胎材质，保留原网格形状。
- 赛道、看台、护栏和发车灯：[Kenney Racing Kit](https://kenney.nl/assets/racing-kit)，CC0，沿用原项目。
- 终点标线：参考 [Getty Images 的真实赛道终点线照片](https://www.gettyimages.hk/%E5%9C%96%E7%89%87/race-track-finish-line) 中的横向黑白棋盘格路面标线；使用现成 Kenney 赛道路面网格的薄层副本调整材质与 UV，叠加沥青法线和粗糙度。
- 黄黑路障：[Traffic Barrier](https://poly.pizza/m/cM3aJPU9NS)，**Quaternius**，CC0。保留 A 字架和斜纹网格，改为黄黑配色，复制原有横板部件组成双横板，整排摆放在终点线后 10 米处。
- 圆形警示灯：[Kenney City Kit — Roads](https://kenney.nl/assets/city-kit-roads)，CC0。使用 construction-light 原模型的圆形灯头部件，旋转、缩放并调整琥珀色发光材质。
- 赛道沥青：[Asphalt Track](https://polyhaven.com/a/asphalt_track)，Poly Haven，CC0，实拍色彩、法线与粗糙度贴图。
- 混凝土：[Concrete Wall 001](https://polyhaven.com/a/concrete_wall_001)，Poly Haven，CC0。
- 草地：[Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock)，Poly Haven，CC0。
- 金属表面：[Rusty Painted Metal](https://polyhaven.com/a/rusty_painted_metal)，Poly Haven，CC0，使用法线与粗糙度细节，未给车漆叠加锈色。
- 环境：[Autumn Field PureSky](https://polyhaven.com/a/autumn_field_puresky)，Poly Haven，CC0，1K HDR 环境、反射及天空背景。
- Three.js **0.160.1** 及其 GLTFLoader、RGBELoader、BufferGeometryUtils，MIT，来自官方 npm 包。
- Barlow Condensed ExtraBold 字体，SIL OFL 1.1，沿用原项目。

使用 PBR 材质、HDR 环境反射、暖色太阳与冷色天空补光、柔和阴影和 ACES 色调映射增强原有模型质感。桌面使用 2048 像素 VSM 柔和阴影，手机使用 1024 像素 PCF 阴影；移动阴影相机对齐阴影纹素以减少闪烁。降低全屏暗色叠层，调整玻璃反射、车漆与混凝土表面。原赛道仍保留其低多边形风格，不是照片级重建。

右侧维修建筑移除 TANKCO 广告面，并取消与自带办公室的屋顶模型重复叠放的办公室层，修复共面表面在移动时闪烁的问题。

下载来源、字节数及 SHA-256 见 `assets/manifest.json`，许可原文与署名见 `licenses/`。本项目为非官方 F1 主题体验，不代表 Formula 1、车队或素材作者背书。

## 项目结构

```text
index.html             页面结构与模块入口
styles.css             桌面、手机界面与压力仪表
src/core.mjs           发车、车辆物理、遥测及本地排行榜
src/scene.mjs          现成模型、材质、赛道、相机及光照
src/report.mjs         结算统计与 SVG 曲线
src/leaderboard.mjs    四项独立排行榜展示
src/app.mjs            键盘/触屏交互与游戏状态
assets/models/         原下载 GLB 模型与警示灯贴图
assets/textures/       Poly Haven 实拍 PBR 与 HDR
vendor/                本地 Three.js 渲染库及加载器
tests/core.test.mjs    物理与成绩存储回归测试
preview.cjs            无依赖本地 HTTP 预览
```

运行回归测试：`node --test tests/core.test.mjs`。测试覆盖极速、动力切断、滑行、压力建立、115% 打滑、终点线前停车、越线与路障碰撞的不同判定、不同帧率/长帧碰撞、实际碰撞曲线、发车、重置、存储同意流程、四项独立排名、各项最佳回合和并列排名。
