/**
 * 测试账号失败冷却时间
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { isAccountCoolingDown, createAccountRouter } from '../src/lib/account-routing.mjs';

test('失败时间在冷却窗口内时视为冷却中', () => {
  const state = {
    accounts: {
      a: {
        last_failure_at: '2026-03-26T03:00:00.000Z'
      }
    }
  };

  assert.equal(isAccountCoolingDown(state, 'a', {
    cooldownMs: 10 * 60 * 1000,
    now: '2026-03-26T03:05:00.000Z'
  }), true);
});

test('超过冷却窗口后恢复可选', () => {
  const state = {
    accounts: {
      a: {
        last_failure_at: '2026-03-26T03:00:00.000Z'
      }
    }
  };

  assert.equal(isAccountCoolingDown(state, 'a', {
    cooldownMs: 10 * 60 * 1000,
    now: '2026-03-26T03:11:00.000Z'
  }), false);
});

test('least_used 会跳过冷却中的账号', () => {
  const router = createAccountRouter();
  const usageState = {
    accounts: {
      a: {
        total_requests: 0,
        last_failure_at: '2026-03-26T03:00:00.000Z'
      },
      b: {
        total_requests: 10,
        last_failure_at: null
      }
    }
  };

  const account = router.pickAccount({
    pool: {
      strategy: 'least_used',
      active_account: 'a',
      failures: {}
    },
    gateway: {
      cooldown_ms: 10 * 60 * 1000
    },
    accounts: [
      { name: 'a' },
      { name: 'b' }
    ]
  }, 'session-1', usageState, '2026-03-26T03:05:00.000Z');

  assert.equal(account.name, 'b');
});
