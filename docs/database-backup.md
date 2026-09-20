# 每日数据库备份

备份运行于私有仓库 `576690/MengDay-backups`，公开的 MengDay 源码仓库不会执行备份。
每天北京时间 03:23 自动执行，也可以在 Actions 页面手动运行 `Daily encrypted database backup`。
GitHub 定时执行可能延迟；以最近一次成功运行及其附件为准。

手动运行时可以勾选 `restore_drill`：在 GitHub 临时运行器上新建独立 Supabase 环境，
恢复这次导出的 SQL，核对四张核心表行数、RLS/权限和密码变更触发器。
演练不会写入源数据库，也不需要上传解密私钥。日常定时备份默认不启动完整测试环境。
这个演练验证数据库恢复；切换生产前仍需在测试版应用中验证登录和跨设备同步。
演练的 Auth 镜像固定为 `v2.197.0`、Storage 镜像为 `v1.77.5`，与首次验收时线上项目一致；CLI 默认镜像较旧，缺少新版账号表。
以后 Supabase 升级 Auth/Storage 并新增表时，需要同步更新演练脚本的版本再验收。

## 内容与保护

- 使用固定版本 Supabase CLI 导出角色、数据库结构、数据（包括 Auth 账号）。
- `roles-original.sql` 保留原始角色导出；用于恢复的 `roles.sql` 仅移除一条 Supabase 管理的 `log_min_messages → supabase_realtime_admin` 参数授权。新项目的普通管理员不能重新授予它，平台自行管理这项权限。
- 单独导出 `auth.users` 上的 `mengday_password_changed` 触发器，附带应用 SQL 迁移文件。
- 附带 `restore-prelude.sql`，在恢复建表前清除目标项目的宽泛默认授权，再由 schema.sql 恢复源项目权限，避免恢复后 API 角色获得额外权限。
- 数据导出是一个 pg_dump 事务快照；结构和角色单独导出，备份期间应避免部署数据库迁移。
- 上传前用 age 公钥加密；解密私钥不存入 GitHub Secrets，也不上传到 GitHub。
- 加密附件保留 30 天；备份未写入 Git 历史。私有 Actions 存储和运行分钟受账户额度约束。
- 导出失败会使工作流失败，并在私有仓库创建或更新提醒 Issue，指派仓库所有者。
- 失败诊断日志也使用同一公钥加密后上传，保留 7 天；只有本机私钥可以解密，运行日志不直接打印数据库错误内容。
- 提醒不会包含数据库内容或凭据；邮件/推送是否送达取决于 GitHub 个人通知设置。
- 任务未启动（例如 Actions 被禁用或额度耗尽）时，任务自身不能发送失败通知。应定期查看最近成功时间。

本备份不包含浏览器尚未同步的数据、Supabase Storage 文件实体、项目配置、OAuth/SMTP 密钥或 Edge Functions。
当前 MengDay 不使用 Storage 文件。将来接入文件存储时，需要另加对象备份。
每日导出会访问数据库，但不能保证免费项目永不暂停。

## 配置

私有备份仓库需要：

| 类型             | 名称                   | 内容                                                                |
| ---------------- | ---------------------- | ------------------------------------------------------------------- |
| Actions Secret   | `SUPABASE_DB_URL`      | Supabase Connect → Session pooler 的 PostgreSQL 连接串（端口 5432） |
| Actions Variable | `BACKUP_AGE_RECIPIENT` | age 公钥，以 `age1` 开头                                            |

数据库密码中的特殊字符必须 URL 编码。`service_role` API 密钥不能代替数据库密码。
本地 `.env.backup` 可以保存连接串；它被 Git 忽略，禁止提交。

解密私钥保存在本机用户文档目录 `MengDay-backup-keys` 中的 `.txt` 文件。
请将该文件另存到密码管理器或加密离线介质；丢失私钥后无法解密已有备份。
更新公钥只影响新备份，旧备份仍需要旧私钥。

在 GitHub 的 Settings → Notifications → Actions 启用失败工作流通知，
并确认提及/指派 Issue 的通知已打开。工作流会指派备份仓库所有者。

## 下载、解密与校验

1. 打开私有仓库 Actions，选择一次成功运行，下载 `mengday-database-...` 附件并解压外层 ZIP。
2. 安装 [age](https://github.com/FiloSottile/age/releases)，使用本机保存的私钥解密。
3. 在新的本地目录检查 SHA256，再解密和解包。以下命令适用于 Linux/macOS/Git Bash；替换示例文件名和私钥路径。

```bash
sha256sum --check mengday-EXAMPLE.tar.gz.age.sha256
age --decrypt --identity /safe/location/mengday-backup-key.txt \
  --output backup.tar.gz mengday-EXAMPLE.tar.gz.age
mkdir restored-backup
tar -xzf backup.tar.gz -C restored-backup
cd restored-backup
sha256sum --check SHA256SUMS
```

解密和校验失败时停止，不执行恢复。明文 SQL 含账号及个人记录，验证完后妥善清理。

## 恢复到全新的 Supabase 项目

先在隔离的测试项目演练，禁止直接覆盖正在使用的生产数据库。
下列步骤需要 PostgreSQL 的 `psql`，目标 Supabase 项目应具有兼容的 PostgreSQL、Auth 版本及扩展。
不要提前执行 MengDay 迁移，否则会与 schema.sql 的建表语句冲突。

通过安全方式将目标连接串放入 `PGDATABASE` 环境变量，设置 `PGSSLMODE=require`。
以下命令在已解密的 `restored-backup` 目录执行：

```bash
psql --dbname "$PGDATABASE" -X --single-transaction --set ON_ERROR_STOP=1 \
  --file roles.sql \
  --file restore-prelude.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --file auth-triggers.sql
```

恢复默认角色、扩展或受管 schema 时可能遇到版本/权限差异，按下方 Supabase 官方恢复文档处理；不要忽略 SQL 错误继续上线。
若使用兼容性修复前生成的旧备份，`roles.sql` 可能仍含 `GRANT SET ON PARAMETER "log_min_messages" TO "supabase_realtime_admin";`；恢复前仅删除这一条平台管理的授权。
旧备份若没有 `restore-prelude.sql`，请从本仓库 `scripts/restore-prelude.sql` 复制到解密目录，再按上述命令恢复。
如果原来的 CLI 迁移历史也需要恢复，应另行导出 `supabase_migrations`；本方案附带迁移源文件，未宣称保存 CLI 内部历史。
当前项目自定义 Auth 对象是上述触发器；未来增加其他 Auth/Storage 触发器或策略时，也需要扩展备份脚本。

恢复成功后：

1. 在 Database → Publications 中确认 `supabase_realtime` 包含 `public.user_states`。
2. 对照备份检查账号和 `user_states`、`sync_operations` 行数及关键记录。
3. 在测试版应用中登录已有账号，验证记录、跨设备同步和临时密码变更流程。
4. 使用两个测试账号验证 RLS：不能读取对方数据；确认匿名用户无数据读取权限。
5. 确认新项目的 Auth 设置、站点 URL 与应用环境变量后，再安排切换。

成功下载、解密和校验不等于完成数据库恢复演练；以隔离项目恢复并通过应用验证为准。

## 维护

私有备份仓库保存此工作流、备份脚本、本文档及 `supabase/migrations` 的副本。
修改备份逻辑或应用数据库迁移后，需要将相关文件同步到私有仓库；它不会自动拉取公开仓库的任意改动。
失败排查完成并手动备份成功后，关闭 `Database backup needs attention` Issue。

参考：[Supabase 自动备份](https://supabase.com/docs/guides/deployment/ci/backups)、
[官方恢复流程](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)、
[GitHub Actions 通知](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications)。
