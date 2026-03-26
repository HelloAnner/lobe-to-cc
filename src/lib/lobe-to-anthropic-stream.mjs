/**
 * 将 Lobe 自定义 SSE 事件转换为 Anthropic 标准 SSE
 * @author Anner
 * Created on 2026/3/26
 */
function encodeSse(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function parseData(data) {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function createMessageStartPayload(message) {
  return {
    type: 'message_start',
    message: {
      id: message.id,
      type: 'message',
      role: 'assistant',
      model: message.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: message.usage?.input_tokens ?? 0,
        output_tokens: 0
      }
    }
  };
}

export function createAnthropicEventTransformer() {
  let nextContentIndex = 0;
  let openBlocks = [];
  let toolIndexMap = new Map();
  let pendingStopReason = null;
  let outputTokens = 0;

  function openTextBlock() {
    const index = nextContentIndex++;
    openBlocks.push(index);

    return encodeSse('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: {
        type: 'text',
        text: ''
      }
    });
  }

  function closeCurrentBlock() {
    if (openBlocks.length === 0) {
      return [];
    }

    const index = openBlocks.pop();

    return [encodeSse('content_block_stop', {
      type: 'content_block_stop',
      index
    })];
  }

  function currentBlockIndex() {
    return openBlocks.at(-1);
  }

  return {
    accept(rawEvent) {
      const emitted = [];

      if (rawEvent.event === 'data') {
        const payload = parseData(rawEvent.data);

        if (payload?.id && payload?.model) {
          emitted.push(encodeSse('message_start', createMessageStartPayload(payload)));
          return emitted;
        }

        if (payload?.type === 'content_block_stop') {
          return closeCurrentBlock();
        }

        return emitted;
      }

      if (rawEvent.event === 'text') {
        const text = parseData(rawEvent.data);

        if (typeof currentBlockIndex() !== 'number') {
          emitted.push(openTextBlock());
        }

        emitted.push(encodeSse('content_block_delta', {
          type: 'content_block_delta',
          index: currentBlockIndex(),
          delta: {
            type: 'text_delta',
            text
          }
        }));

        return emitted;
      }

      if (rawEvent.event === 'tool_calls') {
        const payload = parseData(rawEvent.data);

        for (const item of payload) {
          const toolIndex = item.index ?? 0;

          if (!toolIndexMap.has(toolIndex)) {
            const anthropicIndex = nextContentIndex++;
            toolIndexMap.set(toolIndex, anthropicIndex);
            openBlocks.push(anthropicIndex);

            emitted.push(encodeSse('content_block_start', {
              type: 'content_block_start',
              index: anthropicIndex,
              content_block: {
                type: 'tool_use',
                id: item.id,
                name: item.function?.name,
                input: {}
              }
            }));
          }

          const partialJson = item.function?.arguments ?? '';

          if (partialJson) {
            emitted.push(encodeSse('content_block_delta', {
              type: 'content_block_delta',
              index: toolIndexMap.get(toolIndex),
              delta: {
                type: 'input_json_delta',
                partial_json: partialJson
              }
            }));
          }
        }

        return emitted;
      }

      if (rawEvent.event === 'usage') {
        const payload = parseData(rawEvent.data);
        outputTokens = payload.totalOutputTokens ?? payload.output_tokens ?? 0;
        return emitted;
      }

      if (rawEvent.event === 'stop') {
        const payload = parseData(rawEvent.data);

        if (payload !== 'message_stop') {
          pendingStopReason = payload;
          return emitted;
        }

        emitted.push(encodeSse('message_delta', {
          type: 'message_delta',
          delta: {
            stop_reason: pendingStopReason,
            stop_sequence: null
          },
          usage: {
            output_tokens: outputTokens
          }
        }));
        emitted.push(encodeSse('message_stop', {
          type: 'message_stop'
        }));

        return emitted;
      }

      return emitted;
    }
  };
}
