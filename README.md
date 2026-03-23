# 织伴（Web 版）

织伴是一个面向织毛线场景的项目管理网页，帮助你记录作品信息、计行进度、材料清单、文字图解与导出分享图。

## 功能总览

- 多项目仪表盘（状态筛选、项目统计；桌面端横向浏览，移动端纵向上下滑动）
- 新建项目三选一（点击按钮后弹出：空白项目 / 导入图片图解 / 导入文字图解）
- 项目详情独立页（基础信息、封面、行数计数、材料、笔记）
- 全局悬浮计时器（主页与详情页共享；移动端详情页支持折叠/展开）
- 图解识别与自动建项目（OCR）
- 项目图片导出（卡片级导出，带主页风格背景）
- 登录与多端同步（Supabase）
- 本地持久化存储（`localStorage`，未登录时仍可使用）

## 页面结构

当前运行文件位于 `frontend/` 目录：

- `frontend/index.html`：主页，仅展示仪表盘与全局计时器
- `frontend/project.html`：项目详情页，处理单个项目编辑与导出
- `frontend/script.js`：主页逻辑
- `frontend/project.js`：项目详情逻辑
- `frontend/cloud-sync.js`：登录与云同步实现（Supabase）
- `frontend/supabase-config.js`：Supabase 配置
- `frontend/styles.css`：全局样式

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

登录后会自动把数据同步到 Supabase 表 `knit_user_state` 中，支持跨设备同步。

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

1. 使用任意静态服务器指向 `frontend/` 后访问。
2. 或直接打开 `frontend/index.html`（但某些浏览器/插件策略下，建议使用静态服务器）。

## 开启登录与多端同步（Supabase）

### 1. 创建 Supabase 项目（Free）

1. 打开 Supabase 并创建项目。
2. 在项目 Settings -> API 获取：
  - `Project URL`
  - `anon public key`

### 2. 执行数据库初始化 SQL

在 SQL Editor 执行以下脚本：

```sql
create table if not exists public.knit_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  projects jsonb not null default '[]'::jsonb,
  timer jsonb,
  client_updated_at bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.knit_user_state enable row level security;

drop policy if exists "knit_user_state_select_own" on public.knit_user_state;
create policy "knit_user_state_select_own"
on public.knit_user_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "knit_user_state_insert_own" on public.knit_user_state;
create policy "knit_user_state_insert_own"
on public.knit_user_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "knit_user_state_update_own" on public.knit_user_state;
create policy "knit_user_state_update_own"
on public.knit_user_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

### 3. 创建封面存储桶

1. 进入 Storage，创建 bucket：`knit-covers`。
2. 建议设置为 Public（当前前端使用公开 URL 显示封面）。
3. Storage Policies 建议添加：仅登录用户可上传自己路径下文件。

示例（可按需调整）：

```sql
create policy "covers_upload_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'knit-covers'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "covers_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'knit-covers'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'knit-covers'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "covers_read_public"
on storage.objects
for select
to public
using (bucket_id = 'knit-covers');
```

### 4. 打开 Realtime

进入 Database -> Replication，把表 `public.knit_user_state` 加入 realtime 发布。

### 5. 配置前端连接

编辑 `frontend/supabase-config.js`：

```js
window.__KNIT_SUPABASE_CONFIG__ = {
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your-anon-key",
  stateTable: "knit_user_state",
  coversBucket: "knit-covers",
};
```

### 6. 配置 Auth

1. Authentication -> Providers 中启用 Email。
2. 如果你希望注册后立即登录，建议关闭 Email Confirm；
3. 若开启 Email Confirm，用户需要先完成邮件验证再登录。

### 7. 启动并验证

1. 打开 `frontend/index.html`。
2. 右上角注册/登录账号。
3. 新建项目并上传封面图。
4. 在另一台设备登录同账号，验证项目与封面同步。

## 注意事项

- OCR 依赖网络加载 Tesseract CDN，离线环境下图片识别不可用。
- 未登录时数据仅保存在当前浏览器本地，清理浏览器存储会导致数据丢失。
- 已登录时会自动同步到 Supabase 云端，但仍建议定期导出项目图片做备份。

## 同步失败排查

如果提示云同步失败，可按以下顺序检查：

1. `frontend/supabase-config.js` 的 `supabaseUrl/supabaseAnonKey` 是否已填写且正确。
2. 数据库是否存在表 `knit_user_state`，并且包含字段：
  - `user_id`(uuid, 主键)
  - `projects`(jsonb)
  - `timer`(jsonb)
  - `client_updated_at`(bigint)
3. RLS policy 是否允许当前登录用户读写自己的行。
4. Storage bucket `knit-covers` 是否存在，且上传策略是否允许当前用户写入自己的路径。
5. Realtime 是否已启用并发布了 `knit_user_state`。

说明：当前实现会把封面图上传到 Storage，再把封面 URL 写入项目数据；当项目文本非常大时会自动瘦身同步负载，避免写入失败。
