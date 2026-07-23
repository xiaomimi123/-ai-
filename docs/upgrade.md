# 升级

## 常规升级流程

```bash
git pull
./deploy.sh
```

`deploy.sh` 本身也会先 `git pull --ff-only`（非 git 仓库会跳过并提示），所以两步可以合并成直接跑
`./deploy.sh`。它会重新 `docker compose build` 拉起新镜像、`docker compose up -d --remove-orphans`
滚动重启有变化的服务，最后跑一遍健康检查（`/api/status`、`/`、`/config.js`）。

## 升级前备份

```bash
./scripts/backup-mysql.sh
```

用 `mysqldump --single-transaction` 导出并 gzip 压缩到 `/root/lingjing-backups/`（可用
`BACKUP_DIR` 环境变量覆盖），默认保留最近 14 份。生产环境建议配 cron 每天自动跑一次，
脚本头部注释里有示例；升级前再手动跑一次留一份最新的。

## 数据库 schema 由 GORM AutoMigrate 处理

新版本如果加了字段或表，后端启动时 GORM 的 `AutoMigrate` 会自动建表/加字段，**不需要手工执行 SQL**。
`AutoMigrate` 只做增量式的"加"（新表、新列、新索引），不会删除或改变已有列，所以是安全的默认行为。

## 回滚

```bash
git checkout <上一个 tag>
./deploy.sh
```

回滚只能回退代码和镜像，**不会自动回滚数据库 schema**——如果新版本已经跑过一次
`AutoMigrate` 加了新列，回滚代码后旧代码大概率还能兼容多出来的列（GORM 默认忽略结构体里没有的
数据库列），但如果新版本做过破坏性的数据迁移，回滚前需要先用上一步的备份恢复数据库，而不是
指望回滚代码就能让数据回到旧结构。

## 警告：SQL 直接操作 `channels` 表之后必须同步 `abilities` 表

One API 的模型路由不是直接查 `channels` 表，而是查 `abilities` 表（渠道 × 模型 × 分组 的可用关系，
按渠道启用时的 `UpdateAbilities` 生成）。如果绕过管理后台 UI，直接用 SQL `INSERT` 往 `channels`
表里插一条渠道记录，`abilities` 表不会自动跟着生成对应记录——结果是管理后台里能看到这个渠道、
状态显示"已启用"，但实际调用时路由不到它，报"当前分组下没有可用的渠道"。

**只要涉及渠道的增删改，一律走管理后台 UI 或调用对应的渠道管理接口，不要绕过应用层直接改
`channels` 表。** 如果确实需要批量导入渠道（比如迁移场景），也要在导入脚本里一并按渠道支持的
每个模型写 `abilities` 表记录，或者导入后在后台对每个渠道走一次"保存"触发 `UpdateAbilities` 重新生成。
