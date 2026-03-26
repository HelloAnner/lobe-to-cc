/**
 * 测试运行时环境变量覆盖
 * @author Anner
 * Created on 2026/3/26
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyRuntimeEnvOverrides } from '../src/lib/runtime-config.mjs';

test('环境变量可覆盖网关 host 与 port', () => {
  const runtime = {
    gatewayConfig: {
      host: '127.0.0.1',
      port: 8787,
      authToken: 'local-dev-token',
      model: 'claude-opus-4-6'
    }
  };

  const overridden = applyRuntimeEnvOverrides(runtime, {
    LOBE_GATEWAY_HOST: '0.0.0.0',
    LOBE_GATEWAY_PORT: '9999'
  });

  assert.equal(overridden.gatewayConfig.host, '0.0.0.0');
  assert.equal(overridden.gatewayConfig.port, 9999);
});
