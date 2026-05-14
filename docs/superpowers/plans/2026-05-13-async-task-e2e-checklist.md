# 异步任务系统 E2E 测试 checklist

> Run through every checkbox before flipping ENABLE_TASK_SYSTEM=true on production.
> Server: `8.218.203.189` (HK), domain `api.aitoken.homes`.

## 1. 预上线检查（开发/测试环境）

- [ ] `cd backend && go test ./...` 全 PASS（pre-existing common/image flake 可忽略）
- [ ] `cd frontend && npm run build` 成功
- [ ] `cd admin && npm run build` 成功
- [ ] 启动 backend with `ENABLE_TASK_SYSTEM=false`:
  - [ ] `curl http://localhost:3000/api/status` → 200
  - [ ] 日志无 "task worker started"
  - [ ] `curl http://localhost:3000/v1/tasks/x` → 404 (路由未注册)
- [ ] 启动 backend with `ENABLE_TASK_SYSTEM=true`:
  - [ ] 日志包含 "task worker started"
  - [ ] `curl http://localhost:3000/v1/tasks/x` → 401（路由存在但无 token）
- [ ] DB 自动迁移: `docker exec one-api-mysql mysql ... -e "SHOW TABLES LIKE 'tasks';"` → 表存在
- [ ] DB schema: `... -e "SHOW COLUMNS FROM logs WHERE Field='task_id';"` → 字段存在

## 2. 同步路径回归（必须无变化）

- [ ] `curl POST /v1/chat/completions model=gpt-3.5-turbo` 正常 stream
- [ ] `curl POST /v1/images/generations model=gpt-image-1` 同步返 url（不变）
- [ ] `curl POST /v1/images/generations model=dall-e-3` 同步返 url
- [ ] Playground 聊天 tab 工作正常
- [ ] Playground 文生图 tab 工作正常（同步路径不动）
- [ ] Admin 现有页面（用户/渠道/订单/日志）全部正常加载

## 3. 异步路径（提交 → 轮询 → 完成）

- [ ] Admin 后台新建渠道：ApiMart (type=57), group=admin, key=<apimart>
- [ ] 用 admin group 的 token，curl 提交:
  ```bash
  curl -X POST https://api.aitoken.homes/v1/images/generations \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"model":"gpt-image-2","prompt":"a cat","n":1,"size":"16:9","resolution":"1k"}'
  ```
  - [ ] HTTP 200 returns `{data:[{task_id, status:"submitted"}]}`
- [ ] `SELECT * FROM tasks WHERE task_id='<id>'` → status=SUBMITTED, quota deducted
- [ ] `curl GET /v1/tasks/<task_id>` 多次 → status: submitted → in_progress → completed
- [ ] task 完成后 `tasks.status=SUCCESS`, `data` 字段含上游响应
- [ ] `SELECT type, content, task_id FROM logs WHERE task_id='<id>'` → 看到 pre-consume 和 settle 两条记录
- [ ] 用户实际 quota 已扣除（不会因 settle 再扣一次）
- [ ] Playground 异步 tab 走全链路一遍：提交 → 看到进度 → 完成 → 下载图片

## 4. 失败 / 退款

- [ ] 故意配错 apimart key → 提交 → 上游 401 → task 转 FAILURE → user.quota 已退回
- [ ] 让 worker fetch 失败 5 次（mock 服务器持续返 500）→ task 转 FAILURE → quota 退回
- [ ] `SELECT type, quota FROM logs WHERE task_id='<failed_id>'`: 看到 PreConsume (-N) + Refund (+N)
- [ ] `tasks.refund_log_id` 已设置（非 0 / 非 -1）

## 5. 超时

- [ ] 设置 `TASK_TIMEOUT_MINUTES=1`，提交后让 worker 拉 1 分 5 秒
- [ ] 检查 task 转 TIMEOUT，fail_reason="worker_timeout"
- [ ] quota 已退回

## 6. 取消

- [ ] Playground 提交 → 立刻点"取消"
- [ ] task 转 FAILURE, fail_reason="user_canceled"
- [ ] quota 退回
- [ ] curl POST `/v1/tasks/<id>/cancel` 重复调用 → 仍然 200，但 quota 不会再次退回（幂等）

## 7. Admin 接口

- [ ] `/admin/tasks` 页面列表加载
- [ ] 筛选 platform/status/user_id/keyword 都生效
- [ ] 点 "详情" 显示完整 JSON
- [ ] 点 "重试" (FAILURE task) → task 转回 SUBMITTED，worker 接管
- [ ] 点 "退款" (SUCCESS task) → 弹窗要 reason → 二次确认 → user.quota 增加
- [ ] 双击 "退款" 按钮 → 第二次提示已退款，不会双扣（refund_log_id 原子守卫）

## 8. 回滚演练

- [ ] 跑 `./scripts/deploy-task-system.sh rollback`
- [ ] ENABLE_TASK_SYSTEM 改成 false
- [ ] 镜像回到 rollback-task-* tag
- [ ] 同步图像 + 聊天恢复正常
- [ ] `curl /v1/tasks/x` → 404（路由消失）
- [ ] 已存在的 tasks 数据保留（无害遗留）

## 9. 监控就位

- [ ] `scripts/monitor-task-system.sh` 已 chmod +x
- [ ] crontab 已加：`*/5 * * * * /root/lingjing-ai/scripts/monitor-task-system.sh`
- [ ] 告警 webhook 测试一次（人为触发 stuck 任务 SQL，等下次 cron 触发告警）

---

## 通过标准

全部 8 项通过 + 监控就位 = 可以从 admin group 改成 default group，对外开放。
