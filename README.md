# 织伴

织伴是一个织物项目管理网页，支持项目创建、行数计数、封面管理、文字图解、图片导出与账号同步。

## 技术栈

- 前端：HTML5、CSS3、Vanilla JavaScript
- 数据存储：浏览器 `localStorage`
- 云同步与认证：Supabase（Auth + Database + Storage + Realtime）
- 图解识别：Tesseract.js（OCR）
- 图像导出：Canvas API
- 字体与视觉：Google Fonts（ZCOOL XiaoWei、Outfit）

## 功能

- 项目仪表盘与状态筛选（全部/进行中/搁置/已完成）
- 新建项目（空白项目、导入图片图解、导入文字图解）
- 项目详情编辑（名称、类型、状态、总行数、线材、工具、封面、文字图解）
- 行数计数器（步进、加减、重置）
- 项目图片导出（预览与下载）
- 账号登录与多端同步（Supabase）

## 网页端与移动端体验

- 首页：
  - 网页端以横向项目浏览和宽屏仪表盘为主。
  - 移动端以触控优先布局为主，卡片与操作区更紧凑。
- 项目详情页：
  - 网页端使用左右分栏（信息编辑 + 计数与导出）。
  - 移动端切换为单列，提升小屏输入与操作效率。
- 计时器：
  - 网页端为固定悬浮操作。
  - 移动端支持折叠/展开，减少遮挡。

## 文件结构

- `index.html`：首页
- `project.html`：项目详情页
- `script.js`：首页逻辑
- `project.js`：项目详情逻辑
- `cloud-sync.js`：登录与云同步逻辑
- `supabase-config.js`：Supabase 配置
- `styles.css`：全局样式
