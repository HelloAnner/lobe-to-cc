/**
 * 提供独立多轮对话终端页面
 * @author Anner
 * Created on 2026/3/26
 */
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { streamChatReply } from './lib/chat-client.mjs';
import { loadJsonFile, saveJsonFile } from './lib/json-store.mjs';
import { loadRuntimeConfig } from './lib/runtime-config.mjs';
import {
  renderAssistantChunk,
  renderAssistantEnd,
  renderAssistantStart,
  renderChatPage,
  renderError
} from './lib/terminal-ui.mjs';

function resolveDataPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

async function loadRuntimeFiles() {
  const runtimeConfig = await loadRuntimeConfig();
  const history = await loadJsonFile(resolveDataPath('data/history.json'), []);

  return {
    config: runtimeConfig.chatConfig,
    session: runtimeConfig.session,
    history
  };
}

function validateRuntime(config, session) {
  if (!config.baseUrl || !config.model) {
    throw new Error('data/chat-config.json 缺少 baseUrl 或 model');
  }

  if (!session.xLobeChatAuth || !session.xAgentId || !session.xTopicId) {
    throw new Error('data/session.json 缺少认证字段');
  }
}

function createQuestionPrompt() {
  return '\u001B[32mYou\u001B[0m   ';
}

async function persistHistory(history) {
  await saveJsonFile(resolveDataPath('data/history.json'), history);
}

async function handleReset(history) {
  history.length = 0;
  await persistHistory(history);
}

async function chatOnce(runtime, history, userInput) {
  history.push({ role: 'user', content: userInput });
  renderChatPage(history);
  renderAssistantStart();

  const assistantReply = await streamChatReply({
    config: runtime.config,
    session: runtime.session,
    history: history.slice(0, -1),
    userInput,
    systemPrompt: runtime.config.systemPrompt,
    model: runtime.config.model,
    temperature: runtime.config.temperature,
    topP: runtime.config.topP,
    thinking: runtime.config.thinking,
    enabledSearch: runtime.config.enabledSearch,
    onText: renderAssistantChunk
  });

  renderAssistantEnd();
  history.push({ role: 'assistant', content: assistantReply });
  await persistHistory(history);
}

async function main() {
  const runtime = await loadRuntimeFiles();
  validateRuntime(runtime.config, runtime.session);

  const history = runtime.history;
  const rl = readline.createInterface({ input: stdin, output: stdout });

  while (true) {
    renderChatPage(history);
    const userInput = (await rl.question(createQuestionPrompt())).trim();

    if (!userInput) {
      continue;
    }

    if (userInput === '/exit') {
      break;
    }

    if (userInput === '/reset') {
      await handleReset(history);
      continue;
    }

    try {
      await chatOnce(runtime, history, userInput);
    } catch (error) {
      history.pop();
      renderError(error);
      await persistHistory(history);
    }
  }

  rl.close();
}

main().catch((error) => {
  renderError(error);
  process.exitCode = 1;
});
