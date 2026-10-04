const test = require('node:test');
const assert = require('node:assert/strict');
const { GQ } = require('./load.js');

test('ルール説明: 主要な項目があり、数値は定数と一致する', () => {
  const secs = GQ.Help.sections();
  const ids = secs.map((s) => s.id);
  for (const id of ['howto', 'scoring', 'skill', 'rank', 'redpen', 'story', 'xp', 'streak', 'badges', 'audio', 'templates', 'data']) assert.ok(ids.includes(id), id);
  const scoring = secs.find((s) => s.id === 'scoring').html;
  for (const [k, v] of Object.entries(GQ.Scorer.WEIGHT)) assert.ok(scoring.includes(`${v}点`), k);
  assert.ok(secs.find((s) => s.id === 'rank').html.includes(`${GQ.Scorer.CLEAR}点以上`));
});
