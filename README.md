# MengDay

## 分类统计、短计时过滤与 iPhone 体验更新

- 统计页可切换按活动或分类汇总，分类可展开查看活动。分类变更会重新归类历史统计。
- 停止或切换时自动忽略不足 60 秒的计时，保留活动名称；恰好 60 秒保留。历史记录、主动补录及时间轴修改不受此规则影响。
- iPhone 主屏幕模式使用深色沉浸顶栏，适配安全区、横屏和键盘。通过 Safari 分享菜单选择「添加到主屏幕」。
- 本次无需 SQL 迁移，发布前端并让其他设备更新即可。如果 iPhone 仍保留旧状态栏样式，先确认数据已同步或导出备份，再重新添加主屏幕入口。
- 自动化的手机模拟不能替代真机：状态栏、横竖屏、软键盘、锁屏恢复和主屏幕启动仍需 iPhone 实测。

轻盈、私密的时间记录 PWA。React + TypeScript + Vite，部署到 Vercel Hobby；Supabase 提供受邀账号与跨设备同步。

## 从 1.0 升级到 1.1（活动管理与时间轴）

1. 先在应用设置中导出 JSON 备份，并让其他设备完成待同步记录。
2. 打开 `supabase/migrations/002_activity_appearance.sql`，**复制文件里的完整 SQL 内容**，粘贴到 Supabase → SQL Editor → New query，点击 Run。不要粘贴文件路径，也不要重复执行 `001`。`002` 可重复执行，不删除或修改已有记录。
3. 在本机执行 `npm ci`、`npm test` 和 `npm run build`；推送代码到已连接的 GitHub 仓库，让 Vercel 发布新版。
4. 其他手机和电脑重新打开 MengDay，点击更新提示或刷新，确保所有设备使用新版后再选择新增图案。旧版客户端不认识新增图案时可能提示同步失败，刷新至新版即可。

全新安装须依次执行 `001_mengday.sql` 和 `002_activity_appearance.sql`。

本次新增：

- 今日活动卡片右上角「…」可编辑或删除；删除默认移除活动但保留历史，也可二次确认删除所有关联记录。正在计时的活动须先停止。设置中可恢复移除的活动。
- 24 种预设颜色、自定义颜色、36 种图案及纯色选项。新建、补录和历史编辑中的「颜色与图案」修改的是活动本身，全部同类记录同步更新。
- 记录页切换日、周、月；每天一列、从早到晚按实际时长绘制。月视图左右滚动查看整月，缩放选择紧凑／标准／放大。
- 编辑模式点击空白可插入记录、延长前项或提前后项。上下边界可拖动，相接记录的蓝色手柄同时修改两边。默认 5 分钟吸附，靠近相邻边界时精确吸附，可关闭。
- 手柄双击或按 Enter 可输入带时区的精确时间，方向键移动 5 分钟，Shift + 方向键移动 1 分钟。Escape 取消拖动。运行中记录只能调整开始时间。
- 填缝、边界修改和活动删除可撤销。撤销只回退涉及的数据；相关记录已被其他操作修改时拒绝覆盖，提示重新操作。
- 跨日片段仍对应同一条原记录；极短记录使用右侧「⋯／多条」入口选择，不夸大色块高度。夏令时日期按真实的 23／25 小时显示并标注当地刻度。

本次未自动执行云端迁移或发布；请按上述顺序升级。浏览器自动化测试使用本机体验数据，不访问生产账号记录。

## 本地运行

需要 Node.js 22.12+（建议 24 LTS）。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。未配置 Supabase 时，可以点「先在本机体验」；该模式不会假装已云同步，数据保存在本浏览器的 IndexedDB。登录云端前可导出 JSON，再从账号设置中导入。本机体验不产生虚构时间记录。

```sh
npm test
npm run test:e2e
npm run build
```

浏览器测试默认使用已安装的 Microsoft Edge；也可修改 `playwright.config.ts` 的 `channel` 使用其他已安装浏览器。生成截图与失败轨迹位于 `test-results/`。

`npm run test:e2e` 会先构建生产版，再验证开发界面及生产 PWA 的离线重开。`npm run format:check` 检查源码排版，`npm run format` 自动整理。

## 功能

- 单活动计时、自动切换、时间戳恢复；手机锁屏后重新打开不会丢失经过时间。
- 活动名称自动记忆、搜索、最近使用排序；备注按每条记录独立保存，支持多行与自动保存。
- 手动补录、编辑、删除撤销、时间重叠校验；日周月统计、时区分摊、每日/每周目标。
- 深浅主题、响应式界面、可安装 PWA、离线缓存、备份预览与合并。
- 多设备冲突保留两份内容，显式处理；跨标签页使用 Web Locks 和 BroadcastChannel 避免并行覆盖。

## Supabase 配置

1. 创建 Free 项目，保存项目 URL 和 Publishable Key / anon key。
2. 在 SQL Editor 执行 [`supabase/migrations/001_mengday.sql`](supabase/migrations/001_mengday.sql)。需要项目管理员权限以创建 `auth.users` 密码更新触发器。
3. 在 Authentication → Providers / Sign In 配置中开启 Email 登录、**关闭 Allow new users to sign up**。关闭匿名登录。账号由管理员创建，无需邮件发送服务。
4. 将 Site URL 设置为 `https://mengday.cdro.tech`。只添加实际需要的本地/生产地址到允许回调列表。
5. 复制 `.env.example` 为 `.env.local`，填入项目 URL 和公开客户端 key。重启 Vite。**不要把 service-role key 放入 `VITE_*` 变量。**
6. 复制 `.env.admin.example` 为 `.env.admin`，填入 URL 和 service-role key，仅保留在自己的电脑上。

创建、重置受邀账号：

```sh
npm run account -- create friend@example.com
npm run account -- reset friend@example.com
```

脚本产生随机临时密码，显示一次供管理员私下分发。首登要求修改密码（至少 10 位）。管理员标志位存在 `app_metadata`，用户无法自行修改；数据库在实际密码哈希变化时清除首登标记，客户端刷新会话后进入应用。忘记密码通过管理员重置，不依赖未配置的 SMTP。

## GitHub → Vercel → 自定义域名

1. 在你的 GitHub 账号创建独立仓库 `MengDay`，不要修改博客仓库 `576690.github.io`。
2. 在本目录初始化并推送代码（先确认 `.env.local`、`.env.admin` 均被忽略）：

```sh
git init -b main
git add .
git commit -m "Build MengDay time tracking PWA"
git remote add origin https://github.com/576690/MengDay.git
git push -u origin main
```

3. Vercel → Add New Project → 导入该仓库；选择 Vite，构建命令 `npm run build`，输出 `dist`。
4. 添加环境变量 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。它们是客户端公开配置，权限由 RLS 控制。不要添加管理员 key。
5. 部署成功后，在项目 Settings → Domains 添加 `mengday.cdro.tech`。到域名 DNS 管理平台，按 Vercel 本次给出的**确切目标**添加 `mengday` 的 CNAME；不要改根域 `@` 或博客记录。
6. 等待域名验证及 HTTPS 生效，在 Supabase 更新生产 Site URL。用两个受邀账号验证数据隔离。
7. 后续推送主分支由 Vercel 自动发布。预览部署建议使用独立测试 Supabase 项目，避免误操作生产记录。

## 同步协议与权限

`user_states` 每个用户一行，JSONB 文档包含 `activities`、`entries`、`settings`，并有单调递增 `revision`。对少量亲友采用账号级原子文档，计时停止与开始在同一事务中提交，不需要跨表补偿。客户端不能直接写表，只能调用：

```text
commit_state(p_operation_id UUID, p_expected_revision BIGINT, p_data JSONB)
  → { conflict: false, revision }
  → { conflict: true, revision, data }
```

RPC 从认证上下文获取用户，不接受任意用户 ID；按用户加事务锁、检查版本、验证活动引用/唯一名称/单计时/时间不重叠，再更新文档及操作回执。重复操作不会写两遍；版本冲突不覆盖远端。RLS 仅允许读取本账号文档。`sync_operations` 无客户端读取权限。

本地修改先落 IndexedDB，再同步；运行中的时钟不每秒写数据库。短暂网络失败保留操作 ID 重试；之后有其他修改时，版本冲突会要求显式选择。自动合并按活动名称及记录 ID 去重，重叠时阻止合并，可关闭冲突面板在记录页调整后重试。选择整份覆盖前可分别下载两个版本。

数据规模上限为 1000 活动、10 万记录、单次服务端文档 12 MB。全量文档同步适合个人及少量用户；不适合高并发公共服务。长期使用可按账号迁移到增量实体同步；操作回执当前不自动清理，以保持无限期幂等保障。

## 备份与离线

JSON 备份格式 `{ app: "MengDay", version: 1, exportedAt, data }`。导入先校验，预览条数，明确选择同 ID/同名冲突优先级；不会清空数据。CSV 正确引用换行、双引号，并转义公式前缀。

PWA 仅预缓存构建资源，不缓存认证响应。首次账号登录需要联网；之后网络不可用时可操作已加载数据。浏览器清除网站数据会清除本地副本，定期导出 JSON。Vercel 免费计划用于个人非商业用途；Supabase Free 闲置一周可能暂停，不提供自动数据库备份。

在 iPhone Safari 分享菜单选择「添加到主屏幕」。iOS 真机需验证：安装、安全区、输入键盘、锁屏五分钟后恢复、离线重新打开、回网同步。网页不提供原生实时活动、锁屏小组件或后台通知；计时通过时间戳计算。

## 验证范围

`tests/model.test.ts` 覆盖名称记忆、备注、计时切换、时间重叠、跨日/DST 统计和备份。数据库与存储测试覆盖 RLS、幂等、版本冲突和离线持久化；浏览器测试覆盖桌面及手机尺寸的核心流程。PGlite 测试模拟 Supabase 的认证上下文，不能替代实际 Supabase Auth、Realtime 和两个真实设备的上线验收。
