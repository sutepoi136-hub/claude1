/* 議事録クエスト — 効果音(Web Audio で合成。音声ファイルは使わない)
 * 共通の操作音は「紙と印」(紙をめくる・ペンが走る・朱印を押す)でそろえ、
 * 会議の出入りと結果のファンファーレだけ物語ごとに変える(仕事編=オンライン会議の通知音、魔王軍編=扉・鐘・金管)。 */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});
  const A = GQ.Audio;
  const I = A.I;

  const arp = (c, D, t, inst, notes, gap, ...args) => notes.forEach((m, i) => I[inst](c, D, t + i * gap, m, ...args));

  // 名前.物語 があればそれを、なければ 名前 を鳴らす
  const SOUNDS = {
    // ---- 紙と印(共通)
    tick: (c, D, t) => { I.breath(c, D, t, { type: 'bandpass', f: 2600, q: 1.4, a: 0.001, len: 0.025, v: 0.16 }); I.marimba(c, D, t, 96, 0.008, 0.08, 0); },
    page: (c, D, t) => {
      I.breath(c, D, t, { type: 'bandpass', f: 900, f2: 3600, q: 0.7, a: 0.06, len: 0.2, v: 0.14 });
      I.breath(c, D, t + 0.2, { type: 'bandpass', f: 2400, q: 0.9, a: 0.004, len: 0.07, v: 0.08 });
    },
    pen: (c, D, t) => {
      for (let i = 0; i < 5; i++) I.breath(c, D, t + i * 0.075 + Math.random() * 0.02, { type: 'bandpass', f: 3200 + Math.random() * 1800, q: 2.2, a: 0.012, len: 0.045 + Math.random() * 0.04, v: 0.1 });
    },
    stamp: (c, D, t) => {
      I.breath(c, D, t, { type: 'lowpass', f: 420, q: 0.7, a: 0.002, len: 0.11, v: 0.9, kind: 'brown', send: 0.15 });
      I.drum(c, D, t, 31, 0.5, 0.22, 0.1);
      I.breath(c, D, t, { type: 'highpass', f: 3500, q: 0.6, a: 0.001, len: 0.03, v: 0.07 });
    },
    open: (c, D, t) => {
      SOUNDS.page(c, D, t);
      arp(c, D, t + 0.18, 'piano', [60, 64, 67, 72], 0.06, 0.07, 2.4, 0.5);
    },

    // ---- 会議の開始・終了・出入り
    'start.work': (c, D, t) => arp(c, D, t, 'marimba', [67, 72, 76], 0.09, 0.17, 0.7),
    'end.work': (c, D, t) => arp(c, D, t, 'marimba', [76, 72, 67], 0.1, 0.16, 0.8),
    'join.work': (c, D, t) => arp(c, D, t, 'marimba', [72, 79], 0.11, 0.16, 0.6),
    'leave.work': (c, D, t) => arp(c, D, t, 'marimba', [79, 72], 0.11, 0.15, 0.6),
    'start.maou': (c, D, t) => { I.bell(c, D, t, 50, 0.09, 5); I.drum(c, D, t, 38, 0.22, 1.2); },
    'end.maou': (c, D, t) => { I.bell(c, D, t, 57, 0.08, 4); arp(c, D, t + 0.15, 'harp', [74, 69, 65, 62], 0.11, 0.07, 1.8); },
    'door.maou': (c, D, t) => {
      // きしみ(低いのこぎり波を揺らして、狭い帯域で鳴らす)→ 閉まる音
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(62, t);
      o.frequency.linearRampToValueAtTime(48, t + 0.42);
      const lfo = c.createOscillator();
      lfo.frequency.value = 11;
      const lg = c.createGain();
      lg.gain.value = 9;
      lfo.connect(lg).connect(o.frequency);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      bp.Q.value = 5;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.08);
      g.gain.linearRampToValueAtTime(0, t + 0.45);
      o.connect(bp).connect(g).connect(D.dry);
      [o, lfo].forEach((x) => { x.start(t); x.stop(t + 0.5); });
      I.drum(c, D, t + 0.42, 31, 0.28, 0.45, 0.5);
      I.breath(c, D, t + 0.42, { type: 'lowpass', f: 260, a: 0.003, len: 0.18, v: 0.3, kind: 'brown', send: 0.4 });
    },
    'join.maou': (c, D, t) => SOUNDS['door.maou'](c, D, t),
    'leave.maou': (c, D, t) => SOUNDS['door.maou'](c, D, t),

    // ---- 結果
    // 仕事編: さわやかな上昇音 / 魔王軍編: 金管のファンファーレ(短調の物語が、最後だけ長調に開く)
    'good.work': (c, D, t) => {
      arp(c, D, t, 'marimba', [72, 76, 79, 83, 86], 0.07, 0.08, 0.7);
      [60, 64, 67, 71, 74].forEach((m) => I.ep(c, D, t + 0.38, m, 0.045, 2.2, 0.35));
      I.bell(c, D, t + 0.38, 96, 0.025, 2);
    },
    'great.work': (c, D, t) => {
      arp(c, D, t, 'marimba', [72, 76, 79, 83, 84, 88, 91], 0.06, 0.08, 0.7);
      [48, 60, 64, 67, 71, 74].forEach((m) => I.ep(c, D, t + 0.45, m, 0.05, 2.8, 0.4));
      I.pad(c, D, t + 0.45, [64, 67, 71, 74], 1.2, { v: 0.02, type: 'triangle', cut: 2400, a: 0.3, r: 1.8 });
      [96, 100, 103].forEach((m, i) => I.bell(c, D, t + 0.6 + i * 0.16, m, 0.025, 2));
    },
    'good.maou': (c, D, t) => {
      I.drum(c, D, t, 38, 0.2, 0.8);
      I.horn(c, D, t, 62, 0.16, 0.04);
      I.horn(c, D, t + 0.2, 69, 0.16, 0.04);
      [62, 66, 69, 74].forEach((m) => I.horn(c, D, t + 0.4, m, 1.1, 0.026));
      I.drum(c, D, t + 0.4, 38, 0.24, 1.2);
      arp(c, D, t + 0.4, 'harp', [62, 66, 69, 74, 78, 81, 86], 0.045, 0.05, 1.6);
    },
    'great.maou': (c, D, t) => {
      for (let i = 0; i < 8; i++) I.drum(c, D, t + i * 0.1, 38, 0.08 + i * 0.03, 0.4, 0.3);
      I.breath(c, D, t, { type: 'highpass', f: 5000, q: 0.5, a: 0.8, len: 1.6, v: 0.05, send: 0.6 });
      [0, 0.13, 0.26].forEach((d) => I.horn(c, D, t + d, 62, 0.09, 0.036));
      I.horn(c, D, t + 0.4, 69, 0.36, 0.04);
      [50, 57, 62, 66, 69, 74].forEach((m) => I.horn(c, D, t + 0.8, m, 1.8, 0.022));
      I.drum(c, D, t + 0.8, 38, 0.3, 1.6);
      I.bell(c, D, t + 0.8, 74, 0.06, 4);
      arp(c, D, t + 0.8, 'harp', [62, 66, 69, 74, 78, 81, 86, 90], 0.04, 0.05, 1.8);
    },
    // 合格に届かなかった: 責めない、静かな2音
    'meh.work': (c, D, t) => { I.piano(c, D, t, 67, 0.08, 2); I.piano(c, D, t + 0.2, 64, 0.08, 2.4); I.piano(c, D, t + 0.2, 57, 0.05, 2.4); },
    'meh.maou': (c, D, t) => { arp(c, D, t, 'harp', [69, 65, 62], 0.16, 0.07, 2); I.pad(c, D, t, [50, 57], 0.6, { v: 0.025, cut: 700, a: 0.2, r: 1.4 }); },
    meh: (c, D, t) => SOUNDS['meh.work'](c, D, t),
    good: (c, D, t) => SOUNDS['good.work'](c, D, t),
    great: (c, D, t) => SOUNDS['great.work'](c, D, t),

    // ---- ごほうび(共通)
    levelup: (c, D, t) => {
      arp(c, D, t, 'harp', [60, 64, 67, 72, 76, 79, 84], 0.05, 0.07, 1.8);
      I.bell(c, D, t + 0.38, 84, 0.04, 3);
      I.pad(c, D, t + 0.35, [60, 64, 67, 72], 0.8, { v: 0.022, type: 'triangle', cut: 2000, a: 0.2, r: 1.6 });
    },
    badge: (c, D, t) => { arp(c, D, t, 'marimba', [88, 91, 96], 0.08, 0.1, 0.5); I.bell(c, D, t + 0.16, 84, 0.035, 2); },
    unlock: (c, D, t) => {
      I.breath(c, D, t, { type: 'highpass', f: 3000, a: 0.001, len: 0.02, v: 0.08 });
      I.breath(c, D, t + 0.07, { type: 'highpass', f: 2200, a: 0.001, len: 0.03, v: 0.1 });
      arp(c, D, t + 0.18, 'harp', [67, 72, 76, 79], 0.07, 0.07, 1.6);
    },
  };

  function resolve(name, theme) {
    return (theme && SOUNDS[name + '.' + theme]) || SOUNDS[name] || SOUNDS[name + '.work'] || null;
  }

  GQ.Sfx = {
    names: Object.keys(SOUNDS),
    resolve,
    // name の音を鳴らす。theme('work' / 'maou')で物語ごとの音に変わる
    play(name, theme) {
      const fn = resolve(name, theme);
      if (!fn || !A.ready) return;
      const v = A.volumes;
      if (v.muted || v.sfx <= 0) return;
      const { c, bus, verb } = A.live;
      if (c.state !== 'running') return;
      try { fn(c, { dry: bus.sfx, wet: verb.sfx }, c.currentTime + 0.01); } catch (e) { /* 鳴らせなくても続行 */ }
    },
    // テスト用: 任意のコンテキストに鳴らす
    renderTo(c, D, name, theme, t = 0) { const fn = resolve(name, theme); if (fn) fn(c, D, t); },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
