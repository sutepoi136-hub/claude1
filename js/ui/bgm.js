/* 議事録クエスト — BGMと会議中の環境音(Web Audio でその場で演奏する。音声ファイルは使わない)
 *
 * 曲(どれも小節ごとに少しずつ揺らぎ、ループしても単調にならないようにしている)
 *   home  … 書斎。フェルトピアノとやわらかい和音。ホーム画面
 *   work  … 夕方のオフィス。エレピとローファイのリズム。仕事編
 *   maou  … 低く響く弦と、ハープ・金管・太鼓の 6/8 拍子。暗いが前へ進む冒険の曲。魔王軍編
 *   maou3 … 最終章(和平)。刻み続ける低弦と陣太鼓で緊張感を出し、最後に長調へ開く
 * 会議中は曲を止め、部屋の環境音だけを小さく流す(仕事編=空調とタイピング、魔王軍編=暖炉と風)。 */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});
  const A = GQ.Audio;
  const I = A.I;

  // 小節ごとに決まる乱数(同じ小節は毎回同じ揺らぎになる)
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let x = s;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- 曲
  // play(c, D, n, t, b, r): n=通しの小節番号, t=小節の頭の時刻, b=1拍の秒数, r=乱数
  const TRACKS = {
    home: {
      title: '書斎',
      bpm: 64,
      beats: 4,
      // Fmaj7 | Em7 | Dm7 | Cmaj9 | B♭maj7 | Am7 | Gm7 | C7
      chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [52, 55, 59, 62], [53, 57, 58, 62], [52, 55, 57, 60], [50, 53, 55, 58], [52, 55, 58, 60]],
      roots: [41, 40, 38, 36, 46, 45, 43, 36],
      mel: [
        [[69, 0, 2], [72, 2, 1], [67, 3, 1]],
        [[67, 0, 1.5], [71, 1.5, 1], [74, 2.5, 1.5]],
        [[72, 0, 2], [69, 2, 1], [65, 3, 1]],
        [[64, 0, 3], [67, 3, 1]],
        [[65, 0, 1], [69, 1, 1], [74, 2, 2]],
        [[72, 0, 1.5], [76, 1.5, 1.5], [67, 3, 1]],
        [[65, 0, 1], [70, 1, 1], [69, 2, 1], [67, 3, 1]],
        [[64, 0, 4]],
      ],
      play(c, D, n, t, b, r) {
        const i = n % 8;
        const withMelody = Math.floor(n / 8) % 2 === 0;
        const ch = this.chords[i];
        I.pad(c, D, t, ch, 4 * b, { v: 0.03, type: 'triangle', cut: 1300, a: 1.4, r: 2.2, det: 6, send: 0.6 });
        I.piano(c, D, t, this.roots[i] + 12, 0.1, 3.6, 0.4);
        if (r() < 0.7) I.piano(c, D, t + 2 * b, this.roots[i] + 19, 0.065, 2.6, 0.4);
        if (withMelody) {
          this.mel[i].forEach(([m, s, l]) => I.piano(c, D, t + s * b + r() * 0.02, m, 0.11 + r() * 0.02, Math.max(1.8, l * b * 1.2), 0.5));
        } else {
          // 旋律のない半分は、和音を分散してつなぐ
          [0, 1, 1.5, 2.5, 3].forEach((s, j) => {
            if (j > 0 && r() < 0.3) return;
            I.piano(c, D, t + s * b, ch[(j + (n % 2)) % ch.length] + 12, 0.065 + r() * 0.03, 2.4, 0.5);
          });
        }
      },
    },

    work: {
      title: '夕方のオフィス',
      bpm: 78,
      beats: 4,
      swing: 0.58,
      // Cmaj9 | Bm9 | Am9 | D9sus4 | Cmaj9 | Bm9 → E7(♭9) | Am9 | D7
      chords: [[52, 55, 59, 62], [50, 54, 57, 61], [55, 59, 60, 64], [55, 57, 60, 64], [52, 55, 59, 62], [50, 54, 57, 61], [55, 59, 60, 64], [54, 57, 60, 64]],
      half: { 5: [56, 59, 62, 65] },
      roots: [36, 35, 33, 38, 36, 35, 33, 38],
      halfRoot: { 5: 40 },
      mel: [
        [[71, 0.5, 0.5], [74, 1, 1], [76, 2.5, 1]],
        [[74, 0, 1.5], [71, 1.5, 0.5], [69, 2, 2]],
        [[67, 0.5, 0.5], [69, 1, 0.5], [71, 1.5, 0.5], [76, 2, 1.5]],
        [[74, 0, 3]],
        [[76, 0.5, 0.5], [79, 1, 1], [78, 2.5, 0.5], [76, 3, 1]],
        [[74, 0, 1], [71, 1, 1], [68, 2, 1], [71, 3, 1]],
        [[72, 0, 1.5], [71, 1.5, 0.5], [69, 2, 0.5], [67, 2.5, 1.5]],
        [[66, 0, 1], [69, 1, 1], [72, 2, 2]],
      ],
      play(c, D, n, t, b, r) {
        const i = n % 8;
        const withMelody = Math.floor(n / 8) % 2 === 1;
        const at = (pos) => { const w = Math.floor(pos); const f = pos - w; return t + (w + (Math.abs(f - 0.5) < 1e-6 ? this.swing : f)) * b; };
        // エレピの和音(少しずらして弾く)
        const comp = n % 2 === 0 ? [[0, 1.6], [2.5, 1.2]] : [[0, 1.4], [1.5, 0.5], [3, 0.9]];
        comp.forEach(([s, l]) => {
          const ch = s >= 2 && this.half[i] ? this.half[i] : this.chords[i];
          ch.forEach((m, j) => I.ep(c, D, at(s) + j * 0.012 + r() * 0.006, m, 0.028 + r() * 0.008, l * b + 0.3, 0.25, 0.8));
        });
        // ベース
        const root = this.roots[i];
        const r2 = this.halfRoot[i] != null ? this.halfRoot[i] : root + 7;
        I.bass(c, D, t, root, 1.4 * b, 0.15);
        I.bass(c, D, at(2.5), r2, 0.5 * b, 0.11);
        if (r() < 0.4) I.bass(c, D, at(3.5), root + 12, 0.35 * b, 0.07);
        // ドラム(最初の2小節は和音だけで始める)
        if (n >= 2) {
          I.kick(c, D, t, 0.28);
          I.kick(c, D, at(2.5), 0.2);
          if (r() < 0.3) I.kick(c, D, at(1.5), 0.12);
          I.snare(c, D, at(1), 0.09);
          I.snare(c, D, at(3), 0.1);
          for (let s = 0; s < 4; s += 0.5) { if (r() < 0.08) continue; I.hat(c, D, at(s), s % 1 === 0 ? 0.026 : 0.016); }
        }
        // レコードのプチプチ
        for (let k = 0; k < 6; k++) I.crackle(c, D, t + r() * 4 * b, 0.006 + r() * 0.01);
        // 旋律(後半の8小節)
        if (withMelody) this.mel[i].forEach(([m, s, l]) => I.ep(c, D, at(s) + r() * 0.01, m, 0.05, l * b + 0.4, 0.35, 0.5));
      },
    },

    maou: {
      title: '魔王城',
      bpm: 174, // 8分音符の速さ(6/8 拍子。付点4分=58)
      beats: 6,
      prog: ['Dm', 'Dm', 'B♭', 'C', 'Dm', 'F', 'C', 'G', 'B♭', 'F', 'Gm', 'A', 'Dm', 'B♭', 'C', 'Asus'],
      V: { Dm: [50, 53, 57, 62], 'B♭': [50, 53, 58, 62], C: [52, 55, 60, 64], F: [53, 57, 60, 65], G: [50, 55, 59, 62], Gm: [50, 55, 58, 62], A: [52, 57, 61, 64], Asus: [52, 57, 62, 64] },
      R: { Dm: 38, 'B♭': 34, C: 36, F: 41, G: 43, Gm: 43, A: 33, Asus: 33 },
      // 主旋律(5度の跳躍で始まる、旅立ちの動機)。[音, 開始(8分), 長さ(8分)]
      mel: {
        4: [[62, 0, 3], [69, 3, 3]],
        5: [[72, 0, 2], [69, 2, 1], [65, 3, 3]],
        6: [[67, 0, 2], [64, 2, 1], [67, 3, 2], [72, 5, 1]],
        7: [[74, 0, 3], [71, 3, 3]],
        8: [[74, 0, 2], [72, 2, 1], [70, 3, 2], [69, 5, 1]],
        9: [[69, 0, 3], [65, 3, 2], [67, 5, 1]],
        10: [[67, 0, 2], [70, 2, 1], [74, 3, 3]],
        11: [[73, 0, 3], [76, 3, 3]],
        12: [[74, 0, 6]],
      },
      play(c, D, n, t, b, r) {
        const i = n % 16;
        const loop = Math.floor(n / 16);
        const name = this.prog[i];
        const ch = this.V[name];
        const rootM = this.R[name];
        const busy = i >= 4 || loop > 0;
        // 低い弦の和音と、根音の持続
        I.pad(c, D, t, ch, 6 * b, { v: 0.017, type: 'sawtooth', cut: busy ? 1000 : 700, a: 0.6, r: 1.2, det: 9, send: 0.55 });
        I.pad(c, D, t, [rootM, rootM + 12], 6 * b, { v: 0.022, type: 'sawtooth', cut: 420, a: 0.25, r: 0.9, det: 5, send: 0.3 });
        if (name === 'Dm') I.pad(c, D, t, [26, 33], 6 * b, { v: 0.03, type: 'triangle', cut: 300, a: 0.8, r: 1.5, det: 3, send: 0.2 });
        // 低弦の刻み(進む感じ)
        if (busy) {
          const pat = [0, 12, 7, 0, 12, 7];
          pat.forEach((o, k) => I.cello(c, D, t + k * b, rootM + 12 + o, 0.3, k % 3 === 0 ? (i >= 4 ? 0.05 : 0.035) : 0.028, 0.3));
        }
        // ハープの分散和音
        const hs = ch.map((m) => m + 12).sort((x, y) => x - y);
        const hp = loop % 2 === 0 ? [0, 1, 2, 3, 2, 1] : [0, 2, 1, 3, 2, 3];
        const melodyBar = !!this.mel[i];
        hp.forEach((x, k) => { if (k > 0 && r() < 0.12) return; I.harp(c, D, t + k * b, hs[x], (melodyBar ? 0.032 : 0.045) + r() * 0.01, 1.6, 0.5); });
        // 太鼓: 6/8 の「ドン・タ・ドン・タ」(馬で駆けるような刻み)
        if (i >= 4) {
          I.drum(c, D, t, 38, 0.2, 0.9);
          I.drum(c, D, t + 3 * b, 38, 0.13, 0.7);
          I.tom(c, D, t + 2 * b, 0.045);
          I.tom(c, D, t + 5 * b, 0.05);
          if (i === 7 || i === 11 || i === 15) { I.tom(c, D, t + 4 * b, 0.06, 200); I.tom(c, D, t + 4.5 * b, 0.075, 210); }
        }
        // 主旋律: 偶数周は金管、奇数周は1オクターブ下の低い金管(暗く、重く)
        if (melodyBar) {
          const low = loop % 2 === 1;
          this.mel[i].forEach(([m, s, l]) => I.horn(c, D, t + s * b, low ? m - 12 : m, l * b, low ? 0.055 : 0.045, 0.55));
          if (i === 12) I.bell(c, D, t, 74, 0.018, 3.5);
        }
        // 最後の小節は、後半で属和音(A)に解決して頭に戻る
        if (name === 'Asus') I.pad(c, D, t + 3 * b, this.V.A, 3 * b, { v: 0.015, type: 'sawtooth', cut: 1100, a: 0.3, r: 0.8, det: 9, send: 0.5 });
      },
    },

    maou3: {
      title: '和平への道',
      bpm: 92,
      beats: 4,
      prog: ['Dm', 'Dm', 'B♭', 'B♭', 'Gm', 'Gm', 'A', 'A', 'Dm', 'F', 'C', 'Gm', 'B♭', 'C', 'F', 'A'],
      mel: {
        8: [[62, 0, 2], [65, 2, 2]],
        9: [[69, 0, 4]],
        10: [[67, 0, 2], [64, 2, 2]],
        11: [[70, 0, 2], [69, 2, 1], [67, 3, 1]],
        12: [[65, 0, 3], [62, 3, 1]],
        13: [[64, 0, 2], [67, 2, 2]],
        14: [[69, 0, 2], [72, 2, 2]],
        15: [[73, 0, 4]],
      },
      play(c, D, n, t, b, r) {
        const M = TRACKS.maou;
        const i = n % 16;
        const name = this.prog[i];
        const ch = M.V[name];
        const rootM = M.R[name];
        const second = i >= 8;
        I.pad(c, D, t, ch, 4 * b, { v: 0.016, type: 'triangle', cut: 1500, a: 0.8, r: 1.2, det: 7, send: 0.6 });
        I.pad(c, D, t, ch, 4 * b, { v: 0.012, type: 'sawtooth', cut: 900, a: 0.8, r: 1.2, det: 10, send: 0.5 });
        I.pad(c, D, t, [rootM, rootM + 12], 4 * b, { v: 0.022, type: 'sawtooth', cut: 380, a: 0.2, r: 0.8, det: 5, send: 0.3 });
        // 刻み続ける低弦
        const pat = [0, 0, 12, 0, 7, 0, 12, 7];
        const acc = [0.055, 0.03, 0.04, 0.03, 0.048, 0.03, 0.04, 0.03];
        pat.forEach((o, k) => I.cello(c, D, t + k * 0.5 * b, rootM + 12 + o, 0.24, acc[k] * (second ? 1.1 : 0.9), 0.25));
        // 前半は時計のように刻む高い音(張りつめた空気)
        if (!second) for (let k = 0; k < 4; k++) I.harp(c, D, t + k * b, rootM + 36 - (rootM > 40 ? 12 : 0), 0.02 + (k === 0 ? 0.01 : 0), 1, 0.6);
        // 陣太鼓
        I.drum(c, D, t, 38, second ? 0.24 : 0.18, 1);
        I.drum(c, D, t + 2 * b, 38, second ? 0.16 : 0.12, 0.8);
        if (second) {
          I.drum(c, D, t + 3.5 * b, 38, 0.1, 0.5);
          I.tom(c, D, t + b, 0.045);
          I.tom(c, D, t + 3 * b, 0.045);
        }
        if (i === 15) for (let k = 0; k < 8; k++) I.tom(c, D, t + 2 * b + k * 0.25 * b, 0.03 + k * 0.012, 190 + k * 4);
        // 金管の旋律(後半)。下にオクターブを重ねて重さを出す
        if (this.mel[i]) {
          this.mel[i].forEach(([m, s, l]) => {
            I.horn(c, D, t + s * b, m, l * b, 0.045, 0.55);
            I.horn(c, D, t + s * b, m - 12, l * b, 0.028, 0.5);
          });
          if (i === 14) I.bell(c, D, t, 77, 0.015, 3);
        }
      },
    },
  };

  // ---------------------------------------------------------------- 再生(先読みスケジューラー)
  const AHEAD = 1.2; // 何秒先まで予約するか
  let cur = null;    // 再生中の曲 { id, T, mix, wet, n, next, seed }
  let want = null;   // 鳴らしたい曲(音が出せるようになるまで待つ)
  let timer = null;
  let waiting = false;

  function scheduleBar(c, D, T, n, t, seed) {
    const b = 60 / T.bpm;
    const vol = A.volumes;
    if (!vol.muted && vol.bgm > 0) T.play(c, D, n, t, b, rng(seed * 7919 + n * 104729));
    return T.beats * b;
  }
  function tick() {
    if (!cur || !A.live) return;
    const c = A.live.c;
    if (c.state !== 'running') return;
    if (cur.next < c.currentTime - 0.2) cur.next = c.currentTime + 0.05; // 止まっていた間の分は飛ばす
    let guard = 0;
    while (cur.next < c.currentTime + AHEAD && guard++ < 4) {
      cur.next += scheduleBar(c, { dry: cur.mix, wet: cur.wet }, cur.T, cur.n, cur.next, cur.seed);
      cur.n++;
    }
  }
  function fadeOut(node, c, sec) {
    const t = c.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(node.gain.value, t);
    node.gain.linearRampToValueAtTime(0, t + sec);
    setTimeout(() => { try { node.disconnect(); } catch (e) { /* もう切れている */ } }, (sec + 6) * 1000);
  }
  function switchTo(id, delay, fade) {
    const g = A.live;
    if (!g) return;
    const { c, bus, verb } = g;
    if (cur && cur.id === id) return;
    if (cur) { fadeOut(cur.mix, c, 1.4); fadeOut(cur.wet, c, 1.4); cur = null; }
    if (!id || !TRACKS[id]) { clearInterval(timer); timer = null; return; }
    const now = c.currentTime;
    const mk = (dest) => {
      const x = c.createGain();
      x.gain.setValueAtTime(0, now);
      x.gain.setValueAtTime(0, now + delay);
      x.gain.linearRampToValueAtTime(1, now + delay + fade);
      x.connect(dest);
      return x;
    };
    cur = { id, T: TRACKS[id], mix: mk(bus.bgm), wet: mk(verb.bgm), n: 0, next: now + delay + 0.05, seed: Math.floor(Math.random() * 1e6) };
    if (!timer) timer = setInterval(tick, 200);
    tick();
  }

  // ---------------------------------------------------------------- 環境音
  // 継ぎ目の聞こえないループ用ノイズ(終わりを頭へ溶かしてつなぐ)
  const loopCache = new WeakMap();
  function loopBuf(c, kind) {
    let m = loopCache.get(c);
    if (!m) { m = {}; loopCache.set(c, m); }
    if (m[kind]) return m[kind];
    const len = c.sampleRate * 10;
    const x = Math.floor(c.sampleRate * 0.5);
    const raw = new Float32Array(len + x);
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; raw[i] = last * 3.5; } else raw[i] = w;
    }
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = i < x ? raw[i] * (i / x) + raw[len + i] * (1 - i / x) : raw[i];
    m[kind] = buf;
    return buf;
  }
  function loopSrc(c, kind, t) {
    const s = c.createBufferSource();
    s.buffer = loopBuf(c, kind);
    s.loop = true;
    s.start(t, Math.random() * 9);
    return s;
  }
  function lfo(c, f, depth, target, t) {
    const o = c.createOscillator();
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start(t);
    return o;
  }
  function filter(c, type, f, q = 0.7) {
    const b = c.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  // 環境音の定義: start で鳴り続ける音を作り、events で時々鳴る音を予約する
  const AMBIENCE = {
    work: {
      start(c, out, t) {
        // 空調の低いうなり
        const s = loopSrc(c, 'brown', t);
        const lp = filter(c, 'lowpass', 280, 0.5);
        const g = c.createGain();
        g.gain.value = 0.16;
        s.connect(lp).connect(g).connect(out);
        const air = loopSrc(c, 'white', t);
        const bp = filter(c, 'bandpass', 900, 0.4);
        const g2 = c.createGain();
        g2.gain.value = 0.006;
        air.connect(bp).connect(g2).connect(out);
        return [s, air];
      },
      // 遠くの席のタイピング
      events(c, D, from, to, st) {
        if (st.next == null) st.next = from + 3 + Math.random() * 5;
        while (st.next < to) {
          const keys = 4 + Math.floor(Math.random() * 12);
          let tt = st.next;
          for (let k = 0; k < keys; k++) {
            I.breath(c, D, tt, { type: 'bandpass', f: 2200 + Math.random() * 1600, q: 1.2, a: 0.001, len: 0.02, v: 0.012 + Math.random() * 0.012 });
            I.breath(c, D, tt, { type: 'lowpass', f: 700, a: 0.001, len: 0.03, v: 0.01 });
            tt += 0.07 + Math.random() * 0.12 + (Math.random() < 0.12 ? 0.35 : 0);
          }
          st.next = tt + 5 + Math.random() * 12;
        }
      },
    },
    maou: {
      start(c, out, t) {
        // 暖炉のゆらぐ炎
        const s = loopSrc(c, 'brown', t);
        const lp = filter(c, 'lowpass', 520, 0.6);
        const g = c.createGain();
        g.gain.value = 0.12;
        const l1 = lfo(c, 0.23, 0.04, g.gain, t);
        s.connect(lp).connect(g).connect(out);
        // 石の城を抜ける遠い風
        const w = loopSrc(c, 'white', t);
        const bp = filter(c, 'bandpass', 480, 3.5);
        const l2 = lfo(c, 0.06, 160, bp.frequency, t);
        const wg = c.createGain();
        wg.gain.value = 0.02;
        const l3 = lfo(c, 0.045, 0.014, wg.gain, t);
        w.connect(bp).connect(wg).connect(out);
        return [s, w, l1, l2, l3];
      },
      // 薪のはぜる音
      events(c, D, from, to, st) {
        if (st.next == null) st.next = from + 0.2;
        while (st.next < to) {
          const big = Math.random() < 0.12;
          I.breath(c, D, st.next, { type: 'highpass', f: big ? 900 : 1600 + Math.random() * 2500, q: 0.7, a: 0.0006, len: big ? 0.05 : 0.006 + Math.random() * 0.025, v: big ? 0.07 : 0.01 + Math.random() * 0.035 });
          st.next += Math.random() < 0.25 ? 0.03 + Math.random() * 0.06 : 0.15 + Math.random() * 0.6;
        }
      },
    },
  };

  let amb = null;    // { theme, out, nodes, st, timer }
  let wantAmb = null;
  function stopAmb(c) {
    if (!amb) return;
    const a = amb;
    amb = null;
    clearInterval(a.timer);
    fadeOut(a.out, c, 1.2);
    setTimeout(() => a.nodes.forEach((x) => { try { x.stop(); } catch (e) { /* 止まっている */ } }), 1500);
  }
  function switchAmb(theme) {
    const g = A.live;
    if (!g) return;
    const { c, bus } = g;
    if (amb && amb.theme === theme) return;
    stopAmb(c);
    const def = AMBIENCE[theme];
    if (!def) return;
    const t = c.currentTime;
    const out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(1, t + 2.5);
    out.connect(bus.amb);
    const a = { theme, out, nodes: def.start(c, out, t), st: {}, last: t };
    a.timer = setInterval(() => {
      if (c.state !== 'running') return;
      const now = c.currentTime;
      const from = Math.max(a.last, now);
      def.events(c, { dry: out, wet: null }, from, now + 0.5, a.st);
      a.last = now + 0.5;
    }, 250);
    amb = a;
  }

  // ---------------------------------------------------------------- 公開
  function whenReadyOnce() {
    if (waiting) return;
    waiting = true;
    A.whenReady(() => { waiting = false; switchTo(want, 0, 2.5); switchAmb(wantAmb); });
  }

  GQ.Bgm = {
    TRACKS,
    AMBIENCE,
    // 曲を切り替える(null で止める)。delay 秒後から fade 秒かけて入る
    play(id, opts = {}) {
      want = id || null;
      if (A.ready) switchTo(want, opts.delay || 0, opts.fade || 2.5); else whenReadyOnce();
    },
    stop() { this.play(null); },
    // 会議中の環境音('work' / 'maou' / null)
    ambience(theme) {
      wantAmb = theme || null;
      if (A.ready) switchAmb(wantAmb); else whenReadyOnce();
    },
    get current() { return cur ? cur.id : null; },
    get currentAmbience() { return amb ? amb.theme : null; },
    get wanted() { return want; },
    // 物語の話に合った曲(魔王軍編の第3章=和平は専用の曲)
    trackFor(seriesId, ep) {
      if (seriesId === 'maou') return ep && ep.chapter >= 3 ? 'maou3' : 'maou';
      if (seriesId === 'work') return 'work';
      return 'home';
    },
    // テスト用: 任意のコンテキストに、曲を seconds 秒ぶん予約する
    renderTo(c, D, id, seconds, seed = 1) {
      const T = TRACKS[id];
      let t = 0.05;
      let n = 0;
      while (t < seconds) { t += scheduleBar(c, D, T, n, t, seed); n++; }
      return n;
    },
    renderAmbience(c, out, theme, seconds) {
      const def = AMBIENCE[theme];
      const nodes = def.start(c, out, 0);
      def.events(c, { dry: out, wet: null }, 0, seconds, {});
      return nodes;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
