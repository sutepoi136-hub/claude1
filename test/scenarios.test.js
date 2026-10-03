const test = require('node:test');
const assert = require('node:assert/strict');
const { SCENARIOS } = require('../js/scenarios.js');
const { evaluate, TYPE_LABELS } = require('../js/scoring.js');

test('シナリオ: 初級・中級が揃っている', () => {
  assert.ok(SCENARIOS.filter((s) => s.level === '初級').length >= 4);
  assert.ok(SCENARIOS.filter((s) => s.level === '中級').length >= 4);
});

test('シナリオ: ID重複なし・必須項目・話者の整合', () => {
  const ids = SCENARIOS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of SCENARIOS) {
    assert.ok(['初級', '中級', '上級'].includes(s.level), s.id);
    assert.ok(s.title && s.description && s.modelAnswer, s.id + ' 必須項目');
    const names = Object.keys(s.speakers);
    assert.ok(names.length >= 3, s.id + ' 話者は3人以上');
    for (const n of names) {
      const sp = s.speakers[n];
      assert.ok(['male', 'female'].includes(sp.voice) && sp.role && /^#[0-9a-f]{6}$/i.test(sp.color), `${s.id}/${n}`);
    }
    for (const [who, text] of s.script) {
      assert.ok(names.includes(who), `${s.id}: 台本の話者 ${who} が speakers に無い`);
      assert.ok(text.length > 0);
    }
    const kp = s.keyPoints.map((p) => p.id);
    assert.equal(new Set(kp).size, kp.length, s.id + ' keyPoints 重複');
    for (const p of s.keyPoints) assert.ok(TYPE_LABELS[p.type], `${s.id}/${p.id}: 未知の type ${p.type}`);
    assert.ok(s.traps.length >= 1, s.id + ' 引っかけが1つ以上');
  }
});

test('シナリオ: 長さの目安(初級は短め、中級は長め)', () => {
  const chars = (s) => s.script.map((l) => l[1]).join('').length;
  for (const s of SCENARIOS) {
    if (s.level === '初級') assert.ok(chars(s) >= 550 && chars(s) <= 1400, `${s.id} ${chars(s)}`);
    if (s.level === '中級') assert.ok(chars(s) >= 1000, `${s.id} ${chars(s)}`);
  }
});

test('シナリオ: 会議の途中で別の話題に脱線しない(脱線フレーズが無い)', () => {
  for (const s of SCENARIOS) {
    for (const [, text] of s.script) assert.ok(!/話がそれ|話は変わ|そういえば昨日|ところで話は/.test(text), `${s.id}: ${text}`);
  }
});

test('シナリオ: 正解データは台本に根拠がある(要点の日付・数字が台本の読みと矛盾しない)', () => {
  // 模範解答が満点・引っかけ無しで、白紙や雑な議事録は低得点になること
  for (const s of SCENARIOS) {
    const model = evaluate(s, s.modelAnswer);
    assert.equal(model.total, 100, s.id + ' 模範解答は満点');
    assert.deepEqual(model.triggered, [], s.id + ' 模範解答は引っかけに掛からない');
    const lazy = evaluate(s, '会議をした。いろいろ決まった。\n・次回また集まる\n・各自がんばる');
    assert.ok(lazy.total < 40, `${s.id} 雑な議事録が高得点 ${lazy.total}`);
  }
});

test('シナリオ: 引っかけは「それらしい誤り」で反応する', () => {
  const by = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
  const trapIds = (id, text) => evaluate(by[id], text).triggered.map((t) => t.id);
  assert.ok(trapIds('attendance-kickoff-1', '・プロジェクト責任者は人事部長に決定').includes('trap-owner'));
  assert.ok(trapIds('app-weekly-1', '・ブランドカラーは変更に決定').includes('trap-brand'));
  assert.ok(trapIds('seminar-prep-1', '・SNS広告の予算は承認済み').includes('trap-sns'));
  assert.ok(trapIds('migration-gonogo-1', '・残りの不具合は12件\n・切替日は11/28に決定\n・追加予算を承認').length === 3);
  assert.ok(trapIds('ad-review-1', '・クリック率は1.8%\n・動画広告の制作を決定').length === 2);
  assert.ok(trapIds('vendor-incident-1', '・障害は10時ごろ発生\n・費用負担はベンダーが負担することで合意').length === 2);
});
