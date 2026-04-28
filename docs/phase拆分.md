# UTOO 香水设计出图引擎 — Phase 拆分方案

> 版本：v2.0（Web App 重构版）
> 日期：2026-04-09
> 变更说明：放弃 Electron 桌面壳，改为纯 Web 应用（Vite + React + 浏览器 File System Access API）

---

## 总体策略

每个 Phase 以一个明确的**可用功能闭环**结尾——不以代码完成度，而以实际使用效果来验收。

```
Phase 1 — 工作流跑通          验证 AI 管道质量
Phase 2 — 方案画布 + 正向连接  设计师可在画布上浏览全套方案
Phase 3 — 双向打通            从画布里触发重新生成
Phase 4 — 自动化              无人值守批量出图
```

---

## Phase 1 — 工作流跑通

**核心目标：** 验证 AI 管道质量——整合后的出图质量是否达到或超过四个独立原型。

### 1A：项目骨架 + 工作流 UI

- Vite + React + TypeScript 项目初始化（纯 Web App，无 Electron）
- React Flow 画布打开，5 种节点（ImageInput / Analyze / Prompt / Render / Output）可拖拽、可配置、可连线
- 工作流 JSON 可通过浏览器 File System Access API 保存/加载
- 内置 5 个工作流模板（KV / 矩阵 / 情绪板 / CMF / 全套）
- 设置页面：API Key 输入 + 测试；输出文件夹选择（showDirectoryPicker）

**1A 内部验收：** 开发团队自验，所有节点 UI 可用，全套模板可加载，工作流文件可存取。

### 1B：AI 管道打通

- Gemini 统一服务层（analyzeDesign + generateImage + 降级 + 限流）
- DAG 执行引擎（拓扑排序 + 5 种节点执行器）
- 实时进度 UI（节点状态颜色 + 底部进度抽屉 + 缩略图预览）
- 输出图片通过 File System Access API 写入本地文件夹，按规范命名

**Phase 1 正式验收标准：**
- 3 张测试香水瓶图片全部跑完，每张输出 13 张图片，文件完整无损
- 质量评分 ≥ 24/36（与四个原型对比）
- 工作流不出现整体卡死

---

## Phase 2 — 方案画布 + 正向连接

**核心目标：** 设计师可以在一张无限大的画布上浏览完整的出图方案，而不是去文件夹翻图片。

### 功能范围

- tldraw 方案画布打开，支持缩放平移、自由排布
- Phase 1 生成的图片自动落位到画布（工作流运行完成 → 图片按类型分区显示在画布上）
- 自定义 `GeneratedImageShape`：显示图片 + 类型标签 + 操作按钮
- 按类型自动分 Frame 分组（KV Frame / 矩阵 Frame / 情绪板 Frame / CMF Frame）
- 支持手动在画布上拖拽、删除、重新排列

**Phase 2 验收标准：**
- 工作流跑完后，13 张图片自动出现在画布对应位置
- 设计师可以在画布上浏览完整方案，无需打开文件夹

---

## Phase 3 — 双向打通

**核心目标：** 设计师在画布上看到某张图，可以直接触发重新生成（换风格、换颜色等），新图自动落位在旁边。

### 功能范围

- 画布图片右键菜单 → 「用此图触发工作流」→ 选择工作流类型
- 触发执行引擎，以选中图片为输入运行对应工作流
- 新生成的图片落位在源图右侧，二者之间自动连线（表示「重新生成」关系）
- 运行状态在画布图片上实时显示（进度环）

**Phase 3 验收标准：**
- 从画布右键触发 → 新图出现在旁边 → 完整闭环跑通

---

## Phase 4 — 自动化

**核心目标：** 100 张输入图，设定好工作流后，夜间无人值守跑完，早上来取图。

### 功能范围

- 批量任务队列（IndexedDB 持久化，刷新页面不丢失）
- 文件夹批量导入：选择包含多张香水瓶图的文件夹，自动拆分为多个 Job
- 批量任务监控面板：Job 列表 + 进度 + 成功/失败统计
- 心跳检测：Job 超时自动重试（指数退避）
- 定时任务：可设定「每天 22:00 自动运行队列」（Web Worker + setTimeout）
- 完成通知：浏览器 Notification API 推送

**Phase 4 验收标准：**
- 导入 10 张测试图，关闭显示器，2 小时后检查输出目录，10 × 13 = 130 张图全部完成

---

## 各 Phase 技术重点对比

| Phase | 新引入技术 | 复杂度 |
|-------|----------|-------|
| Phase 1 | Vite + React Flow + Gemini + DAG + File System Access API | ★★★★ |
| Phase 2 | tldraw + 自定义 Shape + Zustand subscribe 联动 | ★★★ |
| Phase 3 | 反向触发链路 + 图片关系连线 | ★★★ |
| Phase 4 | IndexedDB 队列 + Web Worker 调度 + Notification | ★★★ |

---

## 关键约束与决策记录

**为什么放弃 Electron，改用 Web App？**
- Electron 35 在 macOS 上存在 `require("electron")` 模块拦截失效的问题，调试耗时
- 本产品为内部工作室工具，设计师统一使用 Chrome/Edge，浏览器运行完全满足需求
- File System Access API 在 Chrome 86+ 完全支持，可直接读写本地文件，功能与 Electron 文件操作等价
- Web App 无需打包分发，`npm run dev` 或部署静态文件即可使用，大幅降低维护成本

**文件写入方案：**
浏览器的 File System Access API（`showDirectoryPicker` + `FileSystemWritableFileStream`）可以直接写文件到用户指定的本地文件夹，一次授权后句柄存 IndexedDB 持久化，使用体验与桌面应用相当。

**运行方式：**
- 开发：`npm run dev` → Chrome 打开 `localhost:5173`
- 生产：`npm run build` → 静态文件，可通过局域网 IP 让设计师在自己电脑的 Chrome 访问

---

*Phase 1 验收通过后，此文档更新为 Phase 2 详细计划。*
