const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, Templates } = require('../js/store.js');
const { SCENARIOS } = require('../js/scenarios.js');

const DAY = 86400000;
const t0 = new Date(2026, 9, 1, 12).getTime();
const play = (i, total, extra = {}) => ({ at: t0 + i * DAY, scenarioId: 'web-renewal-1', total, rank: total >= 90 ? 'S' : total >= 75 ? 'A' : 'B', traps: 0, ...extra });

test('XP: 初クリア+20 / Sランク+30、レベルは単調に上がる', () => {
  assert.equal(Game.xpOf([]), 0);
  assert.equal(Game.xpOf([play(0, 60)]), 80);
  assert.equal(Game.xpOf([play(0, 60), play(1, 60)]), 80 + 60);
  assert.equal(Game.xpOf([play(0, 95)]), 95 + 20 + 30);
  assert.equal(Game.levelInfo(0).level, 1);
  assert.equal(Game.levelInfo(59).level, 1);
  assert.equal(Game.levelInfo(60).level, 2);
  assert.equal(Game.levelInfo(240).level, 3);
  const li = Game.levelInfo(150);
  assert.ok(li.pct >= 0 && li.pct <= 100 && li.xp >= li.floor && li.xp < li.next);
  assert.ok(Game.levelInfo(1e9).title);
});

test('連続日数: 今日/昨日起点・途切れ・最長', () => {
  const now = t0 + 2 * DAY;
  assert.equal(Game.streakOf([], now), 0);
  assert.equal(Game.streakOf([play(0, 50), play(1, 50), play(2, 50)], now), 3);
  assert.equal(Game.streakOf([play(0, 50), play(1, 50)], now), 2); // 昨日まで
  assert.equal(Game.streakOf([play(0, 50)], now), 0); // 一昨日で途切れ
  assert.equal(Game.streakOf([play(2, 50), play(2, 60)], now), 1); // 同日複数回
  assert.equal(Game.longestStreak([play(0, 1), play(1, 1), play(5, 1), play(6, 1), play(7, 1), play(8, 1)]), 4);
});

test('バッジ判定', () => {
  const ids = (h) => Game.badgesOf(h, SCENARIOS);
  assert.deepEqual(ids([]), []);
  assert.ok(ids([play(0, 50)]).includes('first'));
  assert.ok(ids([play(0, 80)]).includes('rankA') && !ids([play(0, 80)]).includes('rankS'));
  assert.ok(ids([play(0, 95)]).includes('rankS'));
  assert.ok(ids([play(0, 70, { traps: 0 })]).includes('clean'));
  assert.ok(!ids([play(0, 70, { traps: 1 })]).includes('clean'));
  assert.ok(ids([play(0, 60, { ai: true, bonus: 5 })]).includes('aiplus'));
  assert.ok(ids([play(0, 60), play(1, 60), play(2, 60)]).includes('streak3'));
  assert.ok(ids([play(0, 50), play(1, 62)]).includes('grow'));
  assert.ok(!ids([play(0, 62), play(1, 50)]).includes('grow'));
  assert.ok(!ids([play(0, 70)]).includes('all')); // 2シナリオのうち1つだけ
  const both = SCENARIOS.map((s, i) => play(i, 70, { scenarioId: s.id }));
  assert.ok(ids(both).includes('all'));
});

test('テンプレート: 保存・上書き・同名回避・削除・既定', () => {
  let d = Templates.empty();
  let r = Templates.save(d, { name: '定例', body: 'A' });
  d = r.data;
  assert.equal(d.items.length, 1);
  const id = r.id;
  r = Templates.save(d, { id, name: '定例', body: 'B' }); // 上書き(同名でも連番にならない)
  d = r.data;
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].name, '定例');
  assert.equal(d.items[0].body, 'B');
  d = Templates.save(d, { name: '定例', body: 'C' }).data; // 別テンプレートで同名 → 連番
  assert.equal(d.items[1].name, '定例 (2)');
  d = Templates.save(d, { name: Templates.BUILTIN[0].name, body: 'x' }).data; // 組み込みと同名も避ける
  assert.notEqual(d.items[2].name, Templates.BUILTIN[0].name);
  assert.equal(Templates.save(d, { name: '   ', body: 'z' }).data.items.at(-1).name, 'マイテンプレート');
  d = Templates.setDefault(d, id);
  assert.equal(d.defaultId, id);
  d = Templates.remove(d, id);
  assert.equal(d.defaultId, null);
  assert.equal(d.items.length, 2);
  assert.ok(Templates.find(d, 'builtin-standard').builtin);
  assert.equal(Templates.all(d).length, Templates.BUILTIN.length + 2);
});

test('テンプレート挿入: 空なら置換、途中ならカーソル位置に区切って挿入', () => {
  assert.deepEqual(Templates.insertInto('  ', 'BODY', 0), { text: 'BODY', caret: 4 });
  const r = Templates.insertInto('メモ1\nメモ2', 'BODY', 3); // 行末にカーソル
  assert.ok(r.text.startsWith('メモ1\n\nBODY'));
  assert.equal(Templates.insertInto('メモ1\nメモ2', 'BODY', 4).text.startsWith('メモ1\nBODY'), true); // 行頭なら空行を足さない
  assert.ok(r.text.endsWith('メモ2'));
  assert.equal(r.text.slice(r.caret - 4, r.caret), 'BODY');
  assert.equal(Templates.insertInto('abc', 'X', 999).text, 'abc\n\nX');
});
