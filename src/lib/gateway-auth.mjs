/**
 * 负责网关认证解析与校验
 * @author Anner
 * Created on 2026/3/26
 */
function parseBearerToken(authorization) {
  if (!authorization?.startsWith('Bearer ')) {
    return '';
  }

  return authorization.slice('Bearer '.length).trim();
}

export function resolveGatewayToken(headers) {
  return parseBearerToken(headers.authorization) || headers['x-api-key'] || '';
}

export function isAuthorizedRequest(headers, gatewayConfig) {
  const token = resolveGatewayToken(headers);
  return Boolean(token) && token === gatewayConfig.authToken;
}
