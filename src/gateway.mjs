/**
 * 提供 Claude Code 可接入的本地 Anthropic 兼容中转站
 * @author Anner
 * Created on 2026/3/26
 */
import http from 'node:http';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

import { loadJsonFile } from './lib/json-store.mjs';
import { createSseParser } from './lib/sse-parser.mjs';
import { translateAnthropicRequestToLobe } from './lib/anthropic-to-lobe.mjs';
import { createAnthropicEventTransformer } from './lib/lobe-to-anthropic-stream.mjs';
import { isAuthorizedRequest } from './lib/gateway-auth.mjs';
import { createAccountRouter, buildConversationKey } from './lib/account-routing.mjs';
import {
  loadAccountUsageState,
  saveAccountUsageState,
  recordAccountAttempt,
  recordAccountResult
} from './lib/account-usage-store.mjs';
import {
  loadRuntimeConfig,
  loadAccountPoolDocument,
  deriveRuntimeForAccount
} from './lib/runtime-config.mjs';
import { persistPoolStateInToml } from './lib/account-pool-manager.mjs';

function resolveDataPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    request.on('error', reject);
  });
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function unauthorized(response) {
  writeJson(response, 401, {
    error: {
      type: 'authentication_error',
      message: 'Invalid proxy token'
    }
  });
}

function buildLobeHeaders(chatConfig, session) {
  return {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
    Origin: chatConfig.baseUrl,
    Referer: `${chatConfig.baseUrl}/`,
    'x-agent-id': session.xAgentId,
    'x-lobe-chat-auth': session.xLobeChatAuth,
    'x-topic-id': session.xTopicId
  };
}

function estimateInputTokens(payload) {
  return Math.ceil(JSON.stringify(payload).length / 4);
}

function buildModelList(gatewayConfig) {
  const id = gatewayConfig.model ?? 'claude-opus-4-6';

  return {
    data: [
      {
        type: 'model',
        id,
        display_name: 'Claude Opus 4.6',
        created_at: '2026-03-26T00:00:00Z'
      }
    ],
    first_id: id,
    last_id: id,
    has_more: false
  };
}

async function handleCountTokens(request, response, gatewayConfig) {
  if (!isAuthorizedRequest(request.headers, gatewayConfig)) {
    unauthorized(response);
    return;
  }

  const rawBody = await readRequestBody(request);
  const payload = JSON.parse(rawBody || '{}');

  writeJson(response, 200, {
    input_tokens: estimateInputTokens(payload)
  });
}

async function streamLobeAsAnthropic(lobeResponse, response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });

  const parser = createSseParser((event) => {
    const transformed = transformer.accept(event);

    for (const chunk of transformed) {
      response.write(chunk);
    }
  });
  const transformer = createAnthropicEventTransformer();
  const reader = lobeResponse.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    parser.push(decoder.decode(value, { stream: true }));
  }

  response.end();
}

function parseAnthropicStreamEvents(text) {
  const events = [];
  const blocks = text.replaceAll('\r\n', '\n').split('\n\n').filter(Boolean);

  for (const block of blocks) {
    let eventName = 'message';
    const dataLines = [];

    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) {
      continue;
    }

    events.push({
      event: eventName,
      data: JSON.parse(dataLines.join('\n'))
    });
  }

  return events;
}

function collectNonStreamingMessage(events) {
  const content = [];
  const toolInputs = new Map();
  let messageId = 'msg_local_proxy';
  let model = 'claude-opus-4-6';
  let stopReason = 'end_turn';
  let inputTokens = 0;
  let outputTokens = 0;

  for (const event of events) {
    if (event.event === 'message_start') {
      messageId = event.data.message.id;
      model = event.data.message.model;
      inputTokens = event.data.message.usage.input_tokens ?? 0;
      continue;
    }

    if (event.event === 'content_block_start') {
      if (event.data.content_block.type === 'text') {
        content[event.data.index] = { type: 'text', text: '' };
      }

      if (event.data.content_block.type === 'tool_use') {
        content[event.data.index] = {
          type: 'tool_use',
          id: event.data.content_block.id,
          name: event.data.content_block.name,
          input: {}
        };
        toolInputs.set(event.data.index, '');
      }
      continue;
    }

    if (event.event === 'content_block_delta') {
      if (event.data.delta.type === 'text_delta') {
        content[event.data.index].text += event.data.delta.text;
      }

      if (event.data.delta.type === 'input_json_delta') {
        const nextValue = `${toolInputs.get(event.data.index) ?? ''}${event.data.delta.partial_json}`;
        toolInputs.set(event.data.index, nextValue);
      }
      continue;
    }

    if (event.event === 'message_delta') {
      stopReason = event.data.delta.stop_reason;
      outputTokens = event.data.usage.output_tokens ?? 0;
    }
  }

  for (const [index, rawInput] of toolInputs.entries()) {
    if (rawInput) {
      content[index].input = JSON.parse(rawInput);
    }
  }

  return {
    id: messageId,
    type: 'message',
    role: 'assistant',
    model,
    content: content.filter(Boolean),
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens
    }
  };
}

async function handleMessagesRequest(anthropicRequest, response, gatewayConfig, chatConfig, session) {
  const lobeRequest = translateAnthropicRequestToLobe(anthropicRequest);
  lobeRequest.stream = true;
  const lobeResponse = await fetch(`${chatConfig.baseUrl}/webapi/chat/anthropic`, {
    method: 'POST',
    headers: buildLobeHeaders(chatConfig, session),
    body: JSON.stringify(lobeRequest)
  });

  if (!lobeResponse.ok) {
    const errorText = await lobeResponse.text();
    const error = new Error(errorText);
    error.statusCode = lobeResponse.status;
    throw error;
  }

  if (anthropicRequest.stream) {
    await streamLobeAsAnthropic(lobeResponse, response);
    return;
  }

  const rawText = await lobeResponse.text();
  const transformer = createAnthropicEventTransformer();
  const parser = createSseParser((event) => {
    const transformed = transformer.accept(event);
    transformedText += transformed.join('');
  });
  let transformedText = '';

  parser.push(rawText);

  const events = parseAnthropicStreamEvents(transformedText);
  writeJson(response, 200, collectNonStreamingMessage(events));
}

async function handleMessages(request, response, gatewayConfig, chatConfig, session) {
  if (!isAuthorizedRequest(request.headers, gatewayConfig)) {
    unauthorized(response);
    return;
  }

  const rawBody = await readRequestBody(request);
  const anthropicRequest = JSON.parse(rawBody || '{}');
  await handleMessagesRequest(anthropicRequest, response, gatewayConfig, chatConfig, session);
}

function buildModelDetail(gatewayConfig, id) {
  return {
    type: 'model',
    id,
    display_name: 'Claude Opus 4.6',
    created_at: '2026-03-26T00:00:00Z'
  };
}

function buildDebugAccountsPayload(runtimeConfig, usageState) {
  return {
    gateway: runtimeConfig.gatewayConfig,
    pool: runtimeConfig.accountPool?.pool ?? {},
    accounts: runtimeConfig.accountPool?.accounts ?? [],
    usage: usageState
  };
}

function createServer() {
  const router = createAccountRouter();

  return http.createServer(async (request, response) => {
    try {
      const runtime = await loadRuntimeConfig();
      const url = new URL(request.url, `http://${request.headers.host}`);

      if (request.method === 'GET' && url.pathname === '/health') {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/models') {
        if (!isAuthorizedRequest(request.headers, runtime.gatewayConfig)) {
          unauthorized(response);
          return;
        }

        writeJson(response, 200, buildModelList(runtime.gatewayConfig));
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/v1/models/')) {
        if (!isAuthorizedRequest(request.headers, runtime.gatewayConfig)) {
          unauthorized(response);
          return;
        }

        const modelId = decodeURIComponent(url.pathname.slice('/v1/models/'.length));
        writeJson(response, 200, buildModelDetail(runtime.gatewayConfig, modelId));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/debug/accounts') {
        if (!isAuthorizedRequest(request.headers, runtime.gatewayConfig)) {
          unauthorized(response);
          return;
        }

        const usageState = await loadAccountUsageState();
        writeJson(response, 200, buildDebugAccountsPayload({
          ...runtime,
          accountPool: (await loadAccountPoolDocument())?.config ?? null
        }, usageState));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/messages/count_tokens') {
        await handleCountTokens(request, response, runtime.gatewayConfig);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/messages') {
        const accountPoolDocument = await loadAccountPoolDocument();

        if (!accountPoolDocument) {
          await handleMessages(
            request,
            response,
            runtime.gatewayConfig,
            runtime.chatConfig,
            runtime.session
          );
          return;
        }

        const rawBody = await readRequestBody(request);
        const anthropicRequest = JSON.parse(rawBody || '{}');
        const sessionKey = buildConversationKey(anthropicRequest);
        const usageState = await loadAccountUsageState();
        const attempted = new Set();
        const maxAttempts = Math.max(1, accountPoolDocument.config.accounts?.length ?? 1);
        let lastError = null;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const selectedAccount = router.pickAccount(accountPoolDocument.config, sessionKey, usageState);

          if (attempted.has(selectedAccount.name)) {
            break;
          }

          attempted.add(selectedAccount.name);
          recordAccountAttempt(usageState, selectedAccount.name, {
            stream: anthropicRequest.stream === true
          });
          const selectedRuntime = deriveRuntimeForAccount(accountPoolDocument.config, selectedAccount);

          try {
            await handleMessagesRequest(
              anthropicRequest,
              response,
              selectedRuntime.gatewayConfig,
              selectedRuntime.chatConfig,
              selectedRuntime.session
            );

            router.recordSuccess(accountPoolDocument.config, selectedAccount.name, sessionKey);
            recordAccountResult(usageState, selectedAccount.name, { ok: true });
            const updated = persistPoolStateInToml(accountPoolDocument.content, accountPoolDocument.config.pool ?? {});
            await writeFile(accountPoolDocument.filePath, updated, 'utf8');
            await saveAccountUsageState(usageState);
            return;
          } catch (error) {
            lastError = error;
            router.recordFailure(accountPoolDocument.config, selectedAccount.name, sessionKey);
            recordAccountResult(usageState, selectedAccount.name, { ok: false });
          }
        }

        const updated = persistPoolStateInToml(accountPoolDocument.content, accountPoolDocument.config.pool ?? {});
        await writeFile(accountPoolDocument.filePath, updated, 'utf8');
        await saveAccountUsageState(usageState);
        throw lastError ?? new Error('所有账号均不可用');
        return;
      }

      writeJson(response, 404, {
        error: {
          type: 'not_found_error',
          message: 'Not found'
        }
      });
    } catch (error) {
      if (response.headersSent || response.writableEnded) {
        console.error(error.message);
        response.end();
        return;
      }

      writeJson(response, 500, {
        error: {
          type: 'api_error',
          message: error.message
        }
      });
    }
  });
}

async function main() {
  const runtime = await loadRuntimeConfig();
  const host = runtime.gatewayConfig.host ?? '127.0.0.1';
  const port = runtime.gatewayConfig.port ?? 8787;
  const server = createServer();

  server.listen(port, host, () => {
    console.log(`Gateway listening on http://${host}:${port}`);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
