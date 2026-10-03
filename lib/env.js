// .env を読み込む(依存なしの簡易版)。すでに設定済みの環境変数は上書きしない。
const fs = require('node:fs');

function parseEnv(text) {
  const out = {};
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}

function loadEnvFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return {}; }
  const vars = parseEnv(text);
  for (const [k, v] of Object.entries(vars)) if (v && !process.env[k]) process.env[k] = v;
  return vars;
}

module.exports = { parseEnv, loadEnvFile };
