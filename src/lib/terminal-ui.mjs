/**
 * 负责终端页面渲染与样式输出
 * @author Anner
 * Created on 2026/3/26
 */
const color = {
  reset: '\u001B[0m',
  dim: '\u001B[2m',
  cyan: '\u001B[36m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  white: '\u001B[97m'
};

function paint(value, tone) {
  return `${tone}${value}${color.reset}`;
}

function renderMessageLine(role, content) {
  const label = role === 'user'
    ? paint('You', color.green)
    : paint('Opus', color.cyan);

  return `${label}  ${content}`;
}

export function renderChatPage(messages) {
  console.clear();
  console.log(paint('LobeHub Opus 4.6 Terminal', color.white));
  console.log(paint('独立多轮会话页  /exit 退出  /reset 清空历史', color.dim));
  console.log('');

  if (messages.length === 0) {
    console.log(paint('还没有历史消息，直接输入内容开始对话。', color.dim));
    console.log('');
    return;
  }

  for (const message of messages) {
    console.log(renderMessageLine(message.role, message.content));
    console.log('');
  }
}

export function renderAssistantStart() {
  process.stdout.write(`${paint('Opus', color.cyan)}  `);
}

export function renderAssistantChunk(text) {
  process.stdout.write(text);
}

export function renderAssistantEnd() {
  process.stdout.write('\n\n');
}

export function renderError(error) {
  console.log(paint(`错误: ${error.message}`, color.yellow));
  console.log('');
}
