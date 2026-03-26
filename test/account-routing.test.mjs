/**
 * 测试账号路由稳定性与故障切换
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConversationKey,
  createAccountRouter
} from '../src/lib/account-routing.mjs';

test('根据 system 和首条用户消息生成稳定会话键', () => {
  const key = buildConversationKey({
    system: 'You are helpful.',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'hi' }] }
    ]
  });

  assert.equal(typeof key, 'string');
  assert.ok(key.length > 10);
});

test('同一会话键在粘性窗口内保持同一账号', () => {
  const router = createAccountRouter();
  const config = {
    pool: {
      strategy: 'round_robin',
      active_account: 'a',
      cursor: 0,
      failures: {}
    },
    accounts: [
      { name: 'a' },
      { name: 'b' }
    ]
  };

  const account1 = router.pickAccount(config, 'session-1');
  const account2 = router.pickAccount(config, 'session-1');

  assert.equal(account1.name, 'a');
  assert.equal(account2.name, 'a');
});

test('不同会话在 round_robin 下推进游标', () => {
  const router = createAccountRouter();
  const config = {
    pool: {
      strategy: 'round_robin',
      active_account: 'a',
      cursor: 0,
      failures: {}
    },
    accounts: [
      { name: 'a' },
      { name: 'b' }
    ]
  };

  const account1 = router.pickAccount(config, 'session-1');
  const account2 = router.pickAccount(config, 'session-2');

  assert.equal(account1.name, 'a');
  assert.equal(account2.name, 'b');
});

test('账号失败后切换到下一个可用账号', () => {
  const router = createAccountRouter();
  const config = {
    pool: {
      strategy: 'failover',
      active_account: 'a',
      cursor: 0,
      failures: {}
    },
    accounts: [
      { name: 'a' },
      { name: 'b' }
    ]
  };

  const before = router.pickAccount(config, 'session-1');
  router.recordFailure(config, before.name);
  const after = router.pickAccount(config, 'session-2');

  assert.equal(before.name, 'a');
  assert.equal(after.name, 'b');
  assert.equal(config.pool.failures.a, 1);
});
