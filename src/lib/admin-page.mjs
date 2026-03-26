/**
 * 内置账号池管理页
 * @author Anner
 * Created on 2026/3/26
 */
export function renderAdminPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lobe Gateway Admin</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f1e8;
      color: #1f2937;
    }
    .page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 20px 60px;
    }
    .hero, .card {
      background: #fffdf8;
      border: 1px solid #e8decc;
      border-radius: 18px;
      box-shadow: 0 8px 24px rgba(120, 106, 78, 0.08);
    }
    .hero { padding: 24px; margin-bottom: 20px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    .card { padding: 18px; }
    h1, h2, h3 { margin: 0 0 12px; }
    p { line-height: 1.6; }
    label {
      display: block;
      margin: 10px 0 6px;
      font-size: 13px;
      color: #6b7280;
    }
    input, select, textarea, button {
      width: 100%;
      box-sizing: border-box;
      border-radius: 12px;
      border: 1px solid #d8cdb9;
      padding: 10px 12px;
      font: inherit;
      background: #fff;
    }
    button {
      cursor: pointer;
      background: #3f6b4a;
      color: white;
      border: none;
      margin-top: 12px;
    }
    button.secondary {
      background: #d8cdb9;
      color: #3b3428;
    }
    .muted { color: #6b7280; font-size: 13px; }
    .inline {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .inline > * { flex: 1; min-width: 180px; }
    .account {
      padding: 14px;
      border-radius: 14px;
      background: #faf6ee;
      border: 1px solid #eadfce;
      margin-top: 12px;
    }
    .pill {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      margin-right: 6px;
      background: #e8efe8;
      color: #35573d;
    }
    .danger { background: #fbe4e4; color: #8b3a3a; }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #f7f2e9;
      padding: 12px;
      border-radius: 12px;
      overflow: auto;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <h1>Lobe Gateway Admin</h1>
      <p>本地可视化管理账号池、导入 HAR、查看使用情况与调试状态。</p>
      <div class="inline">
        <button id="openLobe" class="secondary">打开 Lobe 登录页</button>
        <button id="refreshState">刷新状态</button>
      </div>
    </section>

    <div class="grid">
      <section class="card">
        <h2>池配置</h2>
        <label for="strategy">策略</label>
        <select id="strategy">
          <option value="active">active</option>
          <option value="round_robin">round_robin</option>
          <option value="failover">failover</option>
          <option value="least_used">least_used</option>
        </select>
        <label for="activeAccount">active_account</label>
        <select id="activeAccount"></select>
        <button id="savePool">保存池配置</button>
        <p class="muted" id="poolStatus"></p>
      </section>

      <section class="card">
        <h2>导入 HAR</h2>
        <label for="accountName">建议账号名</label>
        <input id="accountName" placeholder="例如 fineres-primary" />
        <label for="harFile">选择 HAR 文件</label>
        <input id="harFile" type="file" accept=".har,.json" />
        <button id="importHar">导入并去重</button>
        <p class="muted" id="harStatus"></p>
      </section>
    </div>

    <section class="card" style="margin-top:16px;">
      <h2>账号池</h2>
      <div id="accounts"></div>
    </section>

    <section class="card" style="margin-top:16px;">
      <h2>Debug</h2>
      <pre id="debug"></pre>
    </section>

    <section class="card" style="margin-top:16px;">
      <h2>Raw Config</h2>
      <p class="muted">高级参数可以直接编辑 account-pool.toml 原文。</p>
      <textarea id="configEditor" style="min-height:320px;"></textarea>
      <button id="saveConfig">保存配置文件</button>
      <p class="muted" id="configStatus"></p>
    </section>
  </div>

  <script>
    async function fetchState() {
      const response = await fetch('/api/admin/state');
      return response.json();
    }

    async function fetchConfig() {
      const response = await fetch('/api/admin/config');
      return response.json();
    }

    function renderAccounts(state) {
      const accounts = document.getElementById('accounts');
      const debug = document.getElementById('debug');
      const strategy = document.getElementById('strategy');
      const activeAccount = document.getElementById('activeAccount');
      const openLobe = document.getElementById('openLobe');

      strategy.value = state.pool.strategy || 'active';
      activeAccount.innerHTML = '';

      (state.accounts || []).forEach((account) => {
        const option = document.createElement('option');
        option.value = account.name;
        option.textContent = account.name;
        if (account.name === state.pool.active_account) {
          option.selected = true;
        }
        activeAccount.appendChild(option);
      });

      openLobe.onclick = () => {
        const first = state.accounts?.[0];
        if (first?.base_url) {
          window.open(first.base_url, '_blank');
        }
      };

      accounts.innerHTML = (state.accounts || []).map((account) => {
        const usage = state.usage.accounts?.[account.name] || {};
        const badges = [
          '<span class="pill">' + (account.available ? 'available' : 'unavailable') + '</span>',
          account.unavailable_reason ? '<span class="pill danger">' + account.unavailable_reason + '</span>' : ''
        ].join('');

        return '<div class="account">'
          + '<h3>' + account.name + '</h3>'
          + badges
          + '<p class="muted">base_url: ' + (account.base_url || '') + '</p>'
          + '<p class="muted">email: ' + (account.email || '-') + ' / user_id: ' + (account.user_id || '-') + '</p>'
          + '<p class="muted">requests: ' + (usage.total_requests || 0) + ' · success: ' + (usage.success_requests || 0) + ' · failed: ' + (usage.failed_requests || 0) + '</p>'
          + '<p class="muted">last_used_at: ' + (usage.last_used_at || '-') + '</p>'
          + '</div>';
      }).join('');

      debug.textContent = JSON.stringify(state, null, 2);
    }

    async function refresh() {
      const state = await fetchState();
      const config = await fetchConfig();
      renderAccounts(state);
      document.getElementById('configEditor').value = config.content || '';
    }

    document.getElementById('refreshState').onclick = refresh;

    document.getElementById('savePool').onclick = async () => {
      const body = {
        strategy: document.getElementById('strategy').value,
        activeAccount: document.getElementById('activeAccount').value
      };

      const response = await fetch('/api/admin/save-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await response.json();
      document.getElementById('poolStatus').textContent = result.message || '已保存';
      await refresh();
    };

    document.getElementById('importHar').onclick = async () => {
      const file = document.getElementById('harFile').files[0];
      if (!file) {
        document.getElementById('harStatus').textContent = '请先选择 HAR 文件';
        return;
      }

      const text = await file.text();
      const body = {
        suggestedName: document.getElementById('accountName').value || 'imported-account',
        harText: text
      };

      const response = await fetch('/api/admin/import-har', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await response.json();
      document.getElementById('harStatus').textContent = result.message || '导入完成';
      await refresh();
    };

    document.getElementById('saveConfig').onclick = async () => {
      const content = document.getElementById('configEditor').value;
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const result = await response.json();
      document.getElementById('configStatus').textContent = result.message || '配置已保存';
      await refresh();
    };

    refresh();
  </script>
</body>
</html>`;
}
