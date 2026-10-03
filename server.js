// 静的ファイル配信 + AI採点API。APIキーはサーバー側の環境変数(ANTHROPIC_API_KEY)だけで使う。
// 起動: npm start   (PMO_MOCK_AI=1 でAPIキー無しの動作確認)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { reviewMinutes, generateModelAnswer, AiError, MAX_MINUTES_CHARS } = require('./lib/ai-review.js');
const { SCENARIOS } = require('./js/scenarios.js');

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const PUBLIC = [/^\/$/, /^\/index\.html$/, /^\/css\/[\w.-]+$/, /^\/js\/[\w.-]+$/];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

let client = null;
function getClient() {
  if (client) return client;
  if (process.env.PMO_MOCK_AI === '1') return (client = require('./lib/mock-client.js').mockClient());
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
  return (client = new Anthropic());
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) { reject(new AiError('too_large', 'リクエストが大きすぎます。')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(new AiError('bad_json', 'JSONが不正です。')); }
    });
  });
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/status') return send(res, 200, { ai: !!getClient() });
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const c = getClient();
  if (!c) return send(res, 503, { error: 'no_key', message: 'AI採点は未設定です(サーバーに ANTHROPIC_API_KEY が必要です)。' });
  try {
    const body = await readJson(req);
    const scenario = SCENARIOS.find((s) => s.id === body.scenarioId);
    if (!scenario) return send(res, 404, { error: 'unknown_scenario' });
    if (pathname === '/api/review') {
      const minutes = typeof body.minutes === 'string' ? body.minutes.trim() : '';
      if (minutes.length < 20) return send(res, 400, { error: 'too_short', message: '議事録が短すぎます。' });
      return send(res, 200, await reviewMinutes({ client: c, scenario, minutes }));
    }
    if (pathname === '/api/model-answer') return send(res, 200, await generateModelAnswer({ client: c, scenario }));
    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    if (e instanceof AiError) return send(res, e.code === 'too_long' || e.code === 'too_large' ? 413 : 502, { error: e.code, message: e.message });
    console.error('[api error]', e && e.status, e && e.message);
    return send(res, 502, { error: 'ai_failed', message: 'AI採点に失敗しました。時間をおいて再試行してください。' });
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);
  if (!PUBLIC.some((re) => re.test(pathname))) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) =>
    err ? send(res, 404, 'Not found', 'text/plain; charset=utf-8') : send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream')
  );
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`http://localhost:${PORT}  (AI: ${getClient() ? 'on' : 'off - ANTHROPIC_API_KEY 未設定'}, 議事録上限 ${MAX_MINUTES_CHARS}文字)`);
  });
}
module.exports = { server };
