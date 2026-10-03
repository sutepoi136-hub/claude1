const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Help } = require('../js/help.js');
const { Game } = require('../js/store.js');
const { RANKS, CLEAR_SCORE } = require('../js/scoring.js');
const { BONUS_MIN, BONUS_MAX } = require('../lib/ai-review.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const sections = Help.sections();
const text = (id) => sections.find((s) => s.id === id).html.replace(/<[^>]+>/g, '');

test('ルール説明: AIボーナスの範囲がサーバーの値と一致している', () => {
  assert.equal(Help.AI_BONUS.min, BONUS_MIN);
  assert.equal(Help.AI_BONUS.max, BONUS_MAX);
  assert.ok(text('scoring').includes(`${BONUS_MIN}〜+${BONUS_MAX}`));
});

test('ルール説明: 配点・ランク・XP・クリア基準が実際のコードの値から作られている', () => {
  const scoring = text('scoring');
  assert.ok(scoring.includes('網羅性 70点') && scoring.includes('構造化 15点') && scoring.includes('正確性 15点'));
  for (const [r, min] of RANKS.slice(0, -1)) assert.ok(text('rank').includes(`${r} ${min}点以上`), r);
  assert.ok(text('xp').includes(`初挑戦ボーナス +${Game.XP.firstTry}`));
  assert.ok(text('xp').includes(`Sランクボーナス +${Game.XP.rankS}`));
  assert.ok(text('xp').includes(`${80 + Game.XP.firstTry} XP`));
  for (let l = 1; l <= 8; l++) assert.ok(text('xp').includes(`Lv.${l}「${Game.TITLES[l - 1]}」…累計 ${Game.levelStart(l)} XP`), `Lv.${l}`);
  assert.ok(text('levels').includes(`${CLEAR_SCORE}点以上`));
});

test('ルール説明: 全バッジが一覧に載っている', () => {
  for (const b of Game.BADGES) assert.ok(text('badges').includes(b.name) && text('badges').includes(b.desc), b.id);
});

test('ルール説明: ID重複なし、画面の data-help はすべて存在する項目を指す', () => {
  const ids = sections.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const used = new Set();
  for (const f of ['index.html', 'js/app.js', 'js/help.js']) for (const m of read(f).matchAll(/data-help="([a-z]+)"/g)) used.add(m[1]);
  assert.ok(used.size >= 6, '説明への入口が少なすぎる');
  for (const id of used) assert.ok(ids.includes(id), `data-help="${id}" の説明が無い`);
});

test('ツールチップ: data-tip が付いた主要な要素が揃っている', () => {
  const html = read('index.html') + read('js/app.js');
  for (const key of ['XP(経験値)', '連続プレイ日数', '網羅性', '構造化', '正確性', '字幕', 'AIが加点・減点']) assert.ok(html.includes(key), key);
  assert.ok((html.match(/data-tip=/g) || []).length >= 20);
});
