/**
 * 测试 HAR 导入时按用户信息去重
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { upsertAccountByIdentityInToml } from '../src/lib/account-pool-manager.mjs';

test('按 email 更新已有账号而不是重复追加', () => {
  const content = `
[[accounts]]
name = "fineres-primary"
base_url = "https://aichat.fineres.com"
email = "anner@fanruan.com"
user_id = "Anner"
x_agent_id = "old-agent"
x_lobe_chat_auth = "old-token"
x_topic_id = "old-topic"
  `.trim();

  const updated = upsertAccountByIdentityInToml(content, {
    suggestedName: 'fineres-imported',
    identity: {
      email: 'anner@fanruan.com',
      userId: 'Anner',
      fullName: 'Anner'
    },
    session: {
      xAgentId: 'new-agent',
      xLobeChatAuth: 'new-token',
      xTopicId: 'new-topic'
    }
  });

  const accountCount = (updated.match(/\[\[accounts\]\]/g) || []).length;

  assert.equal(accountCount, 1);
  assert.match(updated, /name = "fineres-primary"/);
  assert.match(updated, /x_agent_id = "new-agent"/);
});

test('无匹配身份时追加新账号并写入用户字段', () => {
  const content = `
[[accounts]]
name = "someone-else"
base_url = "https://aichat.fineres.com"
email = "other@fanruan.com"
  `.trim();

  const updated = upsertAccountByIdentityInToml(content, {
    suggestedName: 'anner-account',
    identity: {
      email: 'anner@fanruan.com',
      userId: 'Anner',
      fullName: 'Anner'
    },
    session: {
      xAgentId: 'agt_new',
      xLobeChatAuth: 'token_new',
      xTopicId: 'tpc_new'
    }
  });

  const accountCount = (updated.match(/\[\[accounts\]\]/g) || []).length;

  assert.equal(accountCount, 2);
  assert.match(updated, /name = "anner-account"/);
  assert.match(updated, /email = "anner@fanruan.com"/);
  assert.match(updated, /user_id = "Anner"/);
});
