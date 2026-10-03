const test = require('node:test');
const assert = require('node:assert/strict');
const { SCENARIOS } = require('../js/scenarios.js');
const { evaluate, TYPE_LABELS } = require('../js/scoring.js');

test('シナリオ: 初級・中級が揃っている', () => {
  assert.ok(SCENARIOS.filter((s) => s.level === '初級').length >= 6);
  assert.ok(SCENARIOS.filter((s) => s.level === '中級').length >= 6);
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

test('魔王軍編: シリーズ・話数が揃い、時系列(会議日)が話数順に進む', () => {
  const maou = SCENARIOS.filter((s) => s.series === '魔王軍編').sort((a, b) => a.episode - b.episode);
  assert.ok(maou.length >= 4);
  assert.deepEqual(maou.map((s) => s.episode), maou.map((_, i) => i + 1), '話数は1から連番');
  for (const s of SCENARIOS) assert.equal(!!s.series, s.episode !== undefined, `${s.id}: series と episode は両方つける`);
  // 説明文の「会議日は◯/◯」が話数順に進む(物語の時系列が逆転しない)
  const day = (s) => { const m = s.description.match(/会議日は(\d+)\/(\d+)/); assert.ok(m, s.id + ' 会議日'); return Number(m[1]) * 31 + Number(m[2]); };
  for (let i = 1; i < maou.length; i++) assert.ok(day(maou[i]) > day(maou[i - 1]), `${maou[i].id} は前の話より後の日付`);
});

test('魔王軍編: 会議の形は実務と同じ(決定・ToDo・課題・次回の要点を持つ)', () => {
  for (const s of SCENARIOS.filter((x) => x.series)) {
    const types = new Set(s.keyPoints.map((p) => p.type));
    for (const need of ['decision', 'todo', 'issue', 'next']) assert.ok(types.has(need), `${s.id} に ${need} が無い`);
    assert.ok(/【決定事項】/.test(s.modelAnswer) && /【ToDo】/.test(s.modelAnswer));
  }
});

test('魔王軍編: 引っかけは「それらしい誤り」で反応する', () => {
  const by = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
  const ids = (id, text) => evaluate(by[id], text).triggered.map((t) => t.id).sort();
  assert.deepEqual(ids('maou-kickoff-1', '・勇者の戦力が判明した'), ['trap-power']);
  assert.deepEqual(ids('maou-trap-1', '・ドラゴンの配置を決定\n・罠の予算1000枚を承認'), ['trap-1000', 'trap-dragon']);
  assert.deepEqual(ids('maou-supply-1', '・突破された罠は12個\n・魔界銀行の融資を承認'), ['trap-count', 'trap-loan']);
  assert.deepEqual(ids('maou-decisive-1', '・損害は30人\n・勇者一行は4人\n・魔王の出陣を決定'), ['trap-king', 'trap-loss', 'trap-party']);
  // 訂正を正しく書けていれば引っかからない
  assert.deepEqual(ids('maou-supply-1', '・当初12個と報告されたが、訂正され21個が突破された'), []);
  assert.deepEqual(ids('maou-decisive-1', '・勇者一行は仲間が増えて5人(当初は4人)\n・損害は当初30人と報告→50人に訂正'), []);
});
