const test = require('node:test');
const assert = require('node:assert/strict');
const { GQ } = require('./load.js');
const { parse, heading } = GQ.Parser;

test('見出し: いろいろな書き方を認識する', () => {
  const ok = {
    '【決定事項】': 'decision', '■決定事項': 'decision', '## 決定事項': 'decision', '＜決まったこと＞': 'decision', '決議事項': 'decision',
    '【ToDo】(誰が・何を・いつまでに)': 'todo', 'TODO': 'todo', '宿題': 'todo', '下命事項': 'todo', 'やること': 'todo',
    '【保留・課題】': 'pending', '未決事項': 'pending', '課題・懸念': 'pending', '保留事項・課題': 'pending',
    '【共有事項】': 'info', '報告事項': 'info', '経緯・事実': 'info',
    '【次回】': 'next', '次回予定': 'next', '次回軍議': 'next',
    '■日時:': 'meta', '参加者': 'meta', '出席者': 'meta', '軍議名': 'meta',
  };
  for (const [line, type] of Object.entries(ok)) assert.equal((heading(line) || {}).type, type, line);
  for (const line of ['・B案に決定', '・目的: 負担軽減', 'B案に決定', '・次回までに資料を作る', '高木さん：社長に確認']) assert.equal(heading(line), null, line);
});

test('見出し: 同じ行に内容が続く書き方', () => {
  assert.deepEqual(heading('次回: 10/13 10:00'), { type: 'next', rest: '10/13 10:00' });
  assert.deepEqual(heading('【次回】10/13 10:00'), { type: 'next', rest: '10/13 10:00' });
  assert.deepEqual(heading('■次回 10/27(火)10:00'), { type: 'next', rest: '10/27(火)10:00' });
  assert.deepEqual(heading('決定事項：B案を採用'), { type: 'decision', rest: 'B案を採用' });
});

test('項目: 見出しの下の行・担当者の小見出し・字下げの続き', () => {
  const p = parse('【ToDo】\n■中川さん\n・申請書を提出(10/16)\n  → 小野寺さんへ\n【保留】\n・注文番号', { names: ['中川'] });
  assert.equal(p.items.length, 2);
  assert.equal(p.items[0].section, 'todo');
  assert.equal(p.items[0].label, '中川さん');
  assert.match(p.items[0].text, /小野寺さんへ/);
  assert.equal(p.items[1].section, 'pending');
  assert.equal(p.sections.todo, 1);
});

test('項目: 長い段落は文ごとに分ける', () => {
  const p = parse('本日はB案に決定した。電話番号の必須化は保留とし、次回までに高木さんが営業と相談する。');
  assert.equal(p.items.length, 2);
});
