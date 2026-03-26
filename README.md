<!--
功能：介绍项目能力、使用方式、配置结构与 Claude Code 接入链路
作者：Anner
创建时间：2026/3/26
-->

# lobe-to-cc

一个用于把 LobeHub 的 `/webapi/chat/anthropic` 会话能力桥接给 Claude Code 和其他 Anthropic 客户端的本地兼容网关。

> Disclaimer
>
> This repository is a technical exploration project for protocol bridging and local tooling experiments.
> It is not an official integration, not affiliated with LobeHub or Anthropic, and should be evaluated carefully before any production or team-wide use.

它适合两类场景：

- 把 Claude Code 接到已经登录的 LobeHub 会话上
- 在本地终端里直接跑一个轻量的多轮聊天页

项目默认使用 `data/account-pool.toml` 作为统一配置入口，支持账号池、会话粘性、流量分摊和故障切换；旧版 `data/*.json` 配置仍然保留兼容。

## Features

- Anthropic 兼容接口：提供 `/v1/models`、`/v1/messages`、`/v1/messages/count_tokens`
- 零依赖运行：仅使用 Node.js 内置能力
- 本地账号池：统一维护网关配置、聊天参数和多个登录态
- 会话粘性：同一轮对话会尽量固定到同一个账号
- 路由策略：支持 `active`、`round_robin`、`failover`、`least_used`
- 使用记录：自动写入 `data/account-usage.json`
- HAR 导入：可从浏览器导出包中提取最新登录态
- 本地终端聊天：内置一个简单稳定的多轮 CLI 页面

## Architecture

```text
[ Claude Code / Anthropic Client ]
                |
                | ANTHROPIC_BASE_URL
                | ANTHROPIC_AUTH_TOKEN
                v
[ Local Gateway ]
  src/gateway.mjs
                |
                | read runtime
                v
[ data/account-pool.toml ]
  gateway / chat / pool / accounts
                |
                | pick account
                | attach x-agent-id
                | attach x-lobe-chat-auth
                | attach x-topic-id
                v
[ LobeHub Upstream ]
  https://aichat.fineres.com
  /webapi/chat/anthropic
                |
                | translate SSE
                v
[ Anthropic-Compatible Response ]
```

独立 ASCII 说明见：[cc-topology-ascii.md](/Users/anner/Downloads/lobehub-api-test-docs/cc-topology-ascii.md)。

## Requirements

- Node.js 18 或更高版本
- 一个可用的 LobeHub 登录态

## Quick Start

### 1. 准备配置

项目默认读取 `data/account-pool.toml`。一个最小可用示例如下：

```toml
[gateway]
host = "127.0.0.1"
port = 8787
auth_token = "local-dev-token"
cooldown_ms = 600000

[chat]
model = "claude-opus-4-6"
system_prompt = "你是一个简洁、专业的中文终端助手。优先直接回答问题，必要时给出清晰步骤。"
temperature = 1
top_p = 0.8
enabled_search = false
thinking_type = "disabled"

[pool]
strategy = "least_used"
active_account = "fineres-primary"

[[accounts]]
name = "fineres-primary"
base_url = "https://aichat.fineres.com"
model = "claude-opus-4-6"
x_agent_id = "your-agent-id"
x_lobe_chat_auth = "your-lobe-chat-auth"
x_topic_id = "your-topic-id"
```

### 2. 启动本地聊天页

```bash
npm start
```

启动后会进入一个简单的多轮终端会话页。

- 输入普通文本：继续聊天
- 输入 `/reset`：清空本地历史
- 输入 `/exit`：退出页面

### 3. 启动 Anthropic 兼容网关

```bash
npm run start:gateway
```

默认监听：

- `http://127.0.0.1:8787`
- `auth_token = local-dev-token`

支持两种认证头：

- `Authorization: Bearer local-dev-token`
- `X-Api-Key: local-dev-token`

查看账号池与使用状态：

```bash
curl -H "X-Api-Key: local-dev-token" http://127.0.0.1:8787/debug/accounts
```

## Use With Claude Code

启动网关后，Claude Code 可以直接指到本地地址：

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
export ANTHROPIC_AUTH_TOKEN=local-dev-token
claude
```

快速验证：

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 \
ANTHROPIC_AUTH_TOKEN=local-dev-token \
claude -p --model claude-opus-4-6 "Reply with OK"
```

为什么这条链路能工作：

- Claude Code 看到的是一个标准 Anthropic API
- 本地网关把请求体翻译成 LobeHub 能接受的格式
- 网关从账号池里取出真实浏览器会话头，代替客户端请求上游
- 上游返回的 Lobe SSE 会被重新编码成 Anthropic SSE

## Import Session From HAR

如果网页重新登录导致 token 变化，可以重新导入 HAR：

```bash
node src/tools/extract-session-from-har.mjs /path/to/aichat.fineres.com.har fineres-primary
```

这会把最新登录态写回 `data/account-pool.toml` 中对应的账号块。

如果 `data/account-pool.toml` 不存在，工具会自动回退写入 `data/session.json`，用于兼容旧版配置。

## Account Pool

`[pool]` 当前支持四种策略：

- `strategy = "active"`：固定使用 `active_account`
- `strategy = "round_robin"`：按顺序轮询账号
- `strategy = "failover"`：优先使用未标记失败的账号
- `strategy = "least_used"`：优先把新会话分给累计请求更少的账号

网关运行时会做两件事：

- 为同一会话保留账号粘性，避免对话中途切账号
- 在账号失败时记录状态，并在可用账号之间切换

如果目标是降低被感知到的风险，建议优先使用：

```toml
[pool]
strategy = "least_used"
active_account = "fineres-primary"
```

这样新会话会尽量均匀分摊到使用次数更少的账号，但同一会话不会中途漂移。

如果某个账号刚失败过，`[gateway]` 里的 `cooldown_ms` 会让它在冷却窗口内暂时不参与优先选择。默认是 `600000`，也就是 10 分钟。

## Configuration Layout

### `data/account-pool.toml`

统一配置入口，包含：

- `[gateway]`：监听地址、本地代理 token
- `[chat]`：默认模型和采样参数
- `[pool]`：账号选择策略
- `[[accounts]]`：各账号对应的上游地址和会话头

### `data/history.json`

本地终端聊天的多轮历史。

### `data/account-usage.json`

账号使用情况记录，网关会自动维护。当前会记录：

- `total_requests`
- `success_requests`
- `failed_requests`
- `stream_requests`
- `non_stream_requests`
- `consecutive_failures`
- `last_used_at`
- `last_success_at`
- `last_failure_at`

### 兼容旧版 JSON

以下文件仍然保留兼容读取：

- `data/gateway-config.json`
- `data/chat-config.json`
- `data/session.json`

但新项目建议优先使用 `data/account-pool.toml`。

## Project Structure

```text
.
├── data/
│   ├── account-pool.toml
│   ├── account-usage.json
│   └── history.json
├── src/
│   ├── cli.mjs
│   ├── gateway.mjs
│   ├── lib/
│   └── tools/
├── test/
├── cc-topology-ascii.md
└── README.md
```

## Development

运行测试：

```bash
npm test
```

可用脚本：

- `npm start`：启动终端聊天页
- `npm run start:gateway`：启动 Anthropic 兼容网关
- `npm test`：运行测试

## Notes

- `data/account-pool.toml` 中包含真实会话头，不应该提交到公共仓库
- 建议把示例配置和本地私有配置分开管理
- 当前实现偏向稳定、直接和易于调试，不依赖外部框架
