/**
 * 测试账号池 TOML 更新与账号选择策略
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { upsertAccountSessionInToml, selectActiveAccount } from '../src/lib/account-pool-manager.mjs';

test('将 HAR 提取出的认证写回指定账号', () => {
  const content = `
[gateway]
host = "127.0.0.1"
port = 8787
auth_token = "local-dev-token"

[pool]
active_account = "primary"

[[accounts]]
name = "primary"
base_url = "https://aichat.fineres.com"
x_agent_id = "old-agent"
x_lobe_chat_auth = "old-token"
x_topic_id = "old-topic"
  `.trim();

  const updated = upsertAccountSessionInToml(content, 'primary', {
    xAgentId: 'new-agent',
    xLobeChatAuth: 'new-token',
    xTopicId: 'new-topic'
  });

  assert.match(updated, /x_agent_id = "new-agent"/);
  assert.match(updated, /x_lobe_chat_auth = "new-token"/);
  assert.match(updated, /x_topic_id = "new-topic"/);
});

test('账号不存在时自动追加新账号', () => {
  const content = `
[pool]
active_account = "primary"

[[accounts]]
name = "primary"
base_url = "https://aichat.fineres.com"
  `.trim();

  const updated = upsertAccountSessionInToml(content, 'backup', {
    xAgentId: 'agt_backup',
    xLobeChatAuth: 'token_backup',
    xTopicId: 'tpc_backup'
  });

  assert.match(updated, /\[\[accounts\]\]\nname = "backup"/);
  assert.match(updated, /x_agent_id = "agt_backup"/);
});

test('按 active_account 选择账号', () => {
  const account = selectActiveAccount(
    {
      strategy: 'active',
      activeAccount: 'b'
    },
    [
      { name: 'a' },
      { name: 'b' }
    ]
  );

  assert.equal(account.name, 'b');
});

test('轮询策略根据计数选择账号', () => {
  const account = selectActiveAccount(
    {
      strategy: 'round_robin',
      activeAccount: 'a',
      cursor: 3
    },
    [
      { name: 'a' },
      { name: 'b' },
      { name: 'c' }
    ]
  );

  assert.equal(account.name, 'a');
});

test('故障切换策略跳过失败账号', () => {
  const account = selectActiveAccount(
    {
      strategy: 'failover',
      activeAccount: 'a',
      failures: {
        a: 2
      }
    },
    [
      { name: 'a' },
      { name: 'b' }
    ]
  );

  assert.equal(account.name, 'b');
});
