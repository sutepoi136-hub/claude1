const test = require('node:test');
const assert = require('node:assert/strict');
const { GQ } = require('./load.js');
const { evaluate, trapsOf, WEIGHT } = GQ.Scorer;

// 採点のふるまいを確かめるための、小さな架空の会議
const EP = {
  id: 'test-ep', series: 'work', cast: ['田中', '佐藤'],
  model: '■日時: 10/1\n【決定事項】\n・B案に決定\n【ToDo】\n・佐藤: 素材を10/9までに渡す\n【保留・課題】\n・電話番号の必須化は保留\n【次回】\n・10/16 15:00',
  points: [
    { id: 'd', type: 'decision', label: 'B案に決定', must: [['B案'], ['決定', '採用']] },
    { id: 't', type: 'todo', label: '佐藤: 素材を10/9まで', must: [['素材']], owner: ['佐藤'], due: ['10/9', '9日'] },
    { id: 'p', type: 'pending', label: '電話番号は保留', must: [['電話']], trap: '電話番号の必須化を決定と書いている' },
    { id: 'n', type: 'next', label: '次回 10/16 15時', must: [['10/16'], ['15:00']] },
  ],
  traps: [{ id: 'trap-old', label: '旧日程', when: [['11/6']], unless: ['11/13', '変更'] }],
};
const ctx = { player: { name: '皆川', reading: 'みながわ' } };

test('配点の合計は100点', () => {
  assert.equal(Object.values(WEIGHT).reduce((a, b) => a + b, 0), 100);
});

test('模範解答は100点', () => {
  const r = evaluate(EP, EP.model, ctx);
  assert.equal(r.total, 100);
  assert.deepEqual(r.traps, []);
});

test('テンプレートだけ・白紙同然の議事録は0点', () => {
  for (const t of GQ.Templates.BUILTIN) assert.equal(evaluate(EP, t.body, ctx).total, 0, t.name);
  assert.ok(evaluate(EP, '会議をしました。いろいろ決まりました。', ctx).total < 10);
});

test('保留を決定事項に書くと引っかけ(自動)、保留と書けば引っかからない', () => {
  const bad = evaluate(EP, '【決定事項】\n・B案に決定\n・電話番号を必須にする', ctx);
  assert.deepEqual(bad.traps.map((t) => t.id), ['premature-p']);
  const ok = evaluate(EP, '【決定事項】\n・B案に決定\n・電話番号は保留(次回)', ctx);
  assert.deepEqual(ok.traps, []);
  assert.equal(trapsOf(EP).length, 2);
});

test('分類: 決定事項を保留の見出しに書くと分類で減点', () => {
  const r = evaluate(EP, '【保留・課題】\n・B案に決定\n・電話番号は保留', ctx);
  const d = r.points.find((p) => p.id === 'd');
  assert.ok(d.found && !d.classifyOk);
  assert.ok(r.axes.classify < WEIGHT.classify);
});

test('ToDo: 担当と期限が同じ行にないと、ToDoの点が減る', () => {
  const full = evaluate(EP, '【ToDo】\n・佐藤: 素材を渡す(10/9)', ctx).points.find((p) => p.id === 't');
  assert.ok(full.ownerOk && full.dueOk);
  const noDue = evaluate(EP, '【ToDo】\n・佐藤: 素材を渡す', ctx).points.find((p) => p.id === 't');
  assert.ok(noDue.found && noDue.ownerOk && !noDue.dueOk);
  // 担当者ごとの小見出しの下に書いてもよい
  const label = evaluate(EP, '【ToDo】\n■佐藤さん\n・素材を渡す(10/9)', ctx).points.find((p) => p.id === 't');
  assert.ok(label.ownerOk && label.dueOk);
});

test('保留の要点は「保留」と分かる書き方か、保留の見出しの下で拾える', () => {
  assert.ok(evaluate(EP, '【保留】\n・電話番号の必須化', ctx).points.find((p) => p.id === 'p').found);
  assert.ok(evaluate(EP, '・電話番号の必須化は次回に持ち越し', ctx).points.find((p) => p.id === 'p').found);
  assert.ok(!evaluate(EP, '【共有事項】\n・電話番号の必須化について議論', ctx).points.find((p) => p.id === 'p').found);
});

test('明示の引っかけ: unless の語があれば引っかからない', () => {
  assert.deepEqual(evaluate(EP, '・公開日は11/6', ctx).traps.map((t) => t.id), ['trap-old']);
  assert.deepEqual(evaluate(EP, '・公開日を11/6から11/13に変更', ctx).traps, []);
});

test('@player の担当者は、プレイヤーの名前・「自分」などで書ける', () => {
  const ep = { ...EP, points: [{ id: 'me', type: 'todo', label: 'あなた: 議事録', must: [['議事録']], owner: ['@player'], due: ['本日'] }] };
  for (const who of ['皆川', 'みながわ', '自分', 'PMO', '書記官']) {
    const p = evaluate(ep, `【ToDo】\n・${who}: 議事録を本日中に共有`, ctx).points[0];
    assert.ok(p.ownerOk, who);
  }
});

test('長すぎる議事録は、構成の点が減り、アドバイスが出る', () => {
  const long = EP.model + '\n' + '・補足のメモです。'.repeat(120);
  const r = evaluate(EP, long, ctx);
  assert.ok(r.axes.structure < WEIGHT.structure);
  assert.ok(r.notes.some((n) => /長すぎ/.test(n)));
});
