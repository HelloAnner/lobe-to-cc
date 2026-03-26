/**
 * 测试账号可用性评估
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateAccountAvailability } from '../src/lib/account-routing.mjs';

test('最近请求间隔不足时返回 min_interval 限制原因', () => {
  const result = evaluateAccountAvailability({
    name: 'a'
  }, {
    gateway: {
      min_interval_ms: 5000
    }
  }, {
    accounts: {
      a: {
        last_used_at: '2026-03-26T04:00:00.000Z'
      }
    }
  }, '2026-03-26T04:00:03.000Z');

  assert.equal(result.available, false);
  assert.equal(result.reason, 'min_interval');
});

test('活跃请求数超过并发上限时返回 concurrency 限制原因', () => {
  const result = evaluateAccountAvailability({
    name: 'a'
  }, {
    gateway: {
      max_concurrent_per_account: 1
    }
  }, {
    accounts: {
      a: {
        active_requests: 1
      }
    }
  }, '2026-03-26T04:00:10.000Z');

  assert.equal(result.available, false);
  assert.equal(result.reason, 'concurrency');
});

test('分钟窗口内请求过多时返回 rate_window 限制原因', () => {
  const result = evaluateAccountAvailability({
    name: 'a'
  }, {
    gateway: {
      max_requests_per_minute: 2
    }
  }, {
    accounts: {
      a: {
        request_timestamps: [
          '2026-03-26T04:00:00.000Z',
          '2026-03-26T04:00:20.000Z'
        ]
      }
    }
  }, '2026-03-26T04:00:30.000Z');

  assert.equal(result.available, false);
  assert.equal(result.reason, 'rate_window');
});

test('冷却结束且未超过限制时可用', () => {
  const result = evaluateAccountAvailability({
    name: 'a'
  }, {
    gateway: {
      cooldown_ms: 600000,
      min_interval_ms: 1000,
      max_concurrent_per_account: 1,
      max_requests_per_minute: 10
    }
  }, {
    accounts: {
      a: {
        last_failure_at: '2026-03-26T03:00:00.000Z',
        last_used_at: '2026-03-26T03:10:00.000Z',
        active_requests: 0,
        request_timestamps: ['2026-03-26T03:10:00.000Z']
      }
    }
  }, '2026-03-26T03:20:00.000Z');

  assert.equal(result.available, true);
  assert.equal(result.reason, null);
});
