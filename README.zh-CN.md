# lobe-to-cc

> 一个把已登录的 LobeHub 会话桥接给 Claude Code 和其他 Anthropic 兼容客户端的本地网关。

[![License: MIT](https://img.shields.io/badge/license-MIT-0f766e.svg)](./LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-1f6feb.svg)](https://nodejs.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-8b5cf6.svg)](./package.json)
[![English README](https://img.shields.io/badge/README-English-a16207.svg)](./README.md)

`lobe-to-cc` 是一个零依赖的 Node.js 本地网关，用来把 LobeHub 的 `/webapi/chat/anthropic` 能力暴露成 Anthropic 风格接口。

适合两类使用方式：

- 把 Claude Code 接到一个已经登录的 LobeHub 会话上
- 在本地终端中运行轻量的多轮聊天页面

> 免责声明
>
> 本仓库仅用于协议桥接、账号路由和本地工具链的技术探索。
> 它不是官方集成方案，也不代表与 LobeHub 或 Anthropic 存在任何官方关系；在任何生产或团队使用场景前，都应由你自行评估风险。

## 主要能力

- Anthropic 兼容接口：`/v1/models`、`/v1/messages`、`/v1/messages/count_tokens`
- 零依赖运行：仅依赖 Node.js 内置模块
- 账号池支持：会话粘性、分流和故障切换
- 路由策略：`active`、`round_robin`、`failover`、`least_used`
- HAR 导入：从浏览器导出的 HAR 中刷新登录态
- 本地终端聊天：用于多轮调试和快速验证
- 调试接口：通过 `/debug/accounts` 查看账号使用情况

## 拓扑

```text
[ Claude Code / Anthropic Client ]
                |
                | ANTHROPIC_BASE_URL=http://127.0.0.1:8787
                | ANTHROPIC_AUTH_TOKEN=local-dev-token
                v
[ Local Gateway ]
  src/gateway.mjs
  127.0.0.1:8787
                |
                | validate token
                | load runtime
                v
[ data/account-pool.toml ]
  [gateway]
  [chat]
  [pool]
  [[accounts]]
                |
                | pick account
                | attach session headers
                v
[ LobeHub Upstream ]
  https://aichat.fineres.com
  /webapi/chat/anthropic
                |
                | Lobe SSE -> Anthropic SSE
                v
[ Claude Code / Anthropic Client ]
```

独立 ASCII 说明见：[cc-topology-ascii.md](./cc-topology-ascii.md)。

## 环境要求

- Node.js 18 或更高版本
- 一个有效的 LobeHub 浏览器登录态

## 快速开始

### 1. 准备配置

先复制示例配置：

```bash
cp data/account-pool.example.toml data/account-pool.toml
```

然后填入真实值：

- `x_agent_id`
- `x_lobe_chat_auth`
- `x_topic_id`

示例文件会纳入版本库，真实 `data/` 目录默认被忽略，不会进入 git。

### 2. 启动终端聊天

```bash
npm start
```

可用命令：

- 普通文本：继续聊天
- `/reset`：清空本地历史
- `/exit`：退出界面

### 3. 启动本地网关

```bash
npm run start:gateway
```

默认地址：

- `http://127.0.0.1:8787`

默认认证：

- `Authorization: Bearer local-dev-token`
- `X-Api-Key: local-dev-token`

### 4. 查看账号状态

```bash
curl -H "X-Api-Key: local-dev-token" http://127.0.0.1:8787/debug/accounts
```

## 与 Claude Code 配合使用

把 Claude Code 指向本地网关：

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

这条链路成立的原因：

- Claude Code 面向的是一个标准 Anthropic 风格接口
- 本地网关把请求体转换成 LobeHub 上游可以接受的格式
- 网关从账号池中取出真实浏览器会话头去请求上游
- 上游流式响应会被重新编码成 Anthropic SSE

## 从 HAR 导入登录态

当浏览器登录态发生变化时，可以重新导入 HAR：

```bash
node src/tools/extract-session-from-har.mjs /path/to/aichat.fineres.com.har fineres-primary
```

这会更新 `data/account-pool.toml` 中对应账号的登录态。

如果 `data/account-pool.toml` 不存在，工具会回退写入旧版 `data/session.json`，用于兼容旧配置。

## 账号池路由

支持的策略：

- `active`：固定使用 `active_account`
- `round_robin`：在可用账号之间轮询
- `failover`：优先选取没有失败记录的账号
- `least_used`：优先选取累计请求更少的账号

运行时行为：

- 同一会话会尽量固定到同一个账号
- 失败会被记录，并影响后续选择
- `cooldown_ms` 可以让最近失败的账号暂时退出优先选择
- 使用统计会写入 `data/account-usage.json`

## 配置文件

### `data/account-pool.example.toml`

仓库自带的示例配置文件，用于初始化本地环境。

### `data/account-pool.toml`

你的真实本地运行配置：

- `[gateway]`：本地监听地址、token、冷却时间
- `[chat]`：默认模型和采样参数
- `[pool]`：账号选择策略
- `[[accounts]]`：上游地址和登录态头

### `data/history.json`

本地终端聊天的多轮历史。

### `data/account-usage.json`

自动维护的账号使用和失败统计。

### 旧版兼容

仍然兼容以下 JSON 配置：

- `data/gateway-config.json`
- `data/chat-config.json`
- `data/session.json`

## 项目结构

```text
.
├── data/
│   └── account-pool.example.toml
├── docs/
├── src/
│   ├── cli.mjs
│   ├── gateway.mjs
│   ├── lib/
│   └── tools/
├── test/
├── cc-topology-ascii.md
├── README.md
└── README.zh-CN.md
```

## 开发

运行测试：

```bash
npm test
```

可用脚本：

- `npm start`：启动终端聊天
- `npm run start:gateway`：启动本地兼容网关
- `npm test`：执行测试

## 安全说明

- 不要提交真实登录态头
- 私有运行配置只应保存在被忽略的本地 `data/` 文件中
- 这个仓库应被视为实验项目，而不是受支持的正式集成边界

## 许可证

本项目采用 MIT License，见 [LICENSE](./LICENSE)。
