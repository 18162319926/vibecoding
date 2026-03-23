# 织伴（Web 版）

织伴是一个面向织毛线场景的项目管理网页，帮助你记录作品信息、计行进度、材料清单、文字图解与导出分享图。

## 功能总览

- 多项目仪表盘（状态筛选、项目统计；桌面端横向浏览，移动端纵向上下滑动）
- 新建项目三选一（点击按钮后弹出：空白项目 / 导入图片图解 / 导入文字图解）
- 项目详情独立页（基础信息、封面、行数计数、材料、笔记）
- 全局悬浮计时器（主页与详情页共享；移动端详情页支持折叠/展开）
- 图解识别与自动建项目（OCR）
- 项目图片导出（卡片级导出，带主页风格背景）
- 登录与多端同步（PocketBase）
- 本地持久化存储（`localStorage`，未登录时仍可使用）

## 页面结构

- `index.html`：主页，仅展示仪表盘与全局计时器
- `project.html`：项目详情页，处理单个项目编辑与导出
- `script.js`：主页逻辑
- `project.js`：项目详情逻辑
- `styles.css`：全局样式

## 新建项目流程

主页只有一个“新建项目”按钮，点击后出现三个选项：

1. `空白项目`：直接创建并跳转到详情页。
2. `导入图片图解`：点击后选择图片，自动 OCR 识别并创建项目，再跳转详情页。
3. `导入文字图解`：点击后弹出输入框，粘贴文字图解并解析建项目，再跳转详情页。

文字图解示例：

```text
项目名称：奶油围巾
工具：4.0mm 棒针
材料：羊毛线2团、记号扣6个
文字图解：起针40针，2上2下...
```

## 数据说明

项目数据默认存储在浏览器 `localStorage` 的 `knit-helper-state` 下；
全局计时器状态存储在 `knit-global-timer` 下。

登录后会自动把数据同步到 PocketBase 集合 `knit_user_state` 中，支持跨设备同步。

字段示例：

```json
{
  "id": "uuid",
  "projectName": "奶油围巾",
  "status": "active",
  "totalRows": 120,
  "rows": 36,
  "coverImage": "data:image/...",
  "textDiagram": "..."
}
```

## 近期交互调整

- 修复了“在项目详情页上传封面后，未保存表单内容被重置”的问题：上传封面前会先同步页面草稿字段。
- 主页桌面端改为不整页滚动，项目卡片支持仪表盘区域内滚轮横向浏览。
- 主页移动端项目仪表盘改为纵向卡片流，支持上下滑动浏览，桌面端交互保持不变。
- 主页移动端项目卡片视觉调整：封面图更紧凑，标题与说明文字适度放大。
- 主页移除了“图解导入素材区”“导入项目”“导出项目图片”顶部入口，保留卡片级操作与新建菜单入口。
- 项目卡片四个操作按钮重排为更紧凑布局。
- 项目详情页移动端计时器默认可折叠，点击手柄可展开或收起，减少占屏。

## 运行方式

这是纯前端静态项目，无需安装依赖。

1. 直接在浏览器打开 `index.html`。
2. 或使用任意静态服务器在当前目录启动后访问。

## 开启登录与多端同步（PocketBase）

1. 下载 PocketBase（Windows）：
  - https://pocketbase.io/docs/
2. 解压后在目录中启动：
  - `pocketbase serve`
3. 首次打开管理后台：
  - `http://127.0.0.1:8090/_/`
4. 创建集合 `knit_user_state`，建议字段：
  - `owner`（relation，关联 `users`，单选）
  - `projects`（json）
  - `timer`（json）
  - `clientUpdatedAt`（number）
5. 创建集合 `knit_project_covers`，建议字段：
  - `owner`（relation，关联 `users`，单选）
  - `projectId`（text）
  - `image`（file，单文件）
6. 设置访问规则（List/View/Create/Update/Delete）为仅允许本人：
  - `@request.auth.id != "" && owner.id = @request.auth.id`
7. 打开 `pocketbase-config.js`，确认 `baseUrl` 与集合名：
  - 默认 `http://127.0.0.1:8090`
  - 若你的关联字段不是 `owner`，把 `ownerField` 改成实际字段名
  - 如果封面集合字段名不同，调整 `coverCollection/coverOwnerField/coverProjectIdField/coverFileField`
8. 刷新页面，即可在页面右上角注册/登录并同步。

## 部署到 Pockethost（推荐）

你当前前端是静态站点（GitHub Pages/任意静态托管），最省事方案是直接用 Pockethost 托管 PocketBase。

### 1. 创建 Pockethost 实例

1. 在 Pockethost 创建新实例
2. 记下实例地址（例如：`https://your-app.pockethost.io`）
3. 打开实例后台：`https://your-app.pockethost.io/_/`
4. 创建管理员账号

### 2. 初始化集合

按本文前面的同步说明创建两个集合：
1. `knit_user_state`
2. `knit_project_covers`

并配置权限规则仅允许本人读写：
- `@request.auth.id != "" && owner.id = @request.auth.id`

### 3. 修改前端连接地址

打开 `frontend/pocketbase-config.js`，把 `baseUrl` 改成你的 Pockethost 地址（必须 `https`）：

```js
baseUrl: "https://your-app.pockethost.io"
```

### 4. 发布前端

1. 推送到 GitHub
2. GitHub Pages（或其他静态托管）自动更新
3. 手机端打开页面后即可登录与同步

### 5. 常见坑

1. 前端是 HTTPS 时，`baseUrl` 也必须是 HTTPS
2. 不能再用 `127.0.0.1` 或局域网地址
3. 登录失败优先检查：实例是否在线、域名是否填对、集合规则是否正确

> 说明：仓库中的 Render 文件可以保留，但你使用 Pockethost 时无需配置 Render 后端。

## 注意事项

- OCR 依赖网络加载 Tesseract CDN，离线环境下图片识别不可用。
- 未登录时数据仅保存在当前浏览器本地，清理浏览器存储会导致数据丢失。
- 已登录时会自动同步到 PocketBase 云端，但仍建议定期导出项目图片做备份。

## 同步失败排查

如果提示 `云同步失败：Failed to create record`，通常是集合字段或规则不匹配：

1. 检查集合名是否正确：`knit_user_state`
2. 检查是否有 `projects`(json)、`timer`(json)、`clientUpdatedAt`(number)
3. 检查 owner 字段名是否与 `pocketbase-config.js` 的 `ownerField` 一致
4. 检查规则是否允许当前登录用户创建记录

说明：PocketBase 单条 JSON 存在大小上限。当前实现会把封面图上传到 `knit_project_covers` 文件集合，再在项目数据中保存封面 URL；若文本过长会自动裁剪，确保同步不中断且封面可跨端显示。
