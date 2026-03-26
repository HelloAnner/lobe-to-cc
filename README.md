# lobe-to-cc

> Bridge logged-in LobeHub chat sessions to Claude Code and other Anthropic-compatible clients through a small local gateway.

[![License: MIT](https://img.shields.io/badge/license-MIT-0f766e.svg)](./LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-1f6feb.svg)](https://nodejs.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-8b5cf6.svg)](./package.json)
[![中文文档](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-a16207.svg)](./README.zh-CN.md)

`lobe-to-cc` is a zero-dependency Node.js gateway that exposes Anthropic-style APIs on top of LobeHub's `/webapi/chat/anthropic` endpoint.

It is designed for two practical workflows:

- connect Claude Code to an already authenticated LobeHub session
- use a lightweight local terminal chat client for multi-turn conversations

> Disclaimer
>
> This repository is a technical exploration of protocol translation, account routing, and local tooling.
> It is not an official integration, is not affiliated with LobeHub or Anthropic, and should not be treated as a production-grade or supported solution without your own review.

## Highlights

- Anthropic-compatible endpoints: `/v1/models`, `/v1/messages`, `/v1/messages/count_tokens`
- zero-dependency runtime based only on built-in Node.js modules
- account pool support with sticky sessions and failover-aware routing
- routing strategies: `active`, `round_robin`, `failover`, `least_used`
- HAR-based session import for refreshing browser-derived credentials
- built-in terminal chat UI for local multi-turn testing
- usage tracking and account visibility through `/debug/accounts`

## Topology

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

An isolated ASCII note is available in [cc-topology-ascii.md](./cc-topology-ascii.md).

## Requirements

- Node.js 18 or newer
- a valid LobeHub browser session

## Quick Start

### 1. Prepare configuration

Use the example file as your starting point:

```bash
cp data/account-pool.example.toml data/account-pool.toml
```

Then fill in your real session values:

- `x_agent_id`
- `x_lobe_chat_auth`
- `x_topic_id`

The example file is tracked in git. Your real `data/` directory is ignored by default.

### Docker quick start

Run the gateway as a single Docker image with `data/` mounted from the host:

```bash
cp .env_example .env
make start
```

This will:

- build a single local image
- run one container for the gateway
- mount `./data` into `/app/data`
- print the real Claude Code and curl configuration you should use

The startup-related variables live in:

- `.env_example`: versioned template
- `.env`: local private runtime overrides

### 2. Start the terminal client

```bash
npm start
```

Commands:

- regular text: continue chatting
- `/reset`: clear local history
- `/exit`: exit the UI

### 3. Start the local gateway

```bash
npm run start:gateway
```

Default local endpoint:

- `http://127.0.0.1:8787`

Default local auth:

- `Authorization: Bearer local-dev-token`
- `X-Api-Key: local-dev-token`

### 4. Inspect account status

```bash
curl -H "X-Api-Key: local-dev-token" http://127.0.0.1:8787/debug/accounts
```

## Use With Claude Code

Point Claude Code at the local gateway:

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
export ANTHROPIC_AUTH_TOKEN=local-dev-token
claude
```

Quick smoke test:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 \
ANTHROPIC_AUTH_TOKEN=local-dev-token \
claude -p --model claude-opus-4-6 "Reply with OK"
```

Why this works:

- Claude Code sees a standard Anthropic-style API
- the gateway translates request payloads to the LobeHub upstream format
- the gateway injects browser-derived session headers from the selected account
- upstream streaming responses are translated back into Anthropic SSE

## Import Session From HAR

When your browser session changes, refresh the account entry from a HAR file:

```bash
node src/tools/extract-session-from-har.mjs /path/to/aichat.fineres.com.har fineres-primary
```

This updates the matching account inside `data/account-pool.toml`.

If `data/account-pool.toml` does not exist, the tool falls back to the legacy `data/session.json` path for backward compatibility.

## Account Pool Routing

Supported strategies:

- `active`: always use `active_account`
- `round_robin`: rotate across available accounts
- `failover`: prefer accounts without recorded failures
- `least_used`: prefer the account with fewer recorded requests

Runtime behavior:

- conversations are sticky to a selected account
- failures are recorded and influence future selection
- `cooldown_ms` can keep recently failed accounts out of priority selection
- usage stats are persisted to `data/account-usage.json`

## Configuration Files

### `data/account-pool.example.toml`

Versioned example configuration for new setups.

### `data/account-pool.toml`

Your real local runtime configuration:

- `[gateway]`: local host, port, auth token, cooldown
- `[chat]`: default model and sampling options
- `[pool]`: routing strategy and active account
- `[[accounts]]`: upstream base URL and session headers

### `data/history.json`

Multi-turn local chat history for the terminal client.

### `data/account-usage.json`

Automatically maintained usage and failure counters.

### Legacy compatibility

Older JSON-based config is still supported:

- `data/gateway-config.json`
- `data/chat-config.json`
- `data/session.json`

## Project Structure

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

## Development

Run tests:

```bash
npm test
```

Available scripts:

- `npm start`: start the terminal chat client
- `npm run start:gateway`: start the Anthropic-compatible gateway
- `npm test`: run the test suite

## Security Notes

- never commit real session headers
- keep your private runtime config only inside ignored local files under `data/`
- treat this repository as an experiment, not a managed integration boundary

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
