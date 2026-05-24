<p align="center">
  <img src="docs/logo.jpg" alt="AutoCut Logo" width="120" />
</p>

<h1 align="center">AutoCut</h1>
<p align="center">口播视频 AI 自动剪辑工具</p>

<p align="center">
  上传视频 → 语音转录 → 智能筛选片段 → 预览 → 一键导出
</p>

---

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 构建共享类型
pnpm -C packages/shared build

# 3. 启动（后端 :4000 + 前端 :5173）
pnpm dev
```

打开浏览器访问 **http://localhost:5173**。

> 系统依赖：需安装 **ffmpeg** 和 **ffprobe**（macOS: `brew install ffmpeg`）

---

## 核心功能

- **语音转录** — 自动提取音频，调用 ASR 引擎生成带时间戳的字幕
- **智能切分** — 按静音阈值自动切分片段，标记重复内容
- **片段编辑** — 拆分 / 合并 / 移动 / 批量替换文案
- **实时预览** — Remotion 播放器即时预览最终效果
- **字幕样式** — 字体、颜色、描边、阴影、入场动画全可调
- **多比例导出** — 支持 16:9 横屏和 9:16 竖屏
- **字幕导出** — 支持 SRT / VTT / TXT 三种格式
- **1080p / 2K** — H.264 编码，MP4 容器

---

## 编辑器布局

```
┌──────────────┬────────────────────┬──────────────┐
│  左侧面板     │                    │  右侧片段列表  │
│  · 原始视频   │   实时预览区域       │  · 全部/已选/  │
│  · 裁剪比例   │   (Remotion)        │    未选 Tab   │
│  · 帧率/清晰度│                    │  · 片段卡片    │
│  · 渲染质量   │                    │  · 编辑/拆分   │
│  · 上传/解析  │                    │  · 字幕样式    │
│              │                    │  · 导出字幕    │
└──────────────┴────────────────────┴──────────────┘
```

---

## 工作流

### 1. 创建项目 → 上传视频
首页点击「创建新项目」，上传口播视频（mp4 / mov / avi）。

### 2. 解析视频
点击「开始解析」，系统自动：提取音频 → 语音识别 → 静音切分 → 重复检测。片段自动标记为正常 / 静音 / 重复。

### 3. 筛选 & 编辑片段
在右侧面板勾选需要的片段，支持拆分、合并、移动、批量替换文案。

### 4. 配置输出
- **裁剪比例**：原始 / 16:9 / 9:16 / 4:3 / 3:4
- **字幕样式**：字体大小 20-72px、粗细、颜色、描边、阴影、入场动画
- **渲染参数**：30/60 FPS、720p/1080p/2K、标准/高质量/超高

### 5. 渲染导出
点击「渲染视频」，H.264 + MP4 输出，完成后可直接下载。

---

## 全局设置

点击右上角齿轮图标进入：

| 分类 | 参数 | 说明 |
|------|------|------|
| 解析 | 静音阈值 (100-2000ms) | 静音超过此值则切分，默认 500ms |
| 解析 | 重复相似度 (50%-99%) | 文本相似度超过此值标记重复 |
| 转录 | 火山引擎 / Mock | 生产用火山引擎 ASR，开发用 Mock |
| 上传 | Uguu 临时上传 / 本地公网直链 | 视频上传方式 |

---

## 技术栈

```
apps/
  api/        NestJS 后端 — 视频处理、转录分析、渲染调度
  web/        React 前端 — Vite + shadcn/ui + Tailwind CSS
  render/     Remotion Composition — 视频预览与渲染模板
packages/
  shared/     共享 TypeScript 类型
```

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite 6 + shadcn/ui + Remotion Player |
| 后端 | NestJS + Express + Multer + Remotion Renderer |
| 渲染 | Remotion (FFmpeg) |
| 存储 | 本地文件系统 (`data/` 目录) |
| 包管理 | pnpm workspace monorepo |

### 环境变量

```bash
TRANSCRIBE_PROVIDER=mock          # mock | volcengine
VOLCENGINE_ASR_ENDPOINT=...       # 火山引擎 ASR 地址
VOLCENGINE_ASR_TOKEN=...          # 火山引擎 Token
```

---

## API 接口

后端运行在 `http://localhost:4000`。

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/projects` | 上传视频并解析 |
| `GET` | `/api/projects` | 项目列表 |
| `GET` | `/api/projects/:id` | 项目详情 |
| `PATCH` | `/api/projects/:id/segments` | 保存片段选择/文本 |
| `PATCH` | `/api/projects/:id/crop` | 修改裁剪设置 |
| `PATCH` | `/api/projects/:id/render-settings` | 修改渲染参数 |
| `POST` | `/api/projects/:id/render` | 触发渲染导出 |
| `POST` | `/api/projects/:id/reanalyze` | 重新解析 |
| `GET` | `/api/projects/:id/subtitles?format=srt` | 导出字幕 |
| `DELETE` | `/api/projects/:id` | 删除项目 |
| `GET` | `/api/settings` | 获取全局设置 |
| `PUT` | `/api/settings` | 更新全局设置 |

---

## 目录结构

```
data/
  projects/          项目 JSON 元数据
  uploads/
    <project-id>/
      video.mp4      原始视频
      audio.wav      提取的音频
      transcript.json 转录原数据
      output.mp4     渲染输出
```

---

