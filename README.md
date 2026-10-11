# LIGHTS OUT · F1 起步刹停挑战

中文单车 F1 起步刹停小游戏。五组双红灯熄灭后，玩家主动点击油门或按空格起步，从对齐的发车槽位冲向 400 米处的单个大型 FINISH 门。接近终点再次按住踏板或空格刹车，按住越久压力越大、刹车越重，满压且仍行驶会锁死侧滑失败；松开卸压，终点线前重新加速、终点线后滑行减速。完全停稳后，车头距终点线越近，排名越高。保留起步反应毫秒；抢跑和超出终点 80 米的未停稳成绩无效。

网站：https://zhuka4141-cmyk.github.io/f1-lights-out/

有效起步并完全停稳后，玩家可以自愿记录成绩。选择同意、填写名字并提交后才写入当前设备的本地排行榜。名字和成绩不会上传到服务器；换设备或清除浏览器数据后不会保留。按绝对厘米距离排序，显示两位小数米；同距比较反应毫秒。新 v5 榜不迁移旧版反应或固定刹车成绩。计时受屏幕刷新率与输入延迟影响。

## GitHub Pages 发布

本仓库是可直接托管的静态网站，首页为根目录的 `index.html`。模型、字体、脚本和样式全部内嵌，无需 npm、后端或额外构建。

1. 将 ZIP 解压，将里面的文件和目录上传到 GitHub 仓库根目录。请勿上传 ZIP 文件本身，也不要多套一层文件夹。
2. 在仓库 **Settings → Pages → Build and deployment** 中选择 **Deploy from a branch**。
3. 选择 **main** 分支与 **/(root)** 目录，点击 **Save**。
4. 等待 Pages 部署完成，打开页面提供的网站地址。更新游戏时替换 `index.html` 并提交即可。

`.nojekyll` 表示直接发布静态文件。不同仓库可使用同样的方式发布；网站地址以仓库 Pages 设置页显示为准。

## 素材与授权

未自行建模。全部场景模型来自网络现成资源，作者署名保留在本 README、内嵌 HTML 来源注释和 licenses 中；游戏内入口按用户要求移除。

- 赛车：F1 2022，Blender458，CC BY 4.0；经 FetchCFD / [RM-RAIN-MASTER](https://github.com/Pilot123321/RM-RAIN-MASTER#credits) 获取。运行时缩放、旋转、合并绘制并调整材质配色，保留模型形状。
- 赛道、看台、护栏、灯具：[Kenney Racing Kit](https://kenney.nl/assets/racing-kit)，CC0。终点门采用现成 overheadRoundColored 单个放大实例与黑紫色 FINISH/棋盘格纹理，保留原网格，并非照片品牌门的原版 CAD。
- 字体：Barlow Condensed ExtraBold，SIL Open Font License 1.1。
- Three.js：MIT。

完整署名及相关许可文件在 `licenses/`，模型原始文件哈希和来源在 `assets/manifest.json`。本项目为非官方 F1 主题体验，不代表模型作者、Formula 1 或任何车队的背书。

最高速度 300 km/h，刹车减速度较上一版增强 15%。压力仪表改为从下往上填充的竖条，桌面 38×170px、手机 34×136px，75% 以上显示红色。
