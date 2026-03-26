/**
 * 测试 Anthropic 请求到 Lobe 请求的转换
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { translateAnthropicRequestToLobe } from '../src/lib/anthropic-to-lobe.mjs';

test('将 system、文本消息和工具定义转换为 Lobe 可接受的格式', () => {
  const request = {
    model: 'claude-opus-4-6',
    stream: true,
    system: '你是一个代码助手。',
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: 2048,
    tools: [
      {
        name: 'read_file',
        description: 'Read a file',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
        }
      }
    ],
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: '读取 package.json' }]
      }
    ]
  };

  const translated = translateAnthropicRequestToLobe(request);

  assert.equal(translated.model, 'claude-opus-4-6');
  assert.equal(translated.stream, true);
  assert.equal(translated.temperature, 0.2);
  assert.equal(translated.top_p, 0.9);
  assert.equal(translated.max_tokens, 2048);
  assert.equal(translated.enabledSearch, false);
  assert.deepEqual(translated.messages, [
    { role: 'system', content: '你是一个代码助手。' },
    { role: 'user', content: '读取 package.json' }
  ]);
  assert.deepEqual(translated.tools, [
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
        }
      }
    }
  ]);
});

test('将 assistant tool_use 和 user tool_result 转换为 OpenAI 风格消息', () => {
  const request = {
    model: 'claude-opus-4-6',
    stream: true,
    messages: [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '我先读取文件。' },
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'read_file',
            input: { path: 'package.json' }
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_123',
            content: [{ type: 'text', text: '{\"name\":\"demo\"}' }]
          }
        ]
      }
    ]
  };

  const translated = translateAnthropicRequestToLobe(request);

  assert.deepEqual(translated.messages, [
    {
      role: 'assistant',
      content: '我先读取文件。',
      tool_calls: [
        {
          id: 'toolu_123',
          type: 'function',
          function: {
            name: 'read_file',
            arguments: '{"path":"package.json"}'
          }
        }
      ]
    },
    {
      role: 'tool',
      tool_call_id: 'toolu_123',
      content: '{"name":"demo"}'
    }
  ]);
});
