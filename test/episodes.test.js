// 物語・シナリオのデータ検査。新しい話を追加したら、このテストが通ることを確かめる(docs/authoring.md)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GQ, scripts, ROOT } = require('./load.js');
const { Data, Scorer, Text } = GQ;

const ctx = { player: { name: '皆川', reading: 'みながわ' } };
const LEVEL = {
  初級: { speakers: [3, 4], chars: [700, 1800], points: [8, 13] },
  中級: { speakers: [4, 5], chars: [1000, 2600], points: [11, 16] },
  上級: { speakers: [5, 7], chars: [1800, 4000], points: [14, 20] },
};
const scriptChars = (ep) => ep.script.filter((l) => l[0].charAt(0) !== '@').map((l) => l[1]).join('').length;
const scriptNorm = (ep) => Text.norm(ep.script.map((l) => `${l[0]} ${Data.fill(l[1], ctx.player)}`).join('\n'));

test('データファイルは、すべて index.html から読み込まれている', () => {
  for (const dir of ['work', 'maou']) {
    for (const f of fs.readdirSync(path.join(ROOT, 'js/data', dir))) assert.ok(scripts.includes(`js/data/${dir}/${f}`), `${dir}/${f} が index.html にない`);
  }
});

test('シリーズ: 登場人物・章・全話の構成', () => {
  assert.deepEqual(Data.seriesList().map((s) => s.id), ['work', 'maou']);
  for (const s of Data.seriesList()) {
    for (const [name, c] of Object.entries(s.cast)) {
      assert.ok(['male', 'female'].includes(c.voice), `${s.id}/${name} voice`);
      assert.match(c.color, /^#[0-9a-f]{6}$/i, `${s.id}/${name} color`);
      assert.ok(c.full && c.role && c.org && c.desc && c.avatar, `${s.id}/${name}`);
    }
    assert.deepEqual(s.plan.map((p) => p.no), s.plan.map((_, i) => i + 1), `${s.id} 話数は1から連番`);
    for (let i = 1; i < s.plan.length; i++) assert.ok(s.plan[i].date > s.plan[i - 1].date, `${s.id} 第${i + 1}話の日付は前の話より後`);
    for (const p of s.plan) assert.ok(s.chapters.some((c) => c.no === p.chapter), `${s.id} 第${p.no}話の章`);
    assert.ok(s.prologue.length >= 3 && s.tagline && s.title);
    const eps = Data.episodesOf(s.id);
    for (const lv of ['初級', '中級', '上級']) assert.ok(eps.filter((e) => e.level === lv).length >= 2, `${s.id} の${lv}は2話以上`);
  }
});

for (const ep of Data.episodes) {
  test(`${ep.id}: 構成・台本・正解データの整合`, () => {
    const s = Data.series[ep.series];
    const plan = s.plan.find((p) => p.no === ep.no);
    assert.ok(plan, '全話の構成(plan)にある');
    assert.equal(ep.id, `${ep.series}-${String(ep.no).padStart(2, '0')}`);
    assert.equal(plan.title, ep.title);
    assert.equal(plan.date, ep.meeting.date);
    assert.equal(plan.chapter, ep.chapter);
    assert.equal(s.chapters.find((c) => c.no === ep.chapter).level, ep.level, '章の難易度と一致');
    assert.ok(ep.synopsis && ep.focus.length >= 2 && ep.meeting.name && ep.meeting.time && ep.meeting.place);

    // 台本: 話者は参加者のみ、参加者は全員発言する、途中参加は参加後に発言する
    const lv = LEVEL[ep.level];
    for (const n of ep.cast) assert.ok(s.cast[n], `参加者 ${n} がシリーズの登場人物にいない`);
    assert.ok(ep.cast.length >= lv.speakers[0] && ep.cast.length <= lv.speakers[1], `話者数 ${ep.cast.length}`);
    const spoke = new Set();
    const joined = new Set();
    for (const [who, text] of ep.script) {
      if (who === '@join' || who === '@leave') { assert.ok(ep.cast.includes(text), `${who} ${text}`); if (who === '@join') { assert.ok(!spoke.has(text), `${text} は参加前に発言している`); joined.add(text); } continue; }
      assert.ok(ep.cast.includes(who), `台本の話者 ${who} が参加者にいない`);
      assert.ok(text && text.length < 300, `${who}: 発言が長すぎる/空`);
      assert.ok(!/話がそれ|話は変わ|そういえば昨日|ところで話は/.test(text), `会議の途中で脱線しない: ${text}`);
      spoke.add(who);
    }
    for (const n of ep.cast) assert.ok(spoke.has(n), `${n} が一度も発言しない`);
    const chars = scriptChars(ep);
    assert.ok(chars >= lv.chars[0] && chars <= lv.chars[1], `台本の長さ ${chars}字`);

    // 要点: 種類・必須項目・数・そろえるべき種類
    const ids = ep.points.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, '要点IDの重複');
    assert.ok(ep.points.length >= lv.points[0] && ep.points.length <= lv.points[1], `要点の数 ${ep.points.length}`);
    for (const p of ep.points) {
      assert.ok(Scorer.TYPE[p.type] || p.type === 'issue', `${p.id} type`);
      assert.ok(p.label && Array.isArray(p.must) && p.must.length && p.must.every((g) => g.length), `${p.id} must`);
      if (p.type === 'todo') assert.ok(p.owner && p.owner.length && p.due && p.due.length, `${p.id} ToDoには担当と期限`);
    }
    for (const t of ['decision', 'todo', 'pending', 'next']) assert.ok(ep.points.some((p) => p.type === t), `${t} の要点がない`);
    assert.ok(Scorer.trapsOf(ep).length >= 1, '引っかけが1つ以上');

    // 正解データは台本に根拠がある: 要点の各グループ・担当・期限の語のどれかが台本に出てくる
    const norm = scriptNorm(ep);
    for (const p of ep.points) {
      p.must.forEach((g, i) => assert.ok(Text.hasAny(norm, Text.words(g)), `${p.id} の must[${i}] (${g.join('/')}) が台本にない`));
      if (p.owner) assert.ok(p.owner.includes('@player') || Text.hasAny(norm, Text.words(p.owner)), `${p.id} の担当が台本にない`);
      if (p.due) assert.ok(Text.hasAny(norm, Text.words(p.due)), `${p.id} の期限 (${p.due.join('/')}) が台本にない`);
    }

    // 物語: その後
    const e = ep.epilogue;
    assert.ok(e && e.title && (e.kind === 'chat' ? e.messages.length >= 2 && e.messages.every((m) => s.cast[m.from] && m.text) : e.kind === 'scene' && e.text.length >= 3));
  });

  test(`${ep.id}: 模範解答は満点、別の書き方の解答も高得点、引っかけは正しく反応する`, () => {
    const model = Scorer.evaluate(ep, Data.fill(ep.model, ctx.player), ctx);
    assert.equal(model.total, 100, `模範解答 ${model.total}点 ${JSON.stringify(model.axes)}`);
    assert.deepEqual(model.traps.map((t) => t.id), [], '模範解答が引っかけに反応した');

    const alt = Scorer.evaluate(ep, ep.checks.alt, ctx);
    assert.ok(alt.total >= 90, `別解 ${alt.total}点 ${alt.points.filter((p) => !p.perfect).map((p) => p.id)}`);
    assert.deepEqual(alt.traps.map((t) => t.id), [], '別解が引っかけに反応した');

    const all = Scorer.trapsOf(ep).map((t) => t.id).sort();
    assert.deepEqual(Object.keys(ep.checks.traps).sort(), all, 'すべての引っかけに、反応する例を用意する');
    for (const [id, text] of Object.entries(ep.checks.traps)) {
      assert.ok(Scorer.evaluate(ep, text, ctx).traps.some((t) => t.id === id), `${id} が反応しない: ${text}`);
    }
    const lazy = Scorer.evaluate(ep, '会議をしました。いろいろ決まりました。\n・次回また集まる\n・各自がんばる', ctx);
    assert.ok(lazy.total < 15, `雑な議事録が ${lazy.total}点`);
  });
}

test('物語: 各シリーズの会議日は、話数の順に進む', () => {
  for (const s of Data.seriesList()) {
    const eps = Data.episodesOf(s.id);
    for (let i = 1; i < eps.length; i++) assert.ok(eps[i].meeting.date > eps[i - 1].meeting.date && eps[i].no > eps[i - 1].no, eps[i].id);
  }
});
