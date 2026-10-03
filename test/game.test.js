const test = require('node:test');
const assert = require('node:assert/strict');
const { GQ } = require('./load.js');
const { Game, Data } = GQ;

const at = (d) => new Date(2026, 9, d, 12).getTime();
const play = (episodeId, total, extra = {}) => ({ at: at(1), episodeId, series: episodeId.split('-')[0], total, rank: GQ.Scorer.rankOf(total), axes: {}, traps: 0, assist: false, ...extra });

test('XP: 得点+初挑戦+初クリア+Sランク。字幕ありは得点が半分', () => {
  const log = Game.xpLog([play('work-01', 50), play('work-01', 80), play('work-01', 95), play('work-02', 80, { assist: true })]);
  assert.equal(log[0].xp, 50 + Game.XP.firstTry);
  assert.equal(log[1].xp, 80 + Game.XP.firstClear);
  assert.equal(log[2].xp, 95 + Game.XP.rankS);
  assert.equal(log[3].xp, 40 + Game.XP.firstTry + Game.XP.firstClear);
});

test('レベル: Lv.n の開始は 50×(n−1)²', () => {
  assert.equal(Game.levelInfo(0).level, 1);
  assert.equal(Game.levelInfo(49).level, 1);
  assert.equal(Game.levelInfo(50).level, 2);
  assert.equal(Game.levelInfo(200).level, 3);
  assert.equal(Game.levelStart(10), 4050);
});

test('解放: 各シリーズの最初の話は最初から。次の話は前の話のクリアで解放', () => {
  for (const s of Data.seriesList()) {
    const eps = Data.episodesOf(s.id);
    assert.ok(Game.isUnlocked(eps[0], []));
    assert.ok(!Game.isUnlocked(eps[1], []));
    assert.ok(!Game.isUnlocked(eps[1], [play(eps[0].id, 59)]));
    assert.ok(Game.isUnlocked(eps[1], [play(eps[0].id, 60)]));
    assert.ok(Game.isUnlocked(eps[eps.length - 1], [], { unlockAll: true }));
  }
  assert.equal(Game.nextEpisode('work', [play('work-01', 70)]).id, 'work-02');
});

test('連続日数', () => {
  const h = [1, 2, 3, 5].map((d) => ({ ...play('work-01', 70), at: at(d) }));
  assert.equal(Game.longestStreak(h), 3);
  assert.equal(Game.streakOf(h, at(5)), 1);
  assert.equal(Game.streakOf(h, at(6)), 1);
  assert.equal(Game.streakOf(h, at(7)), 0);
});

test('バッジ: 一度獲得したものは消えない', () => {
  const ids = Game.badgesOf([play('work-01', 92)]);
  assert.ok(ids.includes('first') && ids.includes('clear') && ids.includes('rankS'));
  assert.deepEqual(Game.badgesOf([], ['rankS']), ['rankS']);
  const ids2 = Game.badgesOf([play('work-01', 80, { writeSec: 120 })]);
  assert.ok(ids2.includes('speed') && ids2.includes('ears'));
});
