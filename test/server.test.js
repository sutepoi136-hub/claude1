const test = require('node:test');
const assert = require('node:assert/strict');

test('server: キー無しは503、静的配信は公開ファイルだけ', async () => {
  delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_AUTH_TOKEN; delete process.env.PMO_MOCK_AI;
  const { server } = require('../server.js');
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  try {
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/js/app.js')).status, 200);
    for (const p of ['/server.js', '/lib/ai-review.js', '/package.json', '/.env', '/js/../server.js', '/%2e%2e/server.js']) {
      assert.equal((await fetch(base + p)).status, 404, p);
    }
    assert.deepEqual(await (await fetch(base + '/api/status')).json(), { app: 'pmo-practice', ai: false, mock: false });
    const r = await post('/api/review', { scenarioId: 'web-renewal-1', minutes: 'x'.repeat(30) });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'no_key');
  } finally { server.close(); }
});

test('server: 日本語入りのAPIキーは通信前に検出し、原因つきで返す(ByteStringエラーの再発防止)', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-ここにAPIキー';
  delete process.env.PMO_MOCK_AI;
  const { server } = require('../server.js');
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const st = await (await fetch(base + '/api/status')).json();
    assert.equal(st.ai, false);
    assert.equal(st.reason, 'badkey');
    const r = await fetch(base + '/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenarioId: 'web-renewal-1', minutes: 'x'.repeat(30) }) });
    assert.equal(r.status, 503);
    const body = await r.json();
    assert.equal(body.error, 'badkey');
    assert.match(body.message, /半角英数字/);
  } finally {
    server.close();
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
  }
});
