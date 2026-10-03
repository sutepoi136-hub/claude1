const test = require('node:test');
const assert = require('node:assert/strict');
const { SCENARIOS } = require('../js/scenarios.js');
const { evaluate } = require('../js/scoring.js');

for (const s of SCENARIOS) {
  test(`${s.id}: 模範解答は満点で、引っかけにも掛からない`, () => {
    const r = evaluate(s, s.modelAnswer);
    assert.equal(r.total, 100);
    assert.deepEqual(r.triggered, []);
  });
}

const lp = SCENARIOS.find((s) => s.id === 'lp-campaign-1');
const trapsOf = (text) => evaluate(lp, text).triggered.map((t) => t.id);

test('lp: 訂正前の50万円を書くと引っかけ検出', () => {
  assert.ok(trapsOf('【決定事項】\n・追加費用は50万円で承認\n・公開日は11月13日に変更').includes('trap-budget'));
});
test('lp: 動画を決定事項にすると検出、保留なら検出しない', () => {
  assert.ok(trapsOf('・トップに動画バナーを採用することに決定').includes('trap-video'));
  assert.ok(!trapsOf('・動画バナーは保留。山本さんが社内確認して次回回答').includes('trap-video'));
});
test('lp: 公開日が旧日程のままだと検出、変更として書けば検出しない', () => {
  assert.ok(trapsOf('・公開日は11月6日').includes('trap-olddate'));
  assert.ok(!trapsOf('・公開日を11月6日から11月13日へ変更').includes('trap-olddate'));
});
