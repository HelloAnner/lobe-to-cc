/**
 * 解析服务端返回的 SSE 数据流
 * @author Anner
 * Created on 2026/3/26
 */
function normalizeChunk(chunk) {
  return chunk.replaceAll('\r\n', '\n');
}

function buildEvent(block) {
  let event = 'message';
  const dataLines = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join('\n') };
}

export function createSseParser(onEvent) {
  let buffer = '';

  return {
    push(chunk) {
      buffer += normalizeChunk(chunk);

      while (buffer.includes('\n\n')) {
        const boundary = buffer.indexOf('\n\n');
        const block = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);

        if (!block) {
          continue;
        }

        const event = buildEvent(block);

        if (event) {
          onEvent(event);
        }
      }
    }
  };
}
