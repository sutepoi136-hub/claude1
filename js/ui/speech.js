/* 議事録クエスト — 会議の読み上げ(ブラウザの音声合成 Web Speech API)。
 * - 話者ごとに別の日本語音声を割り当てる(足りなければ声の高さ・速さで区別)
 * - 英字略語などは読み(readings)に置き換えて読み上げる(画面の字幕はそのまま)
 * - 長い発言は文ごとに分けて読む(Chrome で長文が途中で止まる不具合の対策)
 * - 一時停止は「その発言の頭から言い直す」方式(pause/resume が不安定なブラウザがあるため)
 * - 音声が使えない環境では、文字だけで進む「字幕のみモード」になる */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});
  const synth = root.speechSynthesis;
  const supported = !!(synth && root.SpeechSynthesisUtterance);
  const listeners = new Set();
  let voices = [];

  const isJa = (v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith('ja');
  function loadVoices() {
    voices = supported ? synth.getVoices().filter(isJa) : [];
    return voices;
  }
  if (supported) {
    loadVoices();
    const onChange = () => { loadVoices(); listeners.forEach((f) => f(voices)); };
    if (synth.addEventListener) synth.addEventListener('voiceschanged', onChange); else synth.onvoiceschanged = onChange;
  }
  // 音声の一覧が読み込まれるまで少し待つ(Chrome は非同期)
  function ready(timeout = 1500) {
    if (!supported || voices.length) return Promise.resolve(voices);
    return new Promise((resolve) => {
      const done = () => { listeners.delete(done); resolve(voices); };
      listeners.add(done);
      setTimeout(() => { listeners.delete(done); resolve(loadVoices()); }, timeout);
    });
  }

  const FEMALE = /nanami|aoi|mayu|shiori|haruka|ayumi|kyoko|sayaka|o-ren|mizuki|kaori|female|女性|google 日本語/i;
  const MALE = /keita|daichi|naoki|ichiro|otoya|hattori|takumi|male|男性/i;
  // 自然な音声(Edge の Natural / オンライン音声)ほど優先する
  const quality = (v) => (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google/i.test(v.name) ? 1 : 0);

  // 話者ごとに声を割り当てる。返り値 { map: {名前: {voice, pitch, rate}}, count, shared }
  function assign(people) {
    const pool = voices.slice().sort((a, b) => quality(b) - quality(a));
    const used = new Set();
    const map = {};
    let shared = false;
    Object.entries(people).forEach(([name, p]) => {
      const want = p.voice === 'female' ? FEMALE : MALE;
      const other = p.voice === 'female' ? MALE : FEMALE;
      const pick = pool.find((v) => !used.has(v.name) && want.test(v.name)) || pool.find((v) => !used.has(v.name) && !other.test(v.name));
      if (pick) used.add(pick.name); else shared = true;
      const fallback = pool.find((v) => want.test(v.name)) || pool.find((v) => !other.test(v.name)) || pool[0] || null;
      map[name] = { voice: pick || fallback, pitch: p.pitch || 1, rate: p.rate || 1 };
    });
    return { map, count: pool.length, shared };
  }

  // 読みの置き換え。英字の語は前後が英字でないときだけ置き換える(「PM」が「PMO」の中で置き換わらない)
  function applyReadings(text, dict) {
    const keys = Object.keys(dict || {}).sort((a, b) => b.length - a.length);
    if (!keys.length) return text;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(keys.map((k) => (/^[A-Za-z]/.test(k) ? `(?<![A-Za-z])${esc(k)}(?![A-Za-z])` : esc(k))).join('|'), 'g');
    return text.replace(re, (m) => dict[m] || m);
  }

  // 文ごとに分ける(長すぎる文は読点でも分ける)
  function chunks(text) {
    const out = [];
    String(text).split(/(?<=[。!?！？])/).forEach((s) => {
      const t = s.trim();
      if (!t) return;
      if (t.length <= 90) { out.push(t); return; }
      let buf = '';
      t.split(/(?<=、)/).forEach((p) => { if ((buf + p).length > 90 && buf) { out.push(buf); buf = p; } else buf += p; });
      if (buf) out.push(buf);
    });
    return out.length ? out : [String(text)];
  }

  const GAP = 380; // 発言と発言のあいだの間(ミリ秒)

  /* 会議の再生。opts:
   *  lines: 台本 [[話者, 文] | ['@join', 名前] ...]
   *  people: 話者の声の設定 { 名前: {voice, pitch, rate} }
   *  readings: 読み, playerName/playerReading: {player} の表示名と読み
   *  rate: 全体の速さ, textOnly: 音声を使わない
   *  onLine(i, entry), onEvent(i, entry), onState(state), onEnd() */
  function createPlayer(opts) {
    const lines = opts.lines;
    const textOnly = !!opts.textOnly || !supported;
    const vm = textOnly ? { map: {} } : assign(opts.people);
    let state = 'idle';
    let index = 0;
    let token = 0;
    let current = null; // 再生中の発話への参照(ガベージコレクションで onend が消える不具合の対策)
    let timer = null;

    const setState = (s) => { state = s; if (opts.onState) opts.onState(s); };
    const later = (fn, ms) => { clearTimeout(timer); const t = token; timer = setTimeout(() => { if (t === token) fn(); }, ms); };

    function finish() {
      setState('ended');
      if (opts.onEnd) opts.onEnd();
    }

    function speakLine(i) {
      if (state !== 'playing') return;
      index = i;
      if (i >= lines.length) { finish(); return; }
      const entry = lines[i];
      if (entry[0].charAt(0) === '@') {
        if (opts.onEvent) opts.onEvent(i, entry);
        later(() => speakLine(i + 1), 900);
        return;
      }
      if (opts.onLine) opts.onLine(i, entry);
      const display = String(entry[1]).replace(/\{player\}/g, opts.playerName || 'あなた');
      const rate = Math.min(2, Math.max(0.5, (opts.rate || 1) * ((vm.map[entry[0]] || {}).rate || 1)));
      if (textOnly) {
        later(() => speakLine(i + 1), Math.max(1600, (display.length * 140) / rate) + GAP);
        return;
      }
      const spoken = applyReadings(String(entry[1]).replace(/\{player\}/g, opts.playerReading || opts.playerName || 'あなた'), opts.readings);
      const parts = chunks(spoken);
      const v = vm.map[entry[0]] || {};
      const my = token;
      const speakPart = (k) => {
        if (my !== token || state !== 'playing') return;
        if (k >= parts.length) { later(() => speakLine(i + 1), GAP); return; }
        const u = new root.SpeechSynthesisUtterance(parts[k]);
        u.lang = 'ja-JP';
        if (v.voice) u.voice = v.voice;
        u.pitch = Math.min(2, Math.max(0.1, v.pitch || 1));
        u.rate = rate;
        let moved = false;
        const next = () => { if (moved || my !== token) return; moved = true; clearTimeout(timer); speakPart(k + 1); };
        u.onend = next;
        u.onerror = (e) => { if (e && (e.error === 'canceled' || e.error === 'interrupted')) return; next(); };
        current = u;
        synth.speak(u);
        // 終了の知らせが来ない環境のための見張り
        later(next, Math.max(5000, (parts[k].length * 420) / rate) + 4000);
      };
      speakPart(0);
    }

    function start(from) {
      token++;
      clearTimeout(timer);
      if (!textOnly) synth.cancel();
      setState('playing');
      const t = token;
      setTimeout(() => { if (t === token) speakLine(from); }, textOnly ? 0 : 80);
    }

    return {
      get state() { return state; },
      get index() { return index; },
      get textOnly() { return textOnly; },
      get voiceInfo() { return vm; },
      play() { index = 0; start(0); },
      pause() { if (state !== 'playing') return; token++; clearTimeout(timer); if (!textOnly) synth.cancel(); current = null; setState('paused'); },
      resume() { if (state !== 'paused') return; start(index); },
      stop() { token++; clearTimeout(timer); if (!textOnly) synth.cancel(); current = null; setState('idle'); },
      setRate(r) { opts.rate = r; },
    };
  }

  // 声のお試し(設定画面)
  function sample(text, people, name, rate) {
    if (!supported) return false;
    const vm = assign(people);
    const v = vm.map[name] || {};
    synth.cancel();
    const u = new root.SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (v.voice) u.voice = v.voice;
    u.pitch = v.pitch || 1;
    u.rate = Math.min(2, Math.max(0.5, (rate || 1) * (v.rate || 1)));
    synth.speak(u);
    return true;
  }

  GQ.Speech = {
    supported, ready, assign, applyReadings, chunks, createPlayer, sample,
    voices: () => voices,
    stopAll: () => { if (supported) synth.cancel(); },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
