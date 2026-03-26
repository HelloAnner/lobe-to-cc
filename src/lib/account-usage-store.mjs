/**
 * 记录账号使用情况，供分流与排障使用
 * @author Anner
 * Created on 2026/3/26
 */
import path from 'node:path';

import { loadJsonFile, saveJsonFile } from './json-store.mjs';

function resolveDataPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

export function createEmptyUsageState() {
  return {
    updated_at: null,
    accounts: {}
  };
}

function ensureAccountState(state, accountName) {
  if (!state.accounts[accountName]) {
    state.accounts[accountName] = {
      total_requests: 0,
      success_requests: 0,
      failed_requests: 0,
      stream_requests: 0,
      non_stream_requests: 0,
      consecutive_failures: 0,
      last_used_at: null,
      last_success_at: null,
      last_failure_at: null
    };
  }

  return state.accounts[accountName];
}

export function recordAccountAttempt(state, accountName, options = {}) {
  const account = ensureAccountState(state, accountName);
  const now = options.now ?? new Date().toISOString();

  account.total_requests += 1;
  account.last_used_at = now;

  if (options.stream === true) {
    account.stream_requests += 1;
  }

  if (options.stream === false) {
    account.non_stream_requests += 1;
  }

  state.updated_at = now;
}

export function recordAccountResult(state, accountName, result, options = {}) {
  const account = ensureAccountState(state, accountName);
  const now = options.now ?? new Date().toISOString();

  if (result.ok) {
    account.success_requests += 1;
    account.consecutive_failures = 0;
    account.last_success_at = now;
  } else {
    account.failed_requests += 1;
    account.consecutive_failures += 1;
    account.last_failure_at = now;
  }

  state.updated_at = now;
}

export async function loadAccountUsageState() {
  return loadJsonFile(resolveDataPath('data/account-usage.json'), createEmptyUsageState());
}

export async function saveAccountUsageState(state) {
  await saveJsonFile(resolveDataPath('data/account-usage.json'), state);
}
