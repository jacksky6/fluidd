# Fluidd 多热端版本

在 Fluidd 中接入 [klipper-toolchange-stats](https://github.com/jacksky6/klipper-toolchange-stats)，
功能参考 [null01024/mainsail-multitool](https://github.com/null01024/mainsail-multitool)。
参考源码为 `a2bcec18`，保留 Fluidd 原有的 Vue、Vuetify、布局及 Moonraker 通信方式。

## 面板功能

- 检测到 `multitool` 对象后，首页自动出现可拖动、折叠的多热端卡片。
- 显示当前热端；“拿取 Tn”发送 `Tn`，“放回 Tn”发送 `UNTOOL`。
- 支持 Spoolman 料卷绑定、颜色、耗材名称及剩余重量；取消选择不会改变绑定。
- 可选显示夹紧检测、断料续打组、续打剩余距离、换头阶段与统计、XYZ 偏移。
- 支持共享感应加热和固定红外测温。挂架上的热端温度显示 `—`，不会冒用当前热端读数。
- 共享加热故障、打印中、运动忙碌、换头中或未归位时，禁用相应的机械操作。
- 状态未知或由插件假定的夹紧状态显示“未验证”，不会显示为真实检测成功。
- 面板提供中文、英文；排列方向与展开状态由 Fluidd 的设置机制保存到 Moonraker。

状态通过 Fluidd 现有的 WebSocket 订阅更新，不新增打印机端 Python 文件或动作宏。
仅配置 `[multitool]` 也可以使用；没有启用的可选模块不会要求安装。
夹紧和耗材信息来自已有插件，界面不会替代硬件检测。

## 构建与下载

工作分支：`multitool-version`。

每次推送此分支，GitHub Actions 的 **Multitool Package** 自动执行：

1. 使用项目固定的 pnpm 和 Node.js 安装依赖。
2. 执行 ESLint、类型检查、单元测试、循环依赖检查。
3. 构建多热端版本，打包 `fluidd.zip`，生成 SHA-256 校验文件。
4. 上传 Actions 产物，并更新 `multitool-latest` 专用预发布。

下载：

- [最新部署包](https://github.com/jacksky6/fluidd/releases/download/multitool-latest/fluidd.zip)
- [SHA-256 校验](https://github.com/jacksky6/fluidd/releases/download/multitool-latest/fluidd.zip.sha256)
- [Actions 构建记录](https://github.com/jacksky6/fluidd/actions/workflows/multitool.yml)

压缩包根目录就是 `index.html`、`assets/`、`.version` 等网站文件，
不包含额外的 `dist/` 外层文件夹。替换前备份现有 Fluidd 目录及 `config.json`，
将部署包解压到实际的网站目录，并保留自己的 `config.json`；不需要重启 Klipper。
浏览器如仍显示旧界面，请强制刷新并检查旧的 PWA 缓存。

多热端构建的版本信息为 `1.37.7-multitool.<Actions运行编号>`，
`release_info.json` 指向当前 fork，避免误报为官方 Fluidd 发行版。
预发布是测试版本，实际动作仍受打印机端 Klipper 配置控制。

## 本地开发

项目在 `package.json` 的 `devEngines` 固定工具版本；pnpm 会下载项目需要的 Node.js，
不需要修改系统 Node.js。先确认可以使用 pnpm，然后执行：

```bash
pnpm install --frozen-lockfile
pnpm run lint --no-fix
pnpm run type-check
pnpm run test:unit --run
pnpm run circular-check
pnpm run build --mode multitool
```

本地构建编号为 `0`。普通 `pnpm run build` 保留上游生产构建方式。
