/**
 * 从 HAR 中提取会话头和用户信息
 * @author Anner
 * Created on 2026/3/26
 */
function findHeader(request, headerName) {
  return request.headers.find((header) => header.name === headerName)?.value;
}

function findAnthropicRequest(entries) {
  return entries.find((entry) => entry.request.url.includes('/webapi/chat/anthropic'));
}

function findUserStateEntry(entries) {
  return entries.find((entry) => entry.request.url.includes('trpc/lambda/user.getUserState'));
}

export function extractSessionAndIdentityFromHar(har) {
  const entries = har.log?.entries ?? [];
  const request = findAnthropicRequest(entries)?.request;

  if (!request) {
    throw new Error('HAR 中没有找到 /webapi/chat/anthropic 请求');
  }

  const session = {
    xAgentId: findHeader(request, 'x-agent-id'),
    xLobeChatAuth: findHeader(request, 'x-lobe-chat-auth'),
    xTopicId: findHeader(request, 'x-topic-id')
  };

  const userStateText = findUserStateEntry(entries)?.response?.content?.text ?? '';
  let identity = {};

  try {
    const parsed = JSON.parse(userStateText);
    const profile = parsed.result?.data?.json ?? {};
    identity = {
      email: profile.email ?? '',
      userId: profile.userId ?? '',
      fullName: profile.fullName ?? ''
    };
  } catch {
    identity = {};
  }

  return { session, identity };
}
