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

## 部署到 Render（推荐）

当前仓库结构：
- `backend/`：PocketBase 服务（Render 上运行）
- `frontend/`：静态前端（可继续 GitHub Pages 或改为 Render Static Site）

### 1. 一键创建 PocketBase 服务

仓库已包含：
- `backend/Dockerfile`
- `backend/start.sh`
- `render.yaml`

在 Render 中：
1. New -> Blueprint
2. 选择该仓库
3. 按 `render.yaml` 创建 `knit-pocketbase`
4. 等待首次部署完成

### 2. 初始化 PocketBase 管理员

部署后打开：
- `https://<你的-render-服务域名>/_/`

首次创建管理员账号，然后按本文前面的集合说明创建：
- `knit_user_state`
- `knit_project_covers`

### 3. 配置前端连接地址

打开 `frontend/pocketbase-config.js`，把 `baseUrl` 改为 Render 的 PocketBase 地址（必须 `https`）：

```js
baseUrl: "https://<你的-render-服务域名>"
```

如果前端仍在 GitHub Pages，必须使用 Render 提供的 HTTPS API 地址，不能用 `127.0.0.1` 或局域网地址。

### 4. 再部署前端

前端可以二选一：
1. 继续 GitHub Pages（推荐最简单）
2. Render Static Site（根目录选 `frontend/`，发布目录 `.`）

完成后手机端即可直接登录与同步。

### 免费版（仅个人轻量使用）

如果你只用 Render 免费套餐：

1. 使用仓库里的 `render.free.yaml`（不挂载磁盘）
2. 在 Render 选择 New -> Blueprint 后，使用该蓝图创建服务
3. 前端 `frontend/pocketbase-config.js` 的 `baseUrl` 仍改成 Render 的 HTTPS 地址

重要限制（免费版必须接受）：

- 服务重启、重新部署或平台回收实例后，PocketBase 数据可能丢失
- 包括账号、项目记录、封面文件都可能被清空

建议（免费条件下尽量降低损失）：

1. 把项目核心信息定期导出图片或复制到本地
2. 不要频繁触发后端重部署
3. 真正需要长期稳定保存时再升级到带磁盘方案

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
