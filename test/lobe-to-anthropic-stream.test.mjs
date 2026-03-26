/**
 * 测试 Lobe SSE 到 Anthropic SSE 的转换
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createAnthropicEventTransformer } from '../src/lib/lobe-to-anthropic-stream.mjs';

test('将纯文本 Lobe 事件转换为 Anthropic 标准流事件', () => {
  const transformer = createAnthropicEventTransformer();

  const chunks = [
    transformer.accept({ event: 'data', data: JSON.stringify({
      id: 'msg_1',
      model: 'claude-opus-4-6',
      usage: { input_tokens: 10, output_tokens: 1 }
    }) }),
    transformer.accept({ event: 'text', data: JSON.stringify('你好') }),
    transformer.accept({ event: 'data', data: JSON.stringify({ type: 'content_block_stop', index: 0 }) }),
    transformer.accept({ event: 'stop', data: JSON.stringify('end_turn') }),
    transformer.accept({ event: 'usage', data: JSON.stringify({ totalOutputTokens: 8 }) }),
    transformer.accept({ event: 'stop', data: JSON.stringify('message_stop') })
  ].flat();

  const events = chunks.filter(Boolean).map((line) => line.split('\n').slice(0, 2).join('\n'));

  assert.deepEqual(events, [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-4-6","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":8}}',
    'event: message_stop\ndata: {"type":"message_stop"}'
  ]);
});

test('将 Lobe tool_calls 事件转换为 Anthropic tool_use 流', () => {
  const transformer = createAnthropicEventTransformer();

  const chunks = [
    transformer.accept({ event: 'data', data: JSON.stringify({
      id: 'msg_2',
      model: 'claude-opus-4-6',
      usage: { input_tokens: 20, output_tokens: 1 }
    }) }),
    transformer.accept({ event: 'tool_calls', data: JSON.stringify([
      {
        id: 'toolu_1',
        index: 0,
        type: 'function',
        function: { name: 'read_file', arguments: '' }
      }
    ]) }),
    transformer.accept({ event: 'tool_calls', data: JSON.stringify([
      {
        index: 0,
        type: 'function',
        function: { arguments: '{"path":' }
      }
    ]) }),
    transformer.accept({ event: 'tool_calls', data: JSON.stringify([
      {
        index: 0,
        type: 'function',
        function: { arguments: '"package.json"}' }
      }
    ]) }),
    transformer.accept({ event: 'data', data: JSON.stringify({ type: 'content_block_stop', index: 0 }) }),
    transformer.accept({ event: 'stop', data: JSON.stringify('tool_use') }),
    transformer.accept({ event: 'stop', data: JSON.stringify('message_stop') })
  ].flat();

  const events = chunks.filter(Boolean).map((line) => line.split('\n').slice(0, 2).join('\n'));

  assert.deepEqual(events, [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_2","type":"message","role":"assistant","model":"claude-opus-4-6","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":20,"output_tokens":0}}}',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_file","input":{}}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"package.json\\"}"}}',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":0}}',
    'event: message_stop\ndata: {"type":"message_stop"}'
  ]);
});
