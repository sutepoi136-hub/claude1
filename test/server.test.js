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
