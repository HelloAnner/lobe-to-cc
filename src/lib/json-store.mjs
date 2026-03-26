/**
 * 负责本地 JSON 数据读取与持久化
 * @author Anner
 * Created on 2026/3/26
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function ensureParentDirectory(filePath) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
}

export async function loadJsonFile(filePath, fallbackValue) {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallbackValue;
    }

    throw error;
  }
}

export async function saveJsonFile(filePath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await ensureParentDirectory(filePath);
  await writeFile(filePath, content, 'utf8');
}
