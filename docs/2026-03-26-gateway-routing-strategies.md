<!--
功能：说明账号池路由、可靠性与可观测性策略
作者：Anner
创建时间：2026/3/26
-->

# Gateway Routing Strategies

## 目标

本文档描述本地 Anthropic 兼容网关当前采用的账号池、流量治理、故障切换与可观测性策略。

这些策略的目标是：

- 提高稳定性
- 降低瞬时流量集中带来的异常风险
- 保持同一会话上下文连续
- 让运行状态可观测、可排查

本文档只覆盖可靠性与治理能力，不涉及绕过平台控制或规避安全机制。

## 统一配置入口

主配置文件：

`data/account-pool.toml`

当前关键配置项：

```toml
[gateway]
host = "127.0.0.1"
port = 8787
auth_token = "local-dev-token"
cooldown_ms = 600000
min_interval_ms = 1500
max_requests_per_minute = 20
max_concurrent_per_account = 2

[chat]
model = "claude-opus-4-6"

[pool]
strategy = "least_used"
active_account = "fineres-primary"
```

## 账号池结构

账号通过 `[[accounts]]` 声明。

每个账号至少包含：

- `name`
- `base_url`
- `model`
- `x_agent_id`
- `x_lobe_chat_auth`
- `x_topic_id`

登录态更新脚本：

```bash
node src/tools/extract-session-from-har.mjs /path/to/aichat.fineres.com.har fineres-primary
```

该脚本会把最新会话头直接写回 `data/account-pool.toml` 对应账号。

## 路由策略

### 1. `active`

固定使用 `active_account`。

适合：

- 单账号调试
- 排查单个登录态问题

优点：

- 路由可预测
- 便于问题定位

缺点：

- 无法分摊流量

### 2. `round_robin`

新会话按顺序轮询账号。

适合：

- 多账号均衡分配
- 不需要基于历史负载动态判断

优点：

- 实现简单
- 分配相对均匀

缺点：

- 不感知账号最近使用量
- 不感知账号健康度

### 3. `failover`

优先使用未被标记失败的账号。

适合：

- 需要快速避开近期错误账号

优点：

- 故障恢复直接

缺点：

- 不主动均衡流量

### 4. `least_used`

优先选择累计请求数更少的账号。

这是当前默认策略。

适合：

- 希望把新会话尽量摊到使用更少的账号
- 希望降低单账号瞬时集中度

优点：

- 比轮询更贴近实际负载
- 对单机长期运行更稳

缺点：

- 依赖本地 usage 记录

## 会话粘性

即使开启分流，同一会话也不能中途漂账号，否则上下文会断。

当前做法：

- 使用 `system + 第一条 user 消息` 生成稳定会话键
- 路由器对同一会话键保留账号粘性
- 新会话才参与分流

效果：

- 新会话会分散
- 老会话会保持连续

## 故障切换

当前故障切换逻辑：

1. 选择一个账号
2. 请求上游
3. 若失败，记录失败次数
4. 删除该会话的账号粘性
5. 在同一个请求内切换到下一个候选账号重试

这样做的作用：

- 用户不一定会直接看到第一次失败
- 同时不会把会话永久锁死在坏账号上

## 失败冷却

配置项：

```toml
[gateway]
cooldown_ms = 600000
```

含义：

- 账号失败后进入冷却窗口
- 冷却窗口内不再优先选择它
- 默认 10 分钟后恢复可选

这样可以避免：

- 刚失败的账号被连续打到
- 错误被快速放大

## 合规流量治理

### 最小请求间隔

配置项：

```toml
[gateway]
min_interval_ms = 1500
```

作用：

- 如果某账号刚刚被使用过，短时间内不优先再选它

### 每分钟请求上限

配置项：

```toml
[gateway]
max_requests_per_minute = 20
```

作用：

- 统计最近 60 秒请求数
- 超过阈值时暂不优先选择该账号

### 单账号并发上限

配置项：

```toml
[gateway]
max_concurrent_per_account = 2
```

作用：

- 避免一个账号同时承担过多并发请求

## 使用记录

使用记录文件：

`data/account-usage.json`

当前记录字段：

- `total_requests`
- `success_requests`
- `failed_requests`
- `stream_requests`
- `non_stream_requests`
- `active_requests`
- `consecutive_failures`
- `request_timestamps`
- `last_used_at`
- `last_success_at`
- `last_failure_at`

这些字段用于：

- `least_used` 分流
- 冷却判断
- 最小间隔判断
- 窗口限流判断
- 并发限制判断

## 调试与观测

调试端点：

```bash
curl -H "X-Api-Key: local-dev-token" http://127.0.0.1:8787/debug/accounts
```

当前输出包括：

- 网关配置
- 账号池策略
- 全部账号
- 每个账号当前是否可用
- 当前不可用原因
- usage 统计

典型不可用原因：

- `cooldown`
- `min_interval`
- `concurrency`
- `rate_window`

## Docker 单镜像部署

当前仓库已补充：

- `Dockerfile`
- `.dockerignore`
- `Makefile`
- `.env_example`
- `.env`

推荐启动方式：

```bash
cp .env_example .env
make start
```

该命令会：

1. 自动检查 `data/account-pool.toml`
2. 构建单镜像
3. 启动单容器
4. 将宿主机 `./data` 挂载到容器 `/app/data`
5. 输出真实的 Claude Code 接入配置与调试命令

容器内网关会通过环境变量强制监听：

```text
LOBE_GATEWAY_HOST=0.0.0.0
```

这样宿主机端口映射才能正常访问。

启动参数通过 `.env` 注入，常用项包括：

```dotenv
IMAGE_NAME=lobe-to-cc
IMAGE_TAG=local
CONTAINER_NAME=lobe-to-cc
DOCKER_PUBLISH_HOST=127.0.0.1
DOCKER_PUBLISH_PORT=8787
LOBE_GATEWAY_HOST=0.0.0.0
LOBE_GATEWAY_PORT=8787
```

约定：

- `.env_example` 为模板，保留在仓库
- `.env` 为本地私有文件，不提交

启动后应使用宿主机地址：

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
export ANTHROPIC_AUTH_TOKEN=local-dev-token
claude
```

调试：

```bash
curl -H "X-Api-Key: local-dev-token" http://127.0.0.1:8787/debug/accounts
```

说明：

- 运行数据全部外挂到 `data/`
- 镜像本身不保存私有会话数据
- 这样更适合单机部署和后续迁移

## 当前默认建议

如果目标是稳定与适度分散，建议：

```toml
[gateway]
cooldown_ms = 600000
min_interval_ms = 1500
max_requests_per_minute = 20
max_concurrent_per_account = 2

[pool]
strategy = "least_used"
active_account = "fineres-primary"
```

这个组合的特点是：

- 新会话会向低使用账号分摊
- 同一会话不会中途漂账号
- 刚失败账号会进入冷却
- 单账号不会在短时间内被连续或并发打满

## 已实现与未实现

已实现：

- 账号池 TOML 配置
- HAR 登录态回写
- 会话粘性
- `active` / `round_robin` / `failover` / `least_used`
- 故障切换
- 冷却时间
- 最小请求间隔
- 每分钟请求上限
- 并发上限
- 使用记录
- `/debug/accounts`
- Docker 单镜像部署入口
- `make start` 启动与配置输出

未实现：

- 多进程共享的分布式状态
- 精细权重路由
- 自动衰减历史使用量
- 长周期统计分析报表
