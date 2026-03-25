# 织伴

织伴是一个面向编织场景的轻量 Web 应用，聚焦于项目进度管理、毛线库存、小样记录、图片导出与多端同步。

## 当前已实现能力

### 1) 首页（项目仪表盘）

- 项目状态筛选：全部 / 进行中 / 搁置 / 已完成。
- 新建项目：空白项目、导入图片图解、导入文字图解。
- 项目卡片信息：名称、封面、状态、进度、导出风格。
- 快捷操作：进入项目、切换状态、导出图片、删除项目。
- 全局计时器：开始 / 暂停 / 重置，支持状态持久化。

### 2) 项目详情页

- 项目信息编辑：名称、类型、状态、总行数、线材、工具、针号等。
- 进度操作：行数增减、步进调整、进度百分比展示。
- 图片能力：封面上传/删除，图解支持文字与多图。
- 导出能力：Canvas 导出，支持预览与下载。

### 3) 毛线仓库

- 条目字段：品牌、线材类型、色号、针号、重量、季节、消耗进度、实拍图。
- 条目操作：新增、编辑、取消编辑、删除。
- 视觉能力：毛线风格进度条（细条纹、低饱和配色）。

### 4) 小样仓库

- 条目字段：线材、花型、针号、规格、密度、备注、实拍图。
- 条目操作：新增、编辑、取消编辑、删除。

## 存储与同步机制

### 本地存储（离线可用）

- 所有模块先写入浏览器 localStorage，保证离线可用。

### 云端同步（登录后）

- 使用 Supabase Auth 进行登录注册与会话管理。
- 使用 Supabase Database 保存用户状态。
- 使用 Supabase Storage 存储项目封面图。
- 使用 Supabase Realtime 监听跨端变更并回写本地。
- 当前同步范围：
  - 项目数据（projects）
  - 全局计时器（timer）
  - 毛线仓库（yarn）
  - 小样仓库（swatch）

## 技术栈

- 前端：HTML5 + CSS3 + Vanilla JavaScript
- 数据：localStorage + Supabase（Auth / Postgres / Storage / Realtime）
- 导出：Canvas API
- 图片读取：FileReader
- OCR 依赖：Tesseract.js（已保留依赖，当前主流程不依赖 OCR）

## 运行与配置

### 1) 本地直接运行

可直接打开 index.html；如需更稳定的资源加载，建议使用静态服务器（如 VS Code Live Server）。

### 2) 配置 Supabase

编辑 supabase-config.js：

```js
window.__KNIT_SUPABASE_CONFIG__ = {
  supabaseUrl: "https://<your-project>.supabase.co",
  supabaseAnonKey: "<your-anon-key>",
  stateTable: "knit_user_state",
  coversBucket: "knit-covers",
};
```

### 3) 数据表与权限建议

- 表：knit_user_state（至少包含 user_id、projects、timer、client_updated_at）。
- 开启 RLS，并限制为用户仅可读写自己的数据。
- 存储桶 knit-covers 用于项目封面图。

## 目录结构

- index.html：首页
- project.html：项目详情页
- yarn.html：毛线仓库页
- swatch.html：小样仓库页
- script.js：首页逻辑（项目列表、筛选、导出入口、认证交互）
- project.js：项目详情逻辑（编辑、计数、导出）
- storage.js：毛线/小样仓库逻辑
- storage-account.js：仓库页账号展示逻辑
- cloud-sync.js：认证、云同步、实时监听
- supabase-config.js：Supabase 配置
- styles.css：全局样式


## 后续规划（来自 site.km）

- 标签检索（毛线/小样）
- 毛线消耗明细与统计
- 小样洗前/洗后/缩水率记录
- 周报/月报（文字摘要 + 图表 + 分享卡片）

## 说明

本项目当前以单仓库前端实现为主，强调快速迭代与可读性。若需团队协作或长期维护，建议下一步补充自动化测试、版本化数据迁移与同步冲突可视化。
