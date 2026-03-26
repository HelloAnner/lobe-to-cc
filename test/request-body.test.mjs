/**
 * 测试聊天请求体构建
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChatRequestBody } from '../src/lib/request-body.mjs';

test('请求体固定使用 claude-opus-4-6 且追加用户消息', () => {
  const body = buildChatRequestBody({
    history: [
      { role: 'assistant', content: '你好，我在。' }
    ],
    systemPrompt: '你是一个简洁的终端助手。',
    userInput: '帮我总结这个需求'
  });

  assert.equal(body.model, 'claude-opus-4-6');
  assert.equal(body.stream, true);
  assert.equal(body.enabledSearch, false);
  assert.deepEqual(body.messages, [
    { role: 'system', content: '你是一个简洁的终端助手。' },
    { role: 'assistant', content: '你好，我在。' },
    { role: 'user', content: '帮我总结这个需求' }
  ]);
});

test('请求体忽略空 system prompt', () => {
  const body = buildChatRequestBody({
    history: [],
    systemPrompt: '',
    userInput: '你好'
  });

  assert.deepEqual(body.messages, [
    { role: 'user', content: '你好' }
  ]);
});
