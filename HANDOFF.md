# UTOO 香水设计引擎 — 交接文档

> 给下一个接手开发的 AI / 工程师看的快速上手文档。
> 本仓库未上传 GitHub，采用本地 zip 传递。

---

## 一、项目是什么

**UTOO 香水设计自动化出图引擎** — 一个内部工具型桌面应用，给设计师用来批量生成香水视觉方案。

核心能力：
1. **可视化工作流编排**（基于 React Flow）—— 把"分析图 → 生成 prompt → 出图 → 输出"做成节点流
2. **画布工作区**（基于 tldraw）—— 在自由画布上对生成图片进行二次组合 / 局部重绘
3. **视觉资产库** —— 浏览器 OPFS 持久化的图片库，支持瀑布流网格 + 自定义大小
4. **任务批量监控** —— 跑长任务时的进度面板
5. **AI 对话生成** —— 集成 Gemini API 做图像分析 + 文生图

应用形态：
- **开发环境**：Vite + React 在浏览器中运行
- **生产环境**：Electron 桌面应用（Mac arm64 DMG / Windows x64 NSIS exe），数据 100% 本地化

---

## 二、技术栈

| 类别 | 选型 |
|------|------|
| 前端框架 | React 19 + TypeScript 5.8 |
| 构建 | Vite 6 |
| 样式 | Tailwind CSS 3 + CSS 变量主题 |
| 路由 | React Router 7 |
| 状态管理 | Zustand 5 |
| 工作流画布 | @xyflow/react (React Flow) 12 |
| 自由画布 | @tldraw/tldraw 3.9 |
| AI SDK | @google/genai 1.0 + ai-sdk |
| 动画 | motion (framer-motion v12) |
| 桌面打包 | Electron 41 + electron-builder 26 |
| 图标 | lucide-react |

---

## 三、目录结构

```
utoo香水引擎/
├── HANDOFF.md                  ← 你正在读的文件
├── docs/                       ← 产品/架构文档（中文）
│   ├── 产品需求文档.md
│   ├── 技术架构文档.md
│   ├── 节点开发规范.md
│   ├── 视觉资产库架构设计与开发计划.md
│   └── ...
└── engine-app/                 ← 主应用
    ├── package.json
    ├── vite.config.ts
    ├── electron-builder.config.js   ← 打包配置
    ├── tsconfig.json / tsconfig.electron.json
    ├── build-resources/        ← 应用图标 (icon.icns / icon.ico)
    ├── electron/               ← Electron 主进程
    │   ├── main.ts             ← 启动本地 HTTP server 加载 dist/
    │   └── preload.ts
    ├── public/                 ← 静态资源 + sw.js (Service Worker)
    │   ├── favicon.svg
    │   ├── logo.svg
    │   └── sw.js               ← 拦截 /__local_asset__/* 从 OPFS 取图
    └── src/
        ├── App.tsx             ← 路由 + 启动迁移检查
        ├── main.tsx
        ├── components/         ← NavigationBar 等通用组件
        ├── views/              ← 各主功能页面（按路由组织）
        │   ├── WorkflowView/   ← 工作流编排（核心）
        │   │   ├── nodes/      ← 各类节点组件
        │   │   └── components/ ← 工具栏、进度抽屉等
        │   ├── CanvasView/     ← tldraw 画布
        │   ├── LibraryView/    ← 视觉资产库（瀑布流）
        │   ├── TasksView/      ← 任务监控
        │   ├── UsageView/      ← API 用量
        │   └── SettingsView/   ← 设置（API Key / 输出目录 / 数据导入导出）
        ├── services/           ← 业务逻辑
        │   ├── DAGEngine.ts    ← 工作流执行引擎（拓扑排序 + p-queue 并发）
        │   ├── GeminiService.ts ← Gemini API 封装
        │   ├── SettingsService.ts ← IndexedDB CRUD（utoo-engine 库）
        │   ├── imageStore.ts   ← OPFS 图片存储 + tldraw 资产 GC
        │   ├── canvasMigration.ts ← IDB→OPFS 一次性迁移
        │   ├── dataTransfer.ts ← 全量导出/导入 ZIP
        │   ├── FileService.ts  ← FileSystemAccess 输出目录
        │   ├── LibraryFileService.ts ← 视觉资产库文件操作
        │   └── WorkflowFileService.ts ← 工作流 JSON 文件持久化
        ├── store/
        │   ├── appStore.ts     ← 全局 Zustand store（工作流/画布/任务）
        │   └── libraryStore.ts ← 视觉资产库状态
        ├── types/              ← TS 类型
        ├── hooks/
        ├── utils/
        ├── config/
        └── assets/
```

---

## 四、关键架构概念

### 4.1 数据存储分层

应用所有数据都存在浏览器本地，分为四层：

| 存储 | 用途 | 容量 |
|------|------|------|
| **localStorage** | API Key、用户设置、Token 用量统计 | KB 级 |
| **IndexedDB `utoo-engine`** | 工作流 / 文件夹 / 画布项目元信息 / 任务记录 / 聊天消息 / 目录句柄 | MB 级 |
| **IndexedDB `TLDRAW_DOCUMENT_v2utoo-canvas-{projectId}`** | tldraw 每个画布的形状/资产记录 | MB～GB 级 |
| **OPFS（Origin Private File System）** | 所有 AI 生成图片（PNG/JPG），目录 `canvas-images/` | GB 级（受磁盘限制） |

**核心思想：** tldraw 资产记录里只存一个轻量字符串 `/__local_asset__/{assetId}`，真正的图片二进制丢到 OPFS。Service Worker (`public/sw.js`) 拦截这个 URL，从 OPFS 流式返回文件。这样 tldraw 的 IDB 不会被巨大的 base64 撑爆。

### 4.2 Service Worker

`public/sw.js` 是必须的，没它图片不显示：
- 拦截 `/__local_asset__/{assetId}` 请求
- 从 OPFS 读出对应文件（按文件名前缀匹配，扩展名 `.png/.jpg/.webp/.gif`）
- 返回 Response 流

**注意**：在 `App.tsx` 启动时要等 `navigator.serviceWorker.ready` 后再做迁移检查。

### 4.3 OPFS 文件命名

由 `imageStore.ts/sanitizeId()` 决定：
```
sanitizeId(assetId) + '.' + ext
// 例：asset:abcXYZ123 → asset_abcXYZ123.png
```

`sanitizeId` 会把非 `[a-zA-Z0-9_-]` 的字符替换成 `_`，跟 `sw.js` 保持一致。

### 4.4 OPFS 垃圾回收

`imageStore.ts/runOPFSGarbageCollection()` 每 24 小时扫一次：
- 遍历所有 `TLDRAW_DOCUMENT_v2utoo-canvas-*` IDB
- 收集所有被引用的 `assetId`
- 删除 OPFS 中超过 1 小时未被引用的孤立文件
- 启动时在 `App.tsx` 自动调一次

### 4.5 工作流执行引擎 `DAGEngine.ts`

- 输入：节点 + 边 + 起点
- 拓扑排序后按层级执行
- 用 `p-queue` 控制每个 render 节点的并发度
- 节点类型见 [src/views/WorkflowView/nodes/](engine-app/src/views/WorkflowView/nodes/)：
  - `ImageInputNode` / `ImageUploadNode` / `ImageGenNode` / `ImageSaveNode`
  - `TextInputNode` / `TextDisplayNode`
  - `LLMNode`（Gemini 文本/分析）
  - `CodeNode`（自定义 JS 转换）
  - `SendToCanvasNode`（把结果送到 CanvasView）

### 4.6 全量数据导入/导出

`SettingsView` 的"数据备份与迁移"调用 [services/dataTransfer.ts](engine-app/src/services/dataTransfer.ts)：

导出 ZIP 结构：
```
config.json              ← localStorage
idb-data.json            ← utoo-engine IDB 各 store
tldraw-canvases.json     ← 所有画布的 tldraw 记录
canvas-images/           ← OPFS 全量图片
meta.json                ← 版本/统计
```

导入时清空对应 store 后重新写入，并对历史 image asset 缺 `props.w/h` 的脏数据做 sanitize（用 1 兜底）。

### 4.7 Electron 打包要点

- `electron/main.ts` 在打包后会启动一个 **本地 HTTP server**（随机端口）来 serve `dist/`，因为 `file://` 协议下 Service Worker / OPFS 不工作。
- 因此每次启动 Electron 应用，origin 是 `http://localhost:{随机端口}`。**这意味着 OPFS / IndexedDB 数据其实是和这个端口绑定的。** 如果端口下次启动变了，原则上数据应该丢失……但浏览器对 `localhost` 的 origin 处理实际是基于路径而非端口（待二次确认）。**这是一个未解决的潜在风险，建议改成固定端口（如 19174）。**
- `electron-builder.config.js` 的 `appId: 'com.utoo.design-engine'` 是 Electron 用户数据目录的标识，**永远不要改它**，否则升级后会找不到旧数据。

---

## 五、运行 & 构建

```bash
cd engine-app
npm install                 # 第一次必跑

npm run dev                 # 开发服务器 (http://localhost:5173/)

npm run build               # 类型检查 + Vite 生产构建 → dist/

npm run electron:build      # 打包桌面应用（Mac arm64 DMG，因为脚本默认）
                            # 输出在 release/

# 单独打 Windows
npx electron-builder --win --config electron-builder.config.js
```

打包配置 [`electron-builder.config.js`](engine-app/electron-builder.config.js)：
- Mac：`dmg`，arch `arm64`
- Win：`nsis`，arch `x64`，oneClick

图标在 `build-resources/`：`icon.icns`（Mac）和 `icon.ico`（Win）—— 黑底圆角 + favicon.svg 内容。

> **图标重新生成方法**（如果要换 logo）：
> 1. 用 `rsvg-convert` 把 SVG 渲染成 16/32/64/128/256/512/1024 多尺寸 PNG
> 2. `iconutil -c icns iconset/ -o build-resources/icon.icns`
> 3. 用 Python Pillow 把多尺寸 PNG 合成 `icon.ico`（需含 256x256，否则 electron-builder 报错）

---

## 六、最近做了哪些事（按时间倒序）

1. **黑底图标 + Win/Mac 双打包**：把 `favicon.svg` 加黑色圆角矩形背景生成 .icns/.ico，配置 electron-builder 同时输出 Mac arm64 + Win x64
2. **数据备份导入导出功能**（`SettingsView` + `dataTransfer.ts`）：解决从开发服务器迁移到 Electron 时数据全丢的问题。已修复一个 tldraw schema 校验问题（旧 image asset 的 `props.w` 是 undefined）
3. **Electron 打包**（`electron/main.ts`、`electron-builder.config.js`、`tsconfig.electron.json`）：用本地 HTTP server 而不是 `file://`，确保 SW + OPFS 工作
4. **视觉资产库网格动画优化**（`LibraryView/LibraryFileGrid/`）：用 framer-motion `LayoutGroup + layout="position"` + CSS transition 解决拉滑块时图片闪烁/抖动

详见 git log（如果有 .git）或 docs 目录里的设计文档。

---

## 七、未解决的问题 / 待办

1. **Electron 端口随机问题**：`electron/main.ts` 用 `port: 0` 让系统选随机端口。建议改成固定端口（比如 19174）以避免潜在的 origin 数据丢失问题。
2. **打包体积**：`dist/assets/index-*.js` 已经 3MB，gzip 后 900KB+。Vite 已经报警告。可以考虑用 `manualChunks` 拆分 tldraw / @xyflow / motion 等大包。
3. **没有自动化测试**：纯手测。
4. **类型 `any` 较多**：`src/views/CanvasView/canvasImageUtils.ts` 等地方有 `(dir as any)` 处理 OPFS 异步迭代器，是浏览器类型定义不全。

---

## 八、踩过的坑（重要！）

> 这些坑下次接手时务必避免。

### 8.1 不要给 motion 的 `layout` 用默认模式
图片格子动画时，`<motion.div layout>` 会用 scaleX/Y 做 FLIP，scale 会传染到子 `<img>` 上，看起来像图片在抖。**必须用 `layout="position"`**，只动 translate。

### 8.2 Electron 41+ 的 `--version` 是骗人的
`electron --version` 返回的是 bundled Node 版本（24.x），不是 Electron 版本。要验证用：
```bash
ELECTRON_RUN_AS_NODE=1 electron -e "console.log(process.versions.electron)"
```

### 8.3 electron-builder 的 ts 配置文件不被识别
不要用 `electron-builder.config.ts`（除非装 ts-node），直接用 `.js` 并用 `--config electron-builder.config.js` 显式指定。

### 8.4 .ico 必须包含 256x256
否则 electron-builder Win 打包报错 `image must be at least 256x256`。Pillow 的 ICO 写入需要把 256 那个图作为主图（`imgs[-1].save(...)`），否则 electron-builder 还是认不出。

### 8.5 tldraw 旧数据的 image asset 可能缺 `props.w/h`
新版 schema 校验严格，加载时会抛 ValidationError。在导入数据时必须 sanitize。已经在 `dataTransfer.ts/sanitizeTldrawRecord` 处理。

### 8.6 file:// 协议下 Service Worker / OPFS 不工作
所以 Electron 必须自己起 HTTP server。

### 8.7 不要在 import 时直接用 `tasks/chat_messages` store 的 `loadChatMessages(projectId)` 拉全量
这俩 store 的 IDB 索引按 projectId 分组，要拉全量得用 `getAllFromStore`。`dataTransfer.ts` 已经处理。

### 8.8 503 UNAVAILABLE / Deadline expired
Gemini API 偶尔会瞬时挂掉，不是 Windows 特有问题。重试即可。当前没有自动重试逻辑，可以考虑加。

---

## 九、给下一个 AI 的对接指南

### 用户偏好
- **沟通用中文**，简短直接，不要罗嗦总结。
- **代码风格**：能复用就复用，不要过度抽象；不写没必要的注释；不要无脑加 try/catch；类型用严格的，少用 `any`。
- **不要主动写文档/总结性 markdown**，除非用户明确要求。
- **打包/迁移类操作**先确认再执行，不要直接 `rm -rf release/`。
- 用户是设计 + 产品背景，对前端实现细节理解 OK 但偏视觉/交互；解释架构时多用类比少用术语。

### 第一次接手时建议先做的事
1. 通读 `docs/技术架构文档.md`、`docs/产品需求文档.md`、`docs/视觉资产库架构设计与开发计划.md` —— 都是中文写的，半小时能读完
2. 跑起来 `npm run dev`，每个路由都点一下感受功能
3. 用导出功能把开发服务器的数据导出，再导入到一个新 origin（比如另一个端口的 vite）验证迁移流程
4. 看一下 `App.tsx` → `services/canvasMigration.ts` 理解启动迁移流程
5. 看一下 `services/DAGEngine.ts` 理解工作流执行

### 联系方式
- 用户邮箱：mawenjin0711@gmail.com
- 项目无远程仓库（zip 传递）

---

**祝接手顺利。** 有任何不清楚的，先读 `docs/` 下的设计文档，再读 `src/services/` 下的注释（关键文件头部都有架构说明）。
