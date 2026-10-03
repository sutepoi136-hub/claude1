/* 議事録クエスト — 音の土台(Web Audio)。BGM・環境音・効果音が共有する。
 * 音声ファイルは使わず、すべてその場で合成する(file:// で開いても鳴り、著作権の心配もない)。
 * ブラウザは「最初の操作」があるまで音を出せないので、クリックやキー入力を待ってから鳴らし始める。 */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});
  const AC = root.AudioContext || root.webkitAudioContext;
  let live = null; // 画面で使う本番のグラフ({ c, bus, verb })
  let unlocked = false;
  const waiters = [];
  // 音量(0〜1)。画面の設定から setVolumes で変える
  const vol = { bgm: 0.5, sfx: 0.7, amb: true, muted: false };
  // 各バスの基準の大きさ(ミックスの比率。設定の音量はこれに掛ける)
  const BASE = { bgm: 2.1, amb: 0.14, sfx: 1.7 };

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------------------------------------------------------------- グラフ(コンテキストごとに作る。テストでは OfflineAudioContext にも作れる)
  function impulse(c, sec, decay) {
    const len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        // 高い音ほど早く消えるよう、なめらかにしたノイズを混ぜる
        lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
        const k = i / len;
        d[i] = (k < 0.5 ? (Math.random() * 2 - 1) * (1 - k * 2) * 0.5 + lp * 0.5 : lp) * Math.pow(1 - k, decay);
      }
    }
    return buf;
  }
  const noiseCache = new WeakMap();
  function noiseBuf(c, kind = 'white') {
    let m = noiseCache.get(c);
    if (!m) { m = {}; noiseCache.set(c, m); }
    if (m[kind]) return m[kind];
    const len = c.sampleRate * 3;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    m[kind] = buf;
    return buf;
  }
  function build(c, dest) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    const master = c.createGain();
    master.connect(comp).connect(dest || c.destination);
    const bus = {};
    ['bgm', 'amb', 'sfx'].forEach((k) => { bus[k] = c.createGain(); bus[k].connect(master); });
    // 残響: BGM用(長め)と効果音用(短め)
    const verb = {};
    [['bgm', 2.8, 2.6], ['sfx', 1.6, 3]].forEach(([k, sec, decay]) => {
      const cv = c.createConvolver();
      cv.buffer = impulse(c, sec, decay);
      const g = c.createGain();
      g.gain.value = 0.8;
      cv.connect(g).connect(bus[k]);
      verb[k] = cv;
    });
    return { c, master, bus, verb };
  }

  // ---------------------------------------------------------------- 本番のコンテキスト
  function applyVolumes() {
    if (!live) return;
    const { c, bus } = live;
    const t = c.currentTime;
    const m = vol.muted ? 0 : 1;
    bus.bgm.gain.setTargetAtTime(BASE.bgm * vol.bgm * vol.bgm * m, t, 0.08);
    bus.sfx.gain.setTargetAtTime(BASE.sfx * vol.sfx * vol.sfx * m, t, 0.03);
    bus.amb.gain.setTargetAtTime(BASE.amb * (vol.amb ? 1 : 0) * m, t, 0.2);
  }
  function ensure() {
    if (live || !AC) return live;
    try {
      let c;
      try { c = new AC({ latencyHint: 'playback' }); } catch (e) { c = new AC(); }
      live = build(c);
      ['bgm', 'amb', 'sfx'].forEach((k) => { live.bus[k].gain.value = 0; });
      applyVolumes();
    } catch (e) { live = null; }
    return live;
  }
  function unlock() {
    if (!AC) return;
    const g = ensure();
    if (!g) return;
    if (g.c.state === 'suspended' && !document.hidden) g.c.resume();
    if (!unlocked) {
      unlocked = true;
      waiters.splice(0).forEach((fn) => { try { fn(live); } catch (e) { /* 続行 */ } });
    }
  }
  // 音が出せる状態になったら呼ぶ(すでに出せるならすぐ)
  function whenReady(fn) {
    if (unlocked && live) fn(live); else waiters.push(fn);
  }
  if (root.document && AC) {
    const opts = { capture: true, passive: true };
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => root.document.addEventListener(ev, unlock, opts));
    // タブを隠したら止め、戻ったら再開する(電池と、ほかのタブへの配慮)
    root.document.addEventListener('visibilitychange', () => {
      if (!live || !unlocked) return;
      if (root.document.hidden) live.c.suspend(); else live.c.resume();
    });
  }

  // ---------------------------------------------------------------- 楽器(どれも c=コンテキスト, D={dry, wet}=出力先, t=開始時刻)
  // wet は残響へ送る。send=送る量
  function out(c, node, D, send) {
    node.connect(D.dry);
    if (send && D.wet) { const s = c.createGain(); s.gain.value = send; node.connect(s).connect(D.wet); }
  }
  function osc(c, type, f, t, end) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    o.stop(end);
    return o;
  }
  // 打楽器型の音量カーブ(すぐ立ち上がり、指数で消える)
  function perc(c, t, peak, decay, a = 0.004) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
    return g;
  }
  // 持続型の音量カーブ(a で立ち上がり、len まで保ち、r で消える)
  function sus(c, t, peak, a, len, r) {
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, len));
    g.gain.linearRampToValueAtTime(0, t + Math.max(a, len) + r);
    return g;
  }
  function filt(c, type, f, q = 0.7) {
    const b = c.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  function noise(c, t, len, kind = 'white') {
    const s = c.createBufferSource();
    s.buffer = noiseBuf(c, kind);
    const off = Math.random() * 2;
    s.start(t, off, len);
    return s;
  }

  const I = {
    // フェルトピアノ風: やわらかい打鍵と長い余韻
    piano(c, D, t, m, v = 0.12, len = 2.6, send = 0.4) {
      const f = mtof(m);
      const lp = filt(c, 'lowpass', Math.min(5000, f * 7), 0.2);
      lp.frequency.setValueAtTime(Math.min(5000, f * 7), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(250, f * 1.6), t + len * 0.8);
      const g = perc(c, t, v, len, 0.008);
      const end = t + len + 0.1;
      osc(c, 'triangle', f, t, end).connect(lp);
      const o2 = osc(c, 'sine', f * 2.003, t, end);
      const g2 = c.createGain(); g2.gain.value = 0.25;
      o2.connect(g2).connect(lp);
      lp.connect(g);
      out(c, g, D, send);
    },
    // エレクトリックピアノ(FM合成): ローファイの和音に使う
    ep(c, D, t, m, v = 0.07, len = 1.8, send = 0.25, bright = 1) {
      const f = mtof(m);
      const end = t + len + 0.1;
      const car = osc(c, 'sine', f, t, end);
      const mod = osc(c, 'sine', f, t, end);
      const mg = c.createGain();
      mg.gain.setValueAtTime(f * 1.4 * bright, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.12 * bright + 1, t + 0.6);
      mod.connect(mg).connect(car.frequency);
      const g = perc(c, t, v, len, 0.006);
      car.connect(g);
      // 金属的な「チン」という立ち上がり
      const tine = osc(c, 'sine', f * 4.01, t, t + 0.3);
      const tg = perc(c, t, v * 0.12 * bright, 0.18, 0.002);
      tine.connect(tg).connect(g);
      out(c, g, D, send);
    },
    // ゆっくり鳴る和音(ストリングス・合唱・パッド)
    pad(c, D, t, ms, len, o = {}) {
      const { v = 0.03, type = 'sawtooth', cut = 900, a = 1.2, r = 1.6, det = 8, send = 0.5 } = o;
      const lp = filt(c, 'lowpass', cut, 0.4);
      const g = sus(c, t, v * 1.6, a, len, r);
      lp.connect(g);
      const end = t + len + r + 0.1;
      // 軽くするため1音1発振器。隣り合う音を互い違いにずらして、広がりを出す
      ms.forEach((m, i) => { const x = osc(c, type, mtof(m), t, end); x.detune.value = i % 2 ? det : -det; x.connect(lp); });
      out(c, g, D, send);
    },
    // ベース(サイン+三角波。小さなスピーカーでも聞こえるよう倍音を少し足す)
    bass(c, D, t, m, len, v = 0.16, cut = 520) {
      const f = mtof(m);
      const lp = filt(c, 'lowpass', cut, 0.5);
      const g = sus(c, t, v, 0.012, len * 0.85, 0.12);
      const end = t + len + 0.2;
      osc(c, 'sine', f, t, end).connect(lp);
      const tri = osc(c, 'triangle', f * 2, t, end);
      const tg = c.createGain(); tg.gain.value = 0.35;
      tri.connect(tg).connect(lp);
      lp.connect(g);
      out(c, g, D, 0);
    },
    // ハープ(はじく音)
    harp(c, D, t, m, v = 0.07, len = 1.8, send = 0.5) {
      const f = mtof(m);
      const lp = filt(c, 'lowpass', f * 9, 0.6);
      lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.8), t + 0.35);
      const g = perc(c, t, v, len, 0.003);
      const s = osc(c, 'sawtooth', f, t, t + len + 0.1);
      const sg = c.createGain(); sg.gain.value = 0.75;
      s.connect(sg).connect(lp);
      lp.connect(g);
      out(c, g, D, send);
    },
    // ホルン(金管): 冒険の主旋律
    horn(c, D, t, m, len, v = 0.05, send = 0.55) {
      const f = mtof(m);
      const end = t + len + 0.6;
      const lp = filt(c, 'lowpass', 300, 1.1);
      lp.frequency.setValueAtTime(260, t);
      lp.frequency.linearRampToValueAtTime(Math.min(2600, f * 3.2), t + 0.12);
      lp.frequency.linearRampToValueAtTime(Math.min(2000, f * 2.2), t + 0.5);
      const g = sus(c, t, v, 0.09, len, 0.35);
      const vib = osc(c, 'sine', 5.2, t, end);
      const vg = c.createGain();
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(f * 0.005, t + 0.5);
      vib.connect(vg);
      [-6, 5].forEach((d) => { const x = osc(c, 'sawtooth', f, t, end); x.detune.value = d; vg.connect(x.frequency); x.connect(lp); });
      lp.connect(g);
      out(c, g, D, send);
    },
    // 低弦の刻み(短い音)
    cello(c, D, t, m, len = 0.3, v = 0.05, send = 0.3) {
      const f = mtof(m);
      const lp = filt(c, 'lowpass', 1000, 0.6);
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + len);
      const g = sus(c, t, v * 1.5, 0.015, len * 0.6, len * 0.5);
      const end = t + len + 0.2;
      osc(c, 'sawtooth', f, t, end).connect(lp);
      lp.connect(g);
      out(c, g, D, send);
    },
    // 鐘(倍音がずれた金属音)
    bell(c, D, t, m, v = 0.08, len = 4, send = 0.6) {
      const f = mtof(m);
      [[0.5, 0.5, 1.2], [1, 1, 1], [2.0, 0.35, 0.6], [2.76, 0.4, 0.45], [5.4, 0.18, 0.25], [8.93, 0.08, 0.12]].forEach(([k, a, d]) => {
        const g = perc(c, t, v * a, len * d, 0.002);
        osc(c, 'sine', f * k, t, t + len * d + 0.1).connect(g);
        out(c, g, D, send);
      });
    },
    // マリンバ(オンライン会議の通知音など)
    marimba(c, D, t, m, v = 0.1, len = 0.6, send = 0.2) {
      const f = mtof(m);
      const g = perc(c, t, v, len, 0.003);
      osc(c, 'sine', f, t, t + len + 0.1).connect(g);
      const h = perc(c, t, v * 0.25, len * 0.2, 0.002);
      osc(c, 'sine', f * 3.9, t, t + len * 0.2 + 0.1).connect(h);
      out(c, g, D, send);
      out(c, h, D, send);
    },
    // 太鼓(ティンパニ・陣太鼓)
    drum(c, D, t, m = 38, v = 0.3, len = 0.9, send = 0.4) {
      const f = mtof(m);
      const o = osc(c, 'sine', f * 1.5, t, t + len + 0.1);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      const g = perc(c, t, v, len, 0.003);
      o.connect(g);
      out(c, g, D, send);
      const n = noise(c, t, 0.2);
      const lp = filt(c, 'lowpass', 320, 0.6);
      const ng = perc(c, t, v * 0.5, 0.12, 0.002);
      n.connect(lp).connect(ng);
      out(c, ng, D, send);
    },
    // 小太鼓・フレームドラム(高めの軽い打音)
    tom(c, D, t, v = 0.08, f = 180, send = 0.35) {
      const o = osc(c, 'sine', f * 1.4, t, t + 0.3);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      const g = perc(c, t, v, 0.22, 0.002);
      o.connect(g);
      out(c, g, D, send);
      const n = noise(c, t, 0.1);
      const bp = filt(c, 'bandpass', 900, 0.8);
      const ng = perc(c, t, v * 0.6, 0.06, 0.002);
      n.connect(bp).connect(ng);
      out(c, ng, D, send);
    },
    // ローファイのドラム
    kick(c, D, t, v = 0.32) {
      const o = osc(c, 'sine', 120, t, t + 0.45);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
      const g = perc(c, t, v, 0.34, 0.003);
      o.connect(g);
      out(c, g, D, 0);
    },
    snare(c, D, t, v = 0.11) {
      const n = noise(c, t, 0.3);
      const bp = filt(c, 'bandpass', 1700, 0.7);
      const lp = filt(c, 'lowpass', 3800, 0.5);
      const g = perc(c, t, v, 0.16, 0.002);
      n.connect(bp).connect(lp).connect(g);
      out(c, g, D, 0.2);
      const o = osc(c, 'triangle', 190, t, t + 0.12);
      const og = perc(c, t, v * 0.5, 0.07, 0.002);
      o.connect(og);
      out(c, og, D, 0);
    },
    hat(c, D, t, v = 0.03, len = 0.035) {
      const n = noise(c, t, len + 0.05);
      const hp = filt(c, 'highpass', 7000, 0.6);
      const g = perc(c, t, v, len, 0.001);
      n.connect(hp).connect(g);
      out(c, g, D, 0);
    },
    // レコードのプチプチ(ローファイの質感)
    crackle(c, D, t, v = 0.012) {
      const n = noise(c, t, 0.004);
      const hp = filt(c, 'highpass', 2200, 0.5);
      const g = perc(c, t, v, 0.003, 0.0005);
      n.connect(hp).connect(g);
      out(c, g, D, 0);
    },
    // ノイズの一吹き(紙・風・火の粉など)。type/f/q でフィルター、a/len で形を決める
    breath(c, D, t, o = {}) {
      const { v = 0.05, type = 'bandpass', f = 2000, f2 = null, q = 0.8, a = 0.01, len = 0.15, kind = 'white', send = 0 } = o;
      const n = noise(c, t, a + len + 0.05, kind);
      const b = filt(c, type, f, q);
      if (f2) { b.frequency.setValueAtTime(f, t); b.frequency.exponentialRampToValueAtTime(f2, t + a + len); }
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + len);
      n.connect(b).connect(g);
      out(c, g, D, send);
    },
  };

  GQ.Audio = {
    supported: !!AC,
    mtof,
    I,
    build,
    noiseBuf,
    whenReady,
    unlock,
    get ready() { return unlocked && !!live; },
    get live() { return live; },
    setVolumes(v) {
      if (!v) return;
      if (v.bgm != null) vol.bgm = Math.max(0, Math.min(1, v.bgm));
      if (v.sfx != null) vol.sfx = Math.max(0, Math.min(1, v.sfx));
      if (v.amb != null) vol.amb = !!v.amb;
      if (v.muted != null) vol.muted = !!v.muted;
      applyVolumes();
    },
    get volumes() { return { ...vol }; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
