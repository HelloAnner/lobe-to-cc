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

function filterAvailableAccounts(config, usageState, now) {
  const accounts = config.accounts ?? [];
  const cooldownMs = config.gateway?.cooldown_ms ?? 0;
  const available = accounts.filter((account) => !isAccountCoolingDown(usageState, account.name, {
    cooldownMs,
    now
  }));

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
