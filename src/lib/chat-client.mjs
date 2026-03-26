/**
 * 负责调用 LobeHub Anthropic 聊天接口
 * @author Anner
 * Created on 2026/3/26
 */
import { createSseParser } from './sse-parser.mjs';
import { buildChatRequestBody } from './request-body.mjs';

function buildHeaders(config, session) {
  return {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
    Origin: config.baseUrl,
    Referer: `${config.baseUrl}/`,
    'x-agent-id': session.xAgentId,
    'x-lobe-chat-auth': session.xLobeChatAuth,
    'x-topic-id': session.xTopicId
  };
}

function parseTextPayload(data) {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

async function ensureSuccess(response) {
  if (response.ok) {
    return;
  }

  const errorText = await response.text();
  throw new Error(`请求失败: ${response.status} ${errorText}`);
}

export async function streamChatReply(options) {
  const body = buildChatRequestBody(options);
  const response = await fetch(`${options.config.baseUrl}/webapi/chat/anthropic`, {
    method: 'POST',
    headers: buildHeaders(options.config, options.session),
    body: JSON.stringify(body)
  });

  await ensureSuccess(response);

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let assistantText = '';
  const parser = createSseParser((event) => {
    if (event.event !== 'text') {
      return;
    }

    const text = parseTextPayload(event.data);
    assistantText += text;
    options.onText(text);
  });

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    parser.push(decoder.decode(value, { stream: true }));
  }

  return assistantText.trimEnd();
}
