/**
 * 统一加载 TOML 账号池与兼容旧 JSON 配置
 * @author Anner
 * Created on 2026/3/26
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { loadJsonFile } from './json-store.mjs';
import { parseToml } from './simple-toml.mjs';
import { selectActiveAccount } from './account-pool-manager.mjs';

function resolveDataPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

function normalizeThinking(chat) {
  return {
    type: chat.thinking_type ?? 'disabled'
  };
}

export function deriveRuntimeFromAccountPool(config) {
  const accounts = config.accounts ?? [];
  const activeAccount = selectActiveAccount({
    strategy: config.pool?.strategy ?? 'active',
    activeAccount: config.pool?.active_account,
    cursor: config.pool?.cursor ?? 0,
    failures: config.pool?.failures ?? {}
  }, accounts);

  if (!activeAccount) {
    throw new Error('TOML 账号池中没有可用账号');
  }

  return {
    accountPool: config,
    gatewayConfig: {
      host: config.gateway?.host ?? '127.0.0.1',
      port: config.gateway?.port ?? 8787,
      authToken: config.gateway?.auth_token ?? '',
      model: activeAccount.model ?? config.chat?.model ?? 'claude-opus-4-6'
    },
    chatConfig: {
      baseUrl: activeAccount.base_url,
      model: activeAccount.model ?? config.chat?.model ?? 'claude-opus-4-6',
      systemPrompt: config.chat?.system_prompt ?? '',
      temperature: config.chat?.temperature ?? 1,
      topP: config.chat?.top_p ?? 0.8,
      thinking: normalizeThinking(config.chat ?? {}),
      enabledSearch: config.chat?.enabled_search ?? false
    },
    session: {
      xAgentId: activeAccount.x_agent_id,
      xLobeChatAuth: activeAccount.x_lobe_chat_auth,
      xTopicId: activeAccount.x_topic_id
    }
  };
}

export function deriveRuntimeForAccount(config, account) {
  return {
    accountPool: config,
    gatewayConfig: {
      host: config.gateway?.host ?? '127.0.0.1',
      port: config.gateway?.port ?? 8787,
      authToken: config.gateway?.auth_token ?? '',
      model: account.model ?? config.chat?.model ?? 'claude-opus-4-6'
    },
    chatConfig: {
      baseUrl: account.base_url,
      model: account.model ?? config.chat?.model ?? 'claude-opus-4-6',
      systemPrompt: config.chat?.system_prompt ?? '',
      temperature: config.chat?.temperature ?? 1,
      topP: config.chat?.top_p ?? 0.8,
      thinking: normalizeThinking(config.chat ?? {}),
      enabledSearch: config.chat?.enabled_search ?? false
    },
    session: {
      xAgentId: account.x_agent_id,
      xLobeChatAuth: account.x_lobe_chat_auth,
      xTopicId: account.x_topic_id
    }
  };
}

export async function loadAccountPoolDocument() {
  const filePath = resolveDataPath('data/account-pool.toml');

  try {
    const content = await readFile(filePath, 'utf8');
    return {
      filePath,
      content,
      config: parseToml(content)
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function loadTomlAccountPool() {
  const document = await loadAccountPoolDocument();

  if (!document) {
    return null;
  }

  return deriveRuntimeFromAccountPool(document.config);
}

async function loadLegacyJsonConfig() {
  const gatewayConfig = await loadJsonFile(resolveDataPath('data/gateway-config.json'), {});
  const chatConfig = await loadJsonFile(resolveDataPath('data/chat-config.json'), {});
  const session = await loadJsonFile(resolveDataPath('data/session.json'), {});

  return { gatewayConfig, chatConfig, session };
}

export async function loadRuntimeConfig() {
  const tomlRuntime = await loadTomlAccountPool();

  if (tomlRuntime) {
    return tomlRuntime;
  }

  return loadLegacyJsonConfig();
}
