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

test('XP: 難しい会議には難易度ボーナスがつく', () => {
  const ep = (lv) => Data.episodes.find((e) => e.level === lv);
  const easy = Game.xpLog([play(ep('初級').id, 70)])[0];
  const mid = Game.xpLog([play(ep('中級').id, 70)])[0];
  const hard = Game.xpLog([play(ep('上級').id, 70)])[0];
  assert.ok(!easy.parts.some((p) => /難易度/.test(p.label)));
  assert.equal(mid.xp - easy.xp, Math.round(70 * Game.XP.levelBonus.中級));
  assert.equal(hard.xp - easy.xp, Math.round(70 * Game.XP.levelBonus.上級));
});

test('解放: 一度遊んだ話は、前の話が未クリアでも解放のまま(あとから話が追加された場合)', () => {
  const eps = Data.episodesOf('work');
  assert.ok(Game.isUnlocked(eps[2], [play(eps[2].id, 40)]));
});

test('実力: 同じ点数なら、難しい会議ほど実力換算が高い。字幕ありは低い', () => {
  const perf = (t, lv, a) => Game.toScore(Game.performance(t, lv, a));
  assert.ok(perf(60, '上級') > perf(60, '中級') && perf(60, '中級') > perf(60, '初級'));
  assert.equal(Math.round(perf(70, '中級')), 70);
  assert.ok(perf(70, '中級', true) < perf(70, '中級'));
  // 上級の低めの点と、初級の高めの点は、近い実力として扱われる
  assert.ok(Math.abs(perf(60, '上級') - perf(85, '初級')) <= 8);
  // 0点・100点でも計算できる
  assert.ok(Number.isFinite(Game.performance(0, '上級')) && Number.isFinite(Game.performance(100, '初級')));
});

test('実力: 推移は換算値をならし、再挑戦の反映は小さい', () => {
  const lv = (l) => Data.episodes.filter((e) => e.level === l);
  const [m1, m2] = lv('中級');
  const fresh = Game.skillLog([play(m1.id, 50), play(m2.id, 90)]);
  const retry = Game.skillLog([play(m1.id, 50), play(m1.id, 90)]);
  assert.equal(fresh[0].skill, 50);
  assert.equal(fresh[0].delta, null);
  assert.ok(retry[1].retry && !fresh[1].retry);
  assert.ok(fresh[1].skill - 50 > (retry[1].skill - 50) * 2, '初見の結果ほど大きく動く');
  // 上級で点が下がっても、実力換算が同じなら実力は下がらない
  const h = Game.skillNow([play(m1.id, 70), play(lv('上級')[0].id, Math.round(Game.expectedScore(Game.performance(70, '中級'), '上級')))]);
  assert.ok(Math.abs(h.skill - 70) <= 1);
  assert.ok(h.expected.初級 > h.expected.中級 && h.expected.中級 > h.expected.上級);
  assert.equal(Game.skillNow([]), null);
});
