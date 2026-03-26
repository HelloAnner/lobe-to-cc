/**
 * 负责账号路由、会话粘性与故障切换
 * @author Anner
 * Created on 2026/3/26
 */
import { createHash } from 'node:crypto';

function toText(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((block) => (block?.type === 'text' ? block.text ?? '' : ''))
    .filter(Boolean)
    .join('\n');
}

export function buildConversationKey(request) {
  const system = typeof request.system === 'string'
    ? request.system
    : Array.isArray(request.system)
      ? request.system.map((item) => item?.text ?? '').join('\n')
      : '';
  const firstUserMessage = (request.messages ?? []).find((message) => message.role === 'user');
  const firstUserText = firstUserMessage ? toText(firstUserMessage.content) : '';
  const source = `${system}\n---\n${firstUserText}`.trim();

  return createHash('sha1').update(source || 'empty-session').digest('hex');
}

export function isAccountCoolingDown(usageState, accountName, options = {}) {
  const cooldownMs = options.cooldownMs ?? 0;
  const lastFailure = usageState?.accounts?.[accountName]?.last_failure_at;

  if (!cooldownMs || !lastFailure) {
    return false;
  }

  const now = new Date(options.now ?? Date.now()).getTime();
  const failedAt = new Date(lastFailure).getTime();

  if (Number.isNaN(now) || Number.isNaN(failedAt)) {
    return false;
  }

  return now - failedAt < cooldownMs;
}

function countRecentRequests(usageState, accountName, now, windowMs) {
  const timestamps = usageState?.accounts?.[accountName]?.request_timestamps ?? [];

  if (!windowMs || timestamps.length === 0) {
    return timestamps.length;
  }

  const nowMs = new Date(now ?? Date.now()).getTime();

  return timestamps.filter((timestamp) => {
    const value = new Date(timestamp).getTime();
    return !Number.isNaN(value) && nowMs - value < windowMs;
  }).length;
}

export function evaluateAccountAvailability(account, config, usageState, now) {
  const gateway = config.gateway ?? {};
  const accountState = usageState?.accounts?.[account.name] ?? {};

  if (isAccountCoolingDown(usageState, account.name, {
    cooldownMs: gateway.cooldown_ms ?? 0,
    now
  })) {
    return { available: false, reason: 'cooldown' };
  }

  const minIntervalMs = gateway.min_interval_ms ?? 0;

  if (minIntervalMs && accountState.last_used_at) {
    const lastUsedAt = new Date(accountState.last_used_at).getTime();
    const nowMs = new Date(now ?? Date.now()).getTime();

    if (!Number.isNaN(lastUsedAt) && !Number.isNaN(nowMs) && nowMs - lastUsedAt < minIntervalMs) {
      return { available: false, reason: 'min_interval' };
    }
  }

  const maxConcurrent = gateway.max_concurrent_per_account ?? 0;

  if (maxConcurrent && (accountState.active_requests ?? 0) >= maxConcurrent) {
    return { available: false, reason: 'concurrency' };
  }

  const maxRequestsPerMinute = gateway.max_requests_per_minute ?? 0;

  if (maxRequestsPerMinute) {
    const recent = countRecentRequests(usageState, account.name, now, 60 * 1000);

    if (recent >= maxRequestsPerMinute) {
      return { available: false, reason: 'rate_window' };
    }
  }

  return { available: true, reason: null };
}

function filterAvailableAccounts(config, usageState, now) {
  const accounts = config.accounts ?? [];
  const available = accounts.filter((account) => evaluateAccountAvailability(account, config, usageState, now).available);

  return available.length > 0 ? available : accounts;
}

function chooseByStrategy(config, usageState, now) {
  const accounts = config.accounts ?? [];
  const pool = config.pool ?? {};
  const availableAccounts = filterAvailableAccounts(config, usageState, now);

  if (accounts.length === 0) {
    throw new Error('没有可用账号');
  }

  if (pool.strategy === 'round_robin') {
    const cursor = pool.cursor ?? 0;
    const nextIndex = cursor % availableAccounts.length;
    pool.cursor = (cursor + 1) % availableAccounts.length;
    return availableAccounts[nextIndex];
  }

  if (pool.strategy === 'failover') {
    const failures = pool.failures ?? {};
    return availableAccounts.find((account) => !failures[account.name]) ?? availableAccounts[0];
  }

  if (pool.strategy === 'least_used') {
    const usageAccounts = usageState?.accounts ?? {};

    return [...availableAccounts].sort((left, right) => {
      const leftUsage = usageAccounts[left.name]?.total_requests ?? 0;
      const rightUsage = usageAccounts[right.name]?.total_requests ?? 0;

      if (leftUsage !== rightUsage) {
        return leftUsage - rightUsage;
      }

      return left.name.localeCompare(right.name);
    })[0];
  }

  return availableAccounts.find((account) => account.name === pool.active_account) ?? availableAccounts[0];
}

export function createAccountRouter() {
  const sessionAffinity = new Map();

  return {
    pickAccount(config, sessionKey, usageState, now) {
      const accounts = config.accounts ?? [];
      const stickyAccountName = sessionAffinity.get(sessionKey);

      if (stickyAccountName) {
        const sticky = accounts.find((account) => account.name === stickyAccountName);

        if (sticky) {
          return sticky;
        }
      }

      const account = chooseByStrategy(config, usageState, now);
      sessionAffinity.set(sessionKey, account.name);
      return account;
    },

    recordFailure(config, accountName, sessionKey) {
      if (!config.pool) {
        config.pool = {};
      }

      if (!config.pool.failures) {
        config.pool.failures = {};
      }

      config.pool.failures[accountName] = (config.pool.failures[accountName] ?? 0) + 1;

      if (sessionKey) {
        sessionAffinity.delete(sessionKey);
      }
    },

    recordSuccess(config, accountName, sessionKey) {
      if (config.pool?.failures?.[accountName]) {
        delete config.pool.failures[accountName];
      }

      if (sessionKey) {
        sessionAffinity.set(sessionKey, accountName);
      }
    }
  };
}
