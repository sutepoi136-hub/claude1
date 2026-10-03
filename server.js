// 静的ファイル配信 + AI採点API。APIキーはサーバー側の環境変数(ANTHROPIC_API_KEY)だけで使う。
// 起動: npm start   (PMO_MOCK_AI=1 でAPIキー無しの動作確認)
const http = require('node:http');
const { loadEnvFile } = require('./lib/env.js');
loadEnvFile(require('node:path').join(__dirname, '.env'));
const fs = require('node:fs');
const path = require('node:path');
// 必要なパッケージ(npm install)が無くてもサーバーは起動し、画面に原因を表示できるようにする
let ai = null;
let depsError = null;
try {
  ai = require('./lib/ai-review.js');
} catch (e) {
  if (e && e.code === 'MODULE_NOT_FOUND') {
    depsError = e;
    console.error('\n[警告] 必要なパッケージが見つかりません: ' + (e.message || '').split('\n')[0]);
    console.error('       フォルダで  npm install  を実行するか、start.bat(Mac は bash start.sh)から起動してください。\n');
  } else throw e;
}
const AiError = ai ? ai.AiError : class AiError extends Error {};
const MAX_MINUTES_CHARS = ai ? ai.MAX_MINUTES_CHARS : 5000;
const { SCENARIOS } = require('./js/scenarios.js');

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const PUBLIC = [/^\/$/, /^\/index\.html$/, /^\/css\/[\w.-]+$/, /^\/js\/[\w.-]+$/];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

let client = null;
function getClient() {
  if (depsError) return null;
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
  if (req.method === 'GET' && pathname === '/api/status') {
    return send(res, 200, { app: 'pmo-practice', ai: !!getClient(), mock: process.env.PMO_MOCK_AI === '1', reason: depsError ? 'deps' : undefined });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  if (depsError) return send(res, 503, { error: 'deps', message: '必要なパッケージが入っていません。npm install を実行してください。' });
  const c = getClient();
  if (!c) return send(res, 503, { error: 'no_key', message: 'AI採点は未設定です(サーバーに ANTHROPIC_API_KEY が必要です)。' });
  try {
    const body = await readJson(req);
    const scenario = SCENARIOS.find((s) => s.id === body.scenarioId);
    if (!scenario) return send(res, 404, { error: 'unknown_scenario' });
    if (pathname === '/api/review') {
      const minutes = typeof body.minutes === 'string' ? body.minutes.trim() : '';
      if (minutes.length < 20) return send(res, 400, { error: 'too_short', message: '議事録が短すぎます。' });
      return send(res, 200, await ai.reviewMinutes({ client: c, scenario, minutes }));
    }
    if (pathname === '/api/model-answer') return send(res, 200, await ai.generateModelAnswer({ client: c, scenario }));
    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    if (e instanceof AiError) return send(res, e.code === 'too_long' || e.code === 'too_large' ? 413 : 502, { error: e.code, message: e.message });
    console.error('[api error]', e && e.status, e && e.message);
    const status = e && e.status;
    const message =
      status === 401 || status === 403 ? 'APIキーが無効、または権限がありません。.env の ANTHROPIC_API_KEY を確認してください。'
      : status === 404 ? `モデルが見つかりません(${process.env.PMO_AI_MODEL || '既定モデル'})。.env の PMO_AI_MODEL を確認してください。`
      : status === 429 ? 'リクエストが多すぎます。少し待ってから再試行してください。'
      : status === 400 ? 'APIが要求を受け付けませんでした(残高不足の可能性があります)。サーバーのログを確認してください。'
      : 'AI採点に失敗しました。時間をおいて再試行してください。サーバーのログに詳細があります。';
    return send(res, 502, { error: 'ai_failed', message });
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
  server.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE'
      ? `\nポート ${PORT} は使用中です。前のサーバーを止めるか、PORT=8001 のように別のポートで起動してください。`
      : e);
    process.exit(1);
  });
  server.listen(PORT, () => {
    console.log('');
    console.log(`  議事録クエスト を起動しました → ブラウザで http://localhost:${PORT} を開いてください`);
    console.log(depsError
      ? '  AI採点: 使えません(パッケージ未インストール。npm install を実行してください)'
      : getClient()
      ? '  AI採点: 使えます'
      : '  AI採点: 未設定(形式採点だけ使えます)。使うには .env に ANTHROPIC_API_KEY=... を書いて再起動してください');
    console.log('');
  });
}
module.exports = { server };
