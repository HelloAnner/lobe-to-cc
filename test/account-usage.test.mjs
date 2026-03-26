/**
 * 测试账号使用情况记录与基于使用量的分流
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyUsageState,
  recordAccountAttempt,
  recordAccountResult
} from '../src/lib/account-usage-store.mjs';
import { createAccountRouter } from '../src/lib/account-routing.mjs';

test('记录账号请求次数与成功失败次数', () => {
  const state = createEmptyUsageState();

  recordAccountAttempt(state, 'a');
  recordAccountResult(state, 'a', { ok: true });
  recordAccountAttempt(state, 'a');
  recordAccountResult(state, 'a', { ok: false });

  assert.equal(state.accounts.a.total_requests, 2);
  assert.equal(state.accounts.a.success_requests, 1);
  assert.equal(state.accounts.a.failed_requests, 1);
  assert.equal(state.accounts.a.consecutive_failures, 1);
});

test('least_used 策略优先选择请求更少的账号', () => {
  const router = createAccountRouter();
  const usageState = {
    accounts: {
      a: { total_requests: 10 },
      b: { total_requests: 2 }
    }
  };

  const account = router.pickAccount({
    pool: {
      strategy: 'least_used',
      active_account: 'a',
      failures: {}
    },
    accounts: [
      { name: 'a' },
      { name: 'b' }
    ]
  }, 'session-1', usageState);

  assert.equal(account.name, 'b');
});

test('同一会话在 least_used 下仍保持账号粘性', () => {
  const router = createAccountRouter();
  const usageState = {
    accounts: {
      a: { total_requests: 1 },
      b: { total_requests: 0 }
    }
  };

  const first = router.pickAccount({
    pool: {
      strategy: 'least_used',
      active_account: 'a',
      failures: {}
    },
    accounts: [
      { name: 'a' },
      { name: 'b' }
    ]
  }, 'same-session', usageState);

  usageState.accounts.b.total_requests = 99;

  const second = router.pickAccount({
    pool: {
      strategy: 'least_used',
      active_account: 'a',
      failures: {}
    },
    accounts: [
      { name: 'a' },
      { name: 'b' }
    ]
  }, 'same-session', usageState);

  assert.equal(first.name, 'b');
  assert.equal(second.name, 'b');
});
