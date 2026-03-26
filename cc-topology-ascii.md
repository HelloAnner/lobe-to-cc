<!--
功能：说明 Claude Code 通过账号池网关接入 LobeHub 的 ASCII 拓扑
作者：Anner
创建时间：2026/3/26
-->

# Claude Code Topology (ASCII)

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
                | pick active account
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

## Why It Works

- Claude Code 连接的是本地兼容网关，不是直接连接 LobeHub
- 网关对外暴露 Anthropic 风格接口，对内转发到 LobeHub 上游
- 账号池里保存了真实浏览器会话头，网关会在转发时自动注入
- 上游流式响应会被重新编码成 Anthropic SSE，因此客户端无需感知差异

## Routing Notes

- `active`：固定账号
- `round_robin`：轮询账号
- `failover`：故障切换
- 同一会话默认带有账号粘性，尽量避免中途切换账号

## Compatibility

如果 `data/account-pool.toml` 不存在，项目仍可回退到旧版：

- `data/gateway-config.json`
- `data/chat-config.json`
- `data/session.json`
