/**
 * 管理账号池 TOML 更新与账号选择策略
 * @author Anner
 * Created on 2026/3/26
 */
function findAccountBlocks(content) {
  const lines = content.split('\n');
  const blocks = [];
  let blockStart = -1;
  let name = '';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (line === '[[accounts]]') {
      if (blockStart !== -1) {
        blocks.push({ start: blockStart, end: index - 1, name });
      }

      blockStart = index;
      name = '';
      continue;
    }

    if (blockStart !== -1 && line.startsWith('name = ')) {
      name = line.slice('name = '.length).trim().replace(/^"|"$/g, '');
    }
  }

  if (blockStart !== -1) {
    blocks.push({ start: blockStart, end: lines.length - 1, name });
  }

  return { lines, blocks };
}

function renderAccountBlock(name, session) {
  return [
    '[[accounts]]',
    `name = "${name}"`,
    'base_url = "https://aichat.fineres.com"',
    `x_agent_id = "${session.xAgentId}"`,
    `x_lobe_chat_auth = "${session.xLobeChatAuth}"`,
    `x_topic_id = "${session.xTopicId}"`
  ];
}

function updateLine(lines, key, value) {
  const index = lines.findIndex((line) => line.trim().startsWith(`${key} = `));

  if (index !== -1) {
    lines[index] = `${key} = "${value}"`;
  } else {
    lines.push(`${key} = "${value}"`);
  }
}

export function upsertAccountSessionInToml(content, accountName, session) {
  const { lines, blocks } = findAccountBlocks(content);
  const existing = blocks.find((block) => block.name === accountName);

  if (!existing) {
    const suffix = content.trim() ? '\n\n' : '';
    return `${content.trimEnd()}${suffix}${renderAccountBlock(accountName, session).join('\n')}\n`;
  }

  const blockLines = lines.slice(existing.start, existing.end + 1);
  updateLine(blockLines, 'x_agent_id', session.xAgentId);
  updateLine(blockLines, 'x_lobe_chat_auth', session.xLobeChatAuth);
  updateLine(blockLines, 'x_topic_id', session.xTopicId);

  lines.splice(existing.start, existing.end - existing.start + 1, ...blockLines);
  return `${lines.join('\n').trimEnd()}\n`;
}

export function selectActiveAccount(poolConfig, accounts) {
  const strategy = poolConfig.strategy ?? 'active';

  if (accounts.length === 0) {
    throw new Error('没有可用账号');
  }

  if (strategy === 'round_robin') {
    const cursor = poolConfig.cursor ?? 0;
    return accounts[cursor % accounts.length];
  }

  if (strategy === 'failover') {
    const failures = poolConfig.failures ?? {};
    const firstHealthy = accounts.find((account) => !failures[account.name]);
    return firstHealthy ?? accounts[0];
  }

  const activeName = poolConfig.activeAccount;
  return accounts.find((account) => account.name === activeName) ?? accounts[0];
}

function upsertSectionLine(lines, key, value) {
  const index = lines.findIndex((line) => line.trim().startsWith(`${key} = `));
  const rendered = typeof value === 'number' ? `${key} = ${value}` : `${key} = "${value}"`;

  if (index !== -1) {
    lines[index] = rendered;
  } else {
    lines.push(rendered);
  }
}

function replaceSection(content, header, bodyLines) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === header);

  if (start === -1) {
    const suffix = content.trim() ? '\n\n' : '';
    return `${content.trimEnd()}${suffix}${header}\n${bodyLines.join('\n')}\n`;
  }

  let end = lines.length;

  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith('[')) {
      end = index;
      break;
    }
  }

  lines.splice(start, end - start, header, ...bodyLines);
  return `${lines.join('\n').trimEnd()}\n`;
}

export function persistPoolStateInToml(content, pool) {
  const poolLines = [];

  if (pool.strategy) {
    poolLines.push(`strategy = "${pool.strategy}"`);
  }

  if (pool.active_account) {
    poolLines.push(`active_account = "${pool.active_account}"`);
  }

  if (typeof pool.cursor === 'number') {
    poolLines.push(`cursor = ${pool.cursor}`);
  }

  let updated = replaceSection(content, '[pool]', poolLines);
  const failures = pool.failures ?? {};
  const failureLines = Object.entries(failures).map(([name, count]) => `${name} = ${count}`);

  if (failureLines.length > 0) {
    updated = replaceSection(updated, '[pool.failures]', failureLines);
  }

  return updated;
}
