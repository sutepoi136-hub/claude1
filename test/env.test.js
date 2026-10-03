const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEnv, apiKeyProblem } = require('../lib/env.js');

test('.env: 引用符・コメント・export・BOM・CRLF', () => {
  const v = parseEnv('﻿# comment\r\nANTHROPIC_API_KEY=sk-ant-abc\r\nexport PORT = 8001 # port\r\nQ="a b"\r\nS=\'x\'\r\n\r\nbad line\r\nEMPTY=\r\n');
  assert.deepEqual(v, { ANTHROPIC_API_KEY: 'sk-ant-abc', PORT: '8001', Q: 'a b', S: 'x', EMPTY: '' });
});

test('APIキーの形式チェック: 日本語入りの見本・短い値・空白を検出、正しい形は通す', () => {
  assert.equal(apiKeyProblem(undefined), null);
  assert.equal(apiKeyProblem(''), null);
  assert.equal(apiKeyProblem('sk-ant-ここにAPIキー'), 'nonascii'); // 以前の .env.example の見本(実際に起きたエラー)
  assert.equal(apiKeyProblem('sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 '), 'nonascii');
  assert.equal(apiKeyProblem('sk-ant-api03-abc\u3000def0123456789012345'), 'nonascii'); // 全角スペース
  assert.equal(apiKeyProblem('sk-ant-xxxxxxxx'), 'short');
  assert.equal(apiKeyProblem('sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-AbCdEf'), null);
});

test('.env.example: ASCIIのみで、キーは空(見本を本物のキーとして送らない)', () => {
  const text = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '.env.example'), 'utf8');
  assert.ok(!/[^\x00-\x7f]/.test(text), '非ASCII文字が含まれている');
  assert.equal(parseEnv(text).ANTHROPIC_API_KEY, '');
});
