// テスト用: index.html の <script> と同じ順で、画面に依存しないファイル(core・data・help)を読み込む
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const PURE = /^js\/(core|data)\/|^js\/ui\/help\.js$/;
for (const src of scripts.filter((s) => PURE.test(s))) require(path.join(ROOT, src));

module.exports = { GQ: globalThis.GQ, scripts, ROOT };
