/**
 * 测试网关认证兼容行为
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGatewayToken, isAuthorizedRequest } from '../src/lib/gateway-auth.mjs';

test('优先解析 Bearer token', () => {
  const token = resolveGatewayToken({
    authorization: 'Bearer local-dev-token'
  });

  assert.equal(token, 'local-dev-token');
});

test('支持 X-Api-Key', () => {
  const token = resolveGatewayToken({
    'x-api-key': 'local-dev-token'
  });

  assert.equal(token, 'local-dev-token');
});

test('授权判断接受 Bearer 和 X-Api-Key', () => {
  assert.equal(isAuthorizedRequest({
    authorization: 'Bearer local-dev-token'
  }, { authToken: 'local-dev-token' }), true);

  assert.equal(isAuthorizedRequest({
    'x-api-key': 'local-dev-token'
  }, { authToken: 'local-dev-token' }), true);

  assert.equal(isAuthorizedRequest({
    authorization: 'Bearer wrong'
  }, { authToken: 'local-dev-token' }), false);
});
