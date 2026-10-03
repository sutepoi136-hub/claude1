// BGM・効果音: 音の出ない環境(Node)でも読み込めること、曲のデータに抜けがないこと
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { GQ, scripts, ROOT } = require('./load');

for (const f of ['js/ui/audio.js', 'js/ui/sfx.js', 'js/ui/bgm.js']) require(path.join(ROOT, f));
const { Audio, Sfx, Bgm } = GQ;

test('音: index.html で audio → sfx → bgm → app の順に読み込む', () => {
  const at = (f) => scripts.indexOf(f);
  assert.ok(at('js/ui/audio.js') >= 0);
  assert.ok(at('js/ui/audio.js') < at('js/ui/sfx.js'));
  assert.ok(at('js/ui/sfx.js') < at('js/ui/bgm.js'));
  assert.ok(at('js/ui/bgm.js') < at('js/ui/app.js'));
});

test('音: Web Audio がなくても、呼び出しは何もせずに終わる', () => {
  assert.equal(Audio.supported, false);
  assert.equal(Audio.ready, false);
  Audio.setVolumes({ bgm: 2, sfx: -1, amb: false, muted: true });
  assert.deepEqual(Audio.volumes, { bgm: 1, sfx: 0, amb: false, muted: true });
  Sfx.play('stamp');
  Sfx.play('good', 'maou');
  Bgm.play('maou');
  Bgm.ambience('work');
  assert.equal(Bgm.current, null);
  assert.equal(Bgm.wanted, 'maou');
  Bgm.play(null);
  Bgm.ambience(null);
});

test('音: 画面で使う効果音が、両方の物語でそろっている', () => {
  for (const name of ['tick', 'page', 'pen', 'stamp', 'open', 'levelup', 'badge', 'unlock']) assert.ok(Sfx.resolve(name), name);
  for (const name of ['start', 'end', 'join', 'leave', 'good', 'great', 'meh']) {
    for (const theme of ['work', 'maou']) assert.ok(Sfx.resolve(name, theme), `${name}.${theme}`);
  }
  assert.notEqual(Sfx.resolve('good', 'work'), Sfx.resolve('good', 'maou'));
});

test('音: 物語と章に合った曲を選ぶ', () => {
  assert.equal(Bgm.trackFor('work', { chapter: 3 }), 'work');
  assert.equal(Bgm.trackFor('maou', { chapter: 1 }), 'maou');
  assert.equal(Bgm.trackFor('maou', { chapter: 3 }), 'maou3');
  assert.equal(Bgm.trackFor('maou'), 'maou');
  assert.equal(Bgm.trackFor('home'), 'home');
  for (const ep of GQ.Data.episodes) assert.ok(Bgm.TRACKS[Bgm.trackFor(ep.series, ep)], ep.id);
});

test('音: 曲の和音・旋律のデータに抜けがない', () => {
  const T = Bgm.TRACKS;
  for (const id of ['home', 'work']) {
    const t = T[id];
    assert.equal(t.chords.length, t.roots.length, id);
    assert.equal(t.mel.length, t.chords.length, id);
    t.mel.flat().forEach(([m, s, l]) => { assert.ok(m >= 55 && m <= 84, `${id} ${m}`); assert.ok(s >= 0 && s + l <= t.beats + 1e-9, `${id} ${s}+${l}`); });
  }
  for (const id of ['maou', 'maou3']) {
    const t = T[id];
    for (const name of t.prog) { assert.ok(T.maou.V[name], `${id} ${name}`); assert.ok(T.maou.R[name] != null, `${id} ${name}`); }
    Object.values(t.mel).flat().forEach(([m, s, l]) => assert.ok(s >= 0 && s + l <= t.beats + 1e-9, `${id} ${s}+${l}`));
  }
});
