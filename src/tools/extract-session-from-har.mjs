/**
 * 从 HAR 文件提取 LobeHub 会话认证
 * @author Anner
 * Created on 2026/3/26
 */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

import { saveJsonFile } from '../lib/json-store.mjs';
import { upsertAccountSessionInToml } from '../lib/account-pool-manager.mjs';

function findAnthropicRequest(entries) {
  return entries.find((entry) => entry.request.url.includes('/webapi/chat/anthropic'));
}

function findHeader(request, headerName) {
  return request.headers.find((header) => header.name === headerName)?.value;
}

async function main() {
  const harPath = process.argv[2] ?? '/Users/anner/Downloads/aichat.fineres.com.har';
  const accountName = process.argv[3] ?? 'fineres-primary';
  const outputPath = path.resolve('data/account-pool.toml');
  const content = await readFile(harPath, 'utf8');
  const har = JSON.parse(content);
  const request = findAnthropicRequest(har.log.entries)?.request;

  if (!request) {
    throw new Error('HAR 中没有找到 /webapi/chat/anthropic 请求');
  }

  const session = {
    xAgentId: findHeader(request, 'x-agent-id'),
    xLobeChatAuth: findHeader(request, 'x-lobe-chat-auth'),
    xTopicId: findHeader(request, 'x-topic-id')
  };

  try {
    const toml = await readFile(outputPath, 'utf8');
    const updated = upsertAccountSessionInToml(toml, accountName, session);
    await writeFile(outputPath, updated, 'utf8');
    console.log(`session 已写入 ${outputPath} -> account=${accountName}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await saveJsonFile(path.resolve('data/session.json'), session);
      console.log('account-pool.toml 不存在，已回退写入 data/session.json');
      return;
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
