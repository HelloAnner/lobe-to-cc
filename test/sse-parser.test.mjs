/**
 * 测试 SSE 事件解析行为
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSseParser } from '../src/lib/sse-parser.mjs';

test('SSE 解析器可以跨 chunk 拼接完整事件', () => {
  const events = [];
  const parser = createSseParser((event) => {
    events.push(event);
  });

  parser.push('event: text\ndata: "你');
  parser.push('好"\n\n');
  parser.push('event: stop\ndata: "message_stop"\n\n');

  assert.deepEqual(events, [
    { event: 'text', data: '"你好"' },
    { event: 'stop', data: '"message_stop"' }
  ]);
});

test('SSE 解析器忽略空事件并保留默认 event 名称', () => {
  const events = [];
  const parser = createSseParser((event) => {
    events.push(event);
  });

  parser.push('data: {"ok":true}\n\n');
  parser.push('\n');

  assert.deepEqual(events, [
    { event: 'message', data: '{"ok":true}' }
  ]);
});
