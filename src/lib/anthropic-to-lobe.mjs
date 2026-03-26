/**
 * 将 Anthropic Messages API 请求转换为 Lobe 网关请求
 * @author Anner
 * Created on 2026/3/26
 */
function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value == null) {
    return [];
  }

  return [value];
}

function textFromBlock(block) {
  if (typeof block === 'string') {
    return block;
  }

  if (block?.type === 'text') {
    return block.text ?? '';
  }

  return '';
}

function contentToText(content) {
  if (typeof content === 'string') {
    return content;
  }

  return asArray(content)
    .map(textFromBlock)
    .filter(Boolean)
    .join('\n');
}

function toolResultToText(content) {
  if (typeof content === 'string') {
    return content;
  }

  return asArray(content)
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (item?.type === 'text') {
        return item.text ?? '';
      }

      return JSON.stringify(item);
    })
    .join('\n');
}

function translateSystemPrompt(systemPrompt) {
  if (!systemPrompt) {
    return '';
  }

  if (typeof systemPrompt === 'string') {
    return systemPrompt;
  }

  return asArray(systemPrompt)
    .map(textFromBlock)
    .filter(Boolean)
    .join('\n');
}

function translateAnthropicTools(tools) {
  if (!Array.isArray(tools)) {
    return undefined;
  }

  return tools.map((tool) => {
    if (tool?.type === 'function' && tool.function) {
      return tool;
    }

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    };
  });
}

function translateAssistantMessage(message) {
  const content = asArray(message.content);
  const text = contentToText(content);
  const toolCalls = content
    .filter((block) => block?.type === 'tool_use')
    .map((block) => ({
      id: block.id,
      type: 'function',
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input ?? {})
      }
    }));

  if (toolCalls.length === 0) {
    return [{ role: 'assistant', content: text }];
  }

  return [{
    role: 'assistant',
    content: text,
    tool_calls: toolCalls
  }];
}

function flushUserText(buffer, translated) {
  const text = buffer.join('\n').trim();

  if (text) {
    translated.push({ role: 'user', content: text });
  }

  buffer.length = 0;
}

function translateUserMessage(message) {
  if (typeof message.content === 'string') {
    return [{ role: 'user', content: message.content }];
  }

  const translated = [];
  const textBuffer = [];

  for (const block of asArray(message.content)) {
    if (block?.type === 'text') {
      textBuffer.push(block.text ?? '');
      continue;
    }

    if (block?.type === 'tool_result') {
      flushUserText(textBuffer, translated);
      translated.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: toolResultToText(block.content)
      });
    }
  }

  flushUserText(textBuffer, translated);
  return translated;
}

function translateSingleMessage(message) {
  if (message.role === 'assistant') {
    return translateAssistantMessage(message);
  }

  if (message.role === 'user') {
    return translateUserMessage(message);
  }

  if (message.role === 'system') {
    return [{ role: 'system', content: contentToText(message.content) }];
  }

  if (message.role === 'tool') {
    return [message];
  }

  return [];
}

function translateMessages(request) {
  const translated = [];
  const systemPrompt = translateSystemPrompt(request.system);

  if (systemPrompt) {
    translated.push({ role: 'system', content: systemPrompt });
  }

  for (const message of request.messages ?? []) {
    translated.push(...translateSingleMessage(message));
  }

  return translated;
}

export function translateAnthropicRequestToLobe(request) {
  const translated = {
    model: request.model,
    stream: request.stream ?? false,
    messages: translateMessages(request),
    temperature: request.temperature,
    top_p: request.top_p,
    max_tokens: request.max_tokens,
    stop_sequences: request.stop_sequences,
    tool_choice: request.tool_choice,
    thinking: request.thinking ?? { type: 'disabled' },
    enabledSearch: false
  };

  const tools = translateAnthropicTools(request.tools);

  if (tools) {
    translated.tools = tools;
  }

  return translated;
}
