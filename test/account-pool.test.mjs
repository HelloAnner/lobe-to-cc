/**
 * 测试 TOML 账号池配置解析与选择逻辑
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseToml } from '../src/lib/simple-toml.mjs';
import { deriveRuntimeFromAccountPool } from '../src/lib/runtime-config.mjs';

test('解析账号池 TOML', () => {
  const config = parseToml(`
[gateway]
host = "127.0.0.1"
port = 8787
auth_token = "local-dev-token"

[chat]
model = "claude-opus-4-6"
enabled_search = false
temperature = 1
top_p = 0.8
thinking_type = "disabled"

[pool]
active_account = "primary"

[[accounts]]
name = "primary"
base_url = "https://aichat.fineres.com"
x_agent_id = "agt_1"
x_lobe_chat_auth = "token_1"
x_topic_id = "tpc_1"
  `);

  assert.equal(config.gateway.host, '127.0.0.1');
  assert.equal(config.gateway.port, 8787);
  assert.equal(config.chat.enabled_search, false);
  assert.equal(config.pool.active_account, 'primary');
  assert.equal(config.accounts[0].x_agent_id, 'agt_1');
});

test('根据 active_account 生成运行时配置', () => {
  const runtime = deriveRuntimeFromAccountPool({
    gateway: {
      host: '127.0.0.1',
      port: 8787,
      auth_token: 'local-dev-token'
    },
    chat: {
      model: 'claude-opus-4-6',
      system_prompt: '你是一个助手。',
      temperature: 1,
      top_p: 0.8,
      enabled_search: false,
      thinking_type: 'disabled'
    },
    pool: {
      active_account: 'primary'
    },
    accounts: [
      {
        name: 'primary',
        base_url: 'https://aichat.fineres.com',
        x_agent_id: 'agt_1',
        x_lobe_chat_auth: 'token_1',
        x_topic_id: 'tpc_1'
      }
    ]
  });

  assert.deepEqual(runtime.gatewayConfig, {
    host: '127.0.0.1',
    port: 8787,
    authToken: 'local-dev-token',
    model: 'claude-opus-4-6'
  });
  assert.deepEqual(runtime.chatConfig, {
    baseUrl: 'https://aichat.fineres.com',
    model: 'claude-opus-4-6',
    systemPrompt: '你是一个助手。',
    temperature: 1,
    topP: 0.8,
    thinking: { type: 'disabled' },
    enabledSearch: false
  });
  assert.deepEqual(runtime.session, {
    xAgentId: 'agt_1',
    xLobeChatAuth: 'token_1',
    xTopicId: 'tpc_1'
  });
});
