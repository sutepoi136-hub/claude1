/* 議事録クエスト — 効果音(Web Audio で合成。音声ファイルは使わない) */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});
  const AC = root.AudioContext || root.webkitAudioContext;
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 音をひとつ鳴らす: f=周波数, t=開始(秒後), d=長さ, type=波形, v=音量
  function tone(c, f, t, d, type = 'sine', v = 0.12) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, c.currentTime + t);
    g.gain.setValueAtTime(0.0001, c.currentTime + t);
    g.gain.exponentialRampToValueAtTime(v, c.currentTime + t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t + d);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + t);
    o.stop(c.currentTime + t + d + 0.05);
  }

  function noise(c, t, d, v = 0.15) {
    const len = Math.floor(c.sampleRate * d);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource();
    const g = c.createGain();
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 900;
    g.gain.value = v;
    s.buffer = buf;
    s.connect(fl).connect(g).connect(c.destination);
    s.start(c.currentTime + t);
  }

  const N = { C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, E6: 1319, G4: 392, C4: 262, E4: 330, A4: 440 };
  const SOUNDS = {
    click: (c) => tone(c, 1400, 0, 0.04, 'triangle', 0.05),
    start: (c) => [N.C5, N.E5, N.G5].forEach((f, i) => tone(c, f, i * 0.09, 0.22, 'sine', 0.1)),
    end: (c) => [N.G5, N.E5, N.C5].forEach((f, i) => tone(c, f, i * 0.1, 0.25, 'sine', 0.09)),
    join: (c) => { tone(c, N.E5, 0, 0.14, 'sine', 0.1); tone(c, N.A5, 0.12, 0.22, 'sine', 0.1); },
    leave: (c) => { tone(c, N.A5, 0, 0.14, 'sine', 0.09); tone(c, N.E5, 0.12, 0.22, 'sine', 0.09); },
    door: (c) => { noise(c, 0, 0.35, 0.12); tone(c, 110, 0, 0.3, 'triangle', 0.08); },
    stamp: (c) => { noise(c, 0, 0.12, 0.25); tone(c, 140, 0, 0.18, 'triangle', 0.16); },
    good: (c) => [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(c, f, i * 0.08, 0.3, 'triangle', 0.09)),
    meh: (c) => [N.E5, N.C5].forEach((f, i) => tone(c, f, i * 0.12, 0.3, 'triangle', 0.08)),
    levelup: (c) => [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) => tone(c, f, i * 0.09, i === 4 ? 0.6 : 0.2, 'square', 0.05)),
    badge: (c) => [N.A5, N.C6, N.E6].forEach((f, i) => tone(c, f, i * 0.07, 0.25, 'sine', 0.07)),
    unlock: (c) => { noise(c, 0, 0.25, 0.05); [N.G4, N.C5, N.E5, N.G5].forEach((f, i) => tone(c, f, 0.1 + i * 0.07, 0.3, 'sine', 0.08)); },
    page: (c) => noise(c, 0, 0.2, 0.06),
  };

  GQ.Sfx = {
    play(name) {
      if (!enabled || !SOUNDS[name]) return;
      const c = ac();
      if (!c) return;
      try { SOUNDS[name](c); } catch (e) { /* 鳴らせなくても続行 */ }
    },
    setEnabled(v) { enabled = !!v; },
    get enabled() { return enabled; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
