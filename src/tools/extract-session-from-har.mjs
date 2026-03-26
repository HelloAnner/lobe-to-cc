/**
 * 从 HAR 文件提取 LobeHub 会话认证
 * @author Anner
 * Created on 2026/3/26
 */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

import { saveJsonFile } from '../lib/json-store.mjs';
import { upsertAccountByIdentityInToml } from '../lib/account-pool-manager.mjs';
import { extractSessionAndIdentityFromHar } from '../lib/har-session-parser.mjs';

async function main() {
  const harPath = process.argv[2] ?? '/Users/anner/Downloads/aichat.fineres.com.har';
  const accountName = process.argv[3] ?? 'fineres-primary';
  const outputPath = path.resolve('data/account-pool.toml');
  const content = await readFile(harPath, 'utf8');
  const har = JSON.parse(content);
  const { session, identity } = extractSessionAndIdentityFromHar(har);

  try {
    const toml = await readFile(outputPath, 'utf8');
    const updated = upsertAccountByIdentityInToml(toml, {
      suggestedName: accountName,
      identity,
      session
    });
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
