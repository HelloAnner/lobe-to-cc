/**
 * 解析当前项目使用的精简 TOML 配置
 * @author Anner
 * Created on 2026/3/26
 */
function ensureObjectPath(root, path) {
  let current = root;

  for (const key of path) {
    if (!current[key] || Array.isArray(current[key])) {
      current[key] = {};
    }

    current = current[key];
  }

  return current;
}

function ensureArrayTable(root, path) {
  let current = root;

  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];

    if (!current[key] || Array.isArray(current[key])) {
      current[key] = {};
    }

    current = current[key];
  }

  const arrayKey = path.at(-1);

  if (!Array.isArray(current[arrayKey])) {
    current[arrayKey] = [];
  }

  const table = {};
  current[arrayKey].push(table);
  return table;
}

function parseString(value) {
  return value
    .slice(1, -1)
    .replaceAll('\\"', '"')
    .replaceAll('\\\\', '\\');
}

function parsePrimitive(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return parseString(value);
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
}

export function parseToml(content) {
  const root = {};
  let current = root;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    if (line.startsWith('[[') && line.endsWith(']]')) {
      const path = line.slice(2, -2).trim().split('.');
      current = ensureArrayTable(root, path);
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      const path = line.slice(1, -1).trim().split('.');
      current = ensureObjectPath(root, path);
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    current[key] = parsePrimitive(value);
  }

  return root;
}
