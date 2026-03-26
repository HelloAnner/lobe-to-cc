/**
 * 构建发送到 LobeHub Anthropic 网关的请求体
 * @author Anner
 * Created on 2026/3/26
 */
function createMessage(role, content) {
  return { role, content };
}

function appendSystemMessage(messages, systemPrompt) {
  if (!systemPrompt) {
    return messages;
  }

  return [createMessage('system', systemPrompt), ...messages];
}

function appendUserMessage(messages, userInput) {
  return [...messages, createMessage('user', userInput)];
}

export function buildChatRequestBody(options) {
  const history = options.history ?? [];
  const systemPrompt = options.systemPrompt?.trim() ?? '';
  const userInput = options.userInput.trim();
  const model = options.model ?? 'claude-opus-4-6';
  const messages = appendUserMessage(
    appendSystemMessage(history, systemPrompt),
    userInput
  );

  return {
    model,
    stream: true,
    frequency_penalty: 0,
    presence_penalty: 0,
    temperature: options.temperature ?? 1,
    top_p: options.topP ?? 0.8,
    thinking: options.thinking ?? { type: 'disabled' },
    enabledSearch: options.enabledSearch ?? false,
    messages
  };
}
