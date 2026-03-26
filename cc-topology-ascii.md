<!--
功能：Claude Code 通过账号池网关接入 LobeHub 的完整拓扑（ASCII）
作者：Anner
创建时间：2026/3/26
-->

# lobe-to-cc  ·  Topology

```text
    ┌──────────────────────────────────────────────────────┐
    │            Claude Code / Anthropic Client            │
    │                                                      │
    │  ANTHROPIC_BASE_URL    http://127.0.0.1:8787         │
    │  ANTHROPIC_AUTH_TOKEN  local-dev-token               │
    └──────────────────────────┬───────────────────────────┘
                               │
                   POST /v1/messages  ·  GET /v1/models
                               │
                               ▼
    ┌──────────────────────────────────────────────────────┐
    │             Local Gateway  :8787                     │
    │              src/gateway.mjs                         │
    │                                                      │
    │  ├─ GET  /v1/models                                  │
    │  ├─ POST /v1/messages                                │
    │  ├─ POST /v1/messages/count_tokens                   │
    │  ├─ GET  /debug/accounts                             │
    │  └─ GET  /admin                  (HAR import UI)     │
    └──────────────────────────┬───────────────────────────┘
                               │  Bearer / X-Api-Key
                               ▼
┌───────────────────────────────────────────────────────┐  ┌──────────────────────┐
│                    Account Router                     │  │  account-pool.toml   │
│              src/lib/account-routing.mjs              │◄─┤                      │
│                                                       │  │  [gateway]           │
│  strategy                                             │  │    auth_token        │
│  ├─ active       always use active_account            │  │    cooldown_ms       │
│  ├─ round_robin  rotate across pool                   │  │                      │
│  ├─ failover     prefer accounts without errors       │  │  [pool]              │
│  └─ least_used   prefer fewest total requests         │  │    strategy          │
│                                                       │  │    active_account    │
│  session affinity  SHA-1(system + first user msg)     │  │                      │
│  cooldown check    skip recently failed accounts      │  │  [[accounts]]        │
│  rate window       max_requests_per_minute            │  │    name              │
│  concurrency cap   max_concurrent_per_account         │  │    base_url          │
└──────────────────────────────┬────────────────────────┘  │    x_agent_id        │
                               │  selected account          │    x_lobe_chat_auth  │
                               ▼                           │    x_topic_id        │
┌───────────────────────────────────────────────────────┐  └──────────────────────┘
│                 Request Translation                   │  ┌──────────────────────┐
│             src/lib/anthropic-to-lobe.mjs             │─►│  account-usage.json  │
│                                                       │  │                      │
│  fields  ── system · messages · tools                 │  │  total_requests      │
│           ── tool_result · thinking                   │  │  last_used_at        │
│           ── temperature · top_p · max_tokens         │  │  last_failure_at     │
│                                                       │  │  active_requests     │
│  inject headers                                       │  └──────────────────────┘
│           ── x-agent-id                               │
│           ── x-lobe-chat-auth                         │
│           ── x-topic-id                               │
└──────────────────────────────┬────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────┐
    │              LobeHub Upstream                        │
    │        https://aichat.fineres.com                    │
    │        POST /webapi/chat/anthropic                   │
    └──────────────────────────┬───────────────────────────┘
                               │  Lobe SSE stream
                               ▼
    ┌──────────────────────────────────────────────────────┐
    │              SSE Re-encoding                         │
    │       src/lib/lobe-to-anthropic-stream.mjs           │
    │                                                      │
    │  Lobe chunks  →  message_start                       │
    │               →  content_block_start                 │
    │               →  content_block_delta                 │
    │               →  tool_use / tool_result              │
    │               →  message_delta / stop_reason         │
    └──────────────────────────┬───────────────────────────┘
                               │  Anthropic-standard SSE
                               ▼
    ┌──────────────────────────────────────────────────────┐
    │            Claude Code / Anthropic Client            │
    └──────────────────────────────────────────────────────┘
```

## Why It Works

- Claude Code 连接的是本地兼容网关，不直接访问 LobeHub
- 网关对外暴露 Anthropic 风格接口，对内转发到 LobeHub 上游
- 账号池保存了真实浏览器会话头，网关转发时自动注入
- 同一会话通过 SHA-1 fingerprint 保持账号粘性
- 上游流式响应重新编码为 Anthropic SSE，客户端无感知差异

## Routing Strategies

| strategy     | behavior                              |
|--------------|---------------------------------------|
| `active`     | 固定使用 `active_account`              |
| `round_robin`| 依次轮询所有可用账号                    |
| `failover`   | 优先无错误记录的账号                    |
| `least_used` | 优先累计请求数最少的账号（默认）         |

## Availability Guards

- **cooldown** — 失败后冷却 N 毫秒（`cooldown_ms`）
- **min_interval** — 两次请求最短间隔（`min_interval_ms`）
- **concurrency** — 单账号最大并发数（`max_concurrent_per_account`）
- **rate window** — 每分钟最大请求数（`max_requests_per_minute`）

## Fallback

如果 `data/account-pool.toml` 不存在，网关回退到旧版 JSON 配置：

```
data/gateway-config.json   →  [gateway] 段
data/chat-config.json      →  [chat] 段
data/session.json          →  [[accounts]] 单账号
```
