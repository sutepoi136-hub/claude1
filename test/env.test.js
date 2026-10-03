const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEnv } = require('../lib/env.js');

test('.env: 引用符・コメント・export・BOM・CRLF', () => {
  const v = parseEnv('﻿# comment\r\nANTHROPIC_API_KEY=sk-ant-abc\r\nexport PORT = 8001 # port\r\nQ="a b"\r\nS=\'x\'\r\n\r\nbad line\r\nEMPTY=\r\n');
  assert.deepEqual(v, { ANTHROPIC_API_KEY: 'sk-ant-abc', PORT: '8001', Q: 'a b', S: 'x', EMPTY: '' });
});
