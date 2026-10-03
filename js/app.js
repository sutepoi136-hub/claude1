(function () {
  const MAX_PLAYS = 2;
  const GAP_MS = 450; // 発言と発言の間の間(ま)
  const STORE_KEY = 'pmo-minutes-history-v1';
  const $ = (id) => document.getElementById(id);
  const screens = ['select', 'play', 'result'];
  const KIND_LABEL = { error: '誤り', improve: '改善', missing: '抜け漏れ', good: '良い点' };
  let scenario = null;
  let playsLeft = MAX_PLAYS;
  let speaking = false;
  let runId = 0; // 再生のキャンセル用トークン
  let voiceMap = {};
  let historyAt = null;
  let lastFormal = null;
  let lastMinutes = '';

  const TEMPLATE = '【決定事項】\n・\n\n【ToDo】(誰が・何を・いつまでに)\n・\n\n【課題・懸念】\n・\n\n【次回予定】\n・';

  function show(name) {
    screens.forEach((s) => ($('screen-' + s).hidden = s !== name));
    window.scrollTo(0, 0);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ---- 履歴 ----
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
  }
  function writeHistory(h) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(h.slice(-100))); } catch (e) { /* 保存不可でも続行 */ }
  }
  function saveHistory(entry) { const h = loadHistory(); h.push(entry); writeHistory(h); }
  function updateHistory(at, patch) {
    const h = loadHistory();
    const e = h.find((x) => x.at === at);
    if (e) { Object.assign(e, patch); writeHistory(h); }
  }

  // ---- シナリオ選択 + 履歴 ----
  function renderSelect() {
    $('scenario-list').innerHTML = SCENARIOS.map(
      (s) => `<div class="card scn"><div><strong>${esc(s.title)}</strong><span class="badge">${esc(s.level)}</span>
        <div class="hint">${esc(s.description)}</div></div>
        <button class="primary" data-id="${s.id}">開始</button></div>`
    ).join('');
    $('scenario-list').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => start(SCENARIOS.find((s) => s.id === b.dataset.id)))
    );
    const h = loadHistory().slice().reverse();
    if (!h.length) { $('history').innerHTML = '<p class="hint">まだ記録がありません。</p>'; return; }
    $('history').innerHTML =
      `<div class="card">${chartSvg(h.slice().reverse().map((x) => x.total))}` +
      h.slice(0, 10).map((x) =>
        `<div class="h-item"><span>${new Date(x.at).toLocaleString('ja-JP')} ${esc(x.title)}${x.ai ? ' <span class="badge">AI</span>' : ''}</span><strong>${x.rank} ${x.total}点</strong></div>`
      ).join('') + '</div>';
  }

  function chartSvg(values) {
    const v = values.slice(-20);
    if (v.length < 2) return '<p class="hint">2回以上プレイすると成長グラフが表示されます。</p>';
    const W = 600, H = 110, pad = 12;
    const pts = v.map((y, i) => [pad + (i * (W - pad * 2)) / (v.length - 1), H - pad - (y / 100) * (H - pad * 2)]);
    return `<svg id="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="スコア推移">
      <polyline fill="none" stroke="var(--primary)" stroke-width="2.5" points="${pts.map((p) => p.join(',')).join(' ')}"/>
      ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--primary)"/>`).join('')}</svg>`;
  }

  // ---- 声の割り当て ----
  const FEMALE_HINT = /kyoko|haruka|ayumi|nanami|mizuki|o-ren|sayaka|female|女性|google 日本語/i;
  const MALE_HINT = /otoya|ichiro|keita|hattori|takumi|male|男性/i;

  function jaVoices() {
    const vs = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
    return vs.filter((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith('ja'));
  }

  // 話者ごとに別の声を割り当てる。声の種類が足りない場合は pitch / rate の差を強めて区別する。
  function assignVoices(speakers) {
    const pool = jaVoices();
    const used = new Set();
    const map = {};
    const names = Object.keys(speakers);
    names.forEach((n) => {
      const want = speakers[n].voice;
      const hint = want === 'female' ? FEMALE_HINT : MALE_HINT;
      const other = want === 'female' ? MALE_HINT : FEMALE_HINT;
      const pick =
        pool.find((v) => !used.has(v.name) && hint.test(v.name)) ||
        pool.find((v) => !used.has(v.name) && !other.test(v.name)) ||
        pool.find((v) => !used.has(v.name));
      if (pick) used.add(pick.name);
      map[n] = { voice: pick || pool.find((v) => hint.test(v.name)) || pool[0] || null, shared: !pick };
    });
    return { map, count: pool.length };
  }

  // ---- 話者パネル ----
  function renderCast() {
    $('cast').className = 'cast idle';
    $('cast').innerHTML = Object.entries(scenario.speakers).map(
      ([n, sp]) => `<div class="who" data-name="${esc(n)}" style="--c:${sp.color || '#2563eb'}">
        <div class="avatar" aria-hidden="true">${esc(n.slice(0, 1))}</div>
        <div class="nm">${esc(n)}</div><div class="rl">${esc(sp.role)}</div></div>`
    ).join('');
  }
  function setActive(name) {
    $('cast').classList.toggle('idle', !name);
    $('cast').querySelectorAll('.who').forEach((el) => el.classList.toggle('active', el.dataset.name === name));
  }
  function setSubtitle(text) {
    const on = $('opt-subtitle').checked;
    $('subtitle').hidden = !on || !text;
    $('subtitle').textContent = text || '';
  }

  // ---- プレイ ----
  function start(s) {
    scenario = s;
    playsLeft = MAX_PLAYS;
    stopSpeech();
    $('play-title').textContent = s.title;
    $('minutes').value = '';
    $('now-speaking').textContent = '';
    setSubtitle('');
    renderCast();
    const { map, count } = assignVoices(s.speakers);
    voiceMap = map;
    const shared = Object.values(map).some((m) => m.shared);
    $('voice-info').textContent = !('speechSynthesis' in window)
      ? ''
      : count === 0
        ? '日本語の音声が見つかりません。ブラウザやOSの音声設定をご確認ください。'
        : `日本語音声 ${count} 種類を使用。${shared ? '声の種類が足りないため、一部は声の高さと速さで区別しています。' : ''}`;
    updatePlayUi();
    updateCount();
    show('play');
  }

  function updatePlayUi() {
    $('plays-left').textContent = playsLeft;
    $('btn-play').disabled = playsLeft <= 0 || speaking;
    $('btn-stop').disabled = !speaking;
    $('play-status').textContent = speaking ? '再生中…' : playsLeft <= 0 ? '再生回数を使い切りました' : '';
  }
  function updateCount() { $('char-count').textContent = $('minutes').value.length + ' 文字'; }

  function speakLine(i, id) {
    if (id !== runId) return;
    const lines = scenario.script;
    if (i >= lines.length) { finishSpeech('再生が終わりました。'); return; }
    const [name, text] = lines[i];
    const sp = scenario.speakers[name] || {};
    const vm = voiceMap[name] || {};
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (vm.voice) u.voice = vm.voice;
    // 声の種類が足りない場合に備え、話者ごとの pitch / rate を常に反映して聞き分けやすくする
    u.pitch = Math.min(2, Math.max(0.1, sp.pitch || 1));
    u.rate = Math.min(2, Math.max(0.5, sp.rate || 1));
    u.onstart = () => {
      if (id !== runId) return;
      setActive(name);
      $('now-speaking').textContent = `🔊 ${name}(${sp.role || ''})が発言中  ${i + 1} / ${lines.length}`;
      setSubtitle(`${name}: ${text}`);
    };
    let advanced = false;
    const next = () => {
      if (advanced || id !== runId) return;
      advanced = true;
      setActive(null);
      setTimeout(() => speakLine(i + 1, id), GAP_MS);
    };
    u.onend = next;
    u.onerror = (e) => { if (e.error === 'canceled' || e.error === 'interrupted') return; next(); };
    speechSynthesis.speak(u);
  }

  function play() {
    if (!('speechSynthesis' in window)) {
      $('play-status').textContent = 'このブラウザは音声読み上げ非対応です。台本を表示します。';
      $('now-speaking').innerHTML = '<ol class="script">' +
        scenario.script.map(([n, t]) => `<li><b>${esc(n)}</b>: ${esc(t)}</li>`).join('') + '</ol>';
      playsLeft = 0; updatePlayUi();
      return;
    }
    playsLeft--;
    speaking = true;
    runId++;
    updatePlayUi();
    speechSynthesis.cancel();
    speakLine(0, runId);
  }

  function finishSpeech(msg) {
    speaking = false;
    setActive(null);
    setSubtitle('');
    $('now-speaking').textContent = msg;
    updatePlayUi();
  }
  function stopSpeech() {
    runId++;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    speaking = false;
    if (scenario && $('cast')) setActive(null);
  }

  // ---- 採点 + 結果 ----
  async function submit() {
    const minutes = $('minutes').value.trim();
    if (minutes.length < 20) { alert('議事録がまだ短すぎます。もう少し書いてから採点してください。'); return; }
    stopSpeech();
    const r = evaluate(scenario, minutes);
    lastFormal = r;
    lastMinutes = minutes;
    historyAt = Date.now();
    saveHistory({ at: historyAt, scenarioId: scenario.id, title: scenario.title, total: r.total, rank: r.rank, breakdown: r.breakdown });
    renderResult(r);
    show('result');
    if ($('opt-ai').checked) runAiReview(scenario, minutes, r, historyAt);
  }

  function renderResult(r) {
    $('res-rank').textContent = r.rank;
    $('res-total').textContent = r.total;
    $('res-breakdown').innerHTML =
      `<li>網羅性 ${r.breakdown.coverage}/70</li><li>構造化 ${r.breakdown.structure}/15</li><li>正確性 ${r.breakdown.accuracy}/15</li>`;
    $('res-final').hidden = true;
    $('ai-card').hidden = true;
    $('redpen-card').hidden = true;
    $('model-body').hidden = true;
    $('btn-model-ai').hidden = true;
    $('btn-model').textContent = '模範解答を見る';
    $('model-note').textContent = '答え合わせ用の議事録です。';
    $('res-points').innerHTML = r.results.map((p) =>
      `<li><span class="${p.found ? 'ok' : 'ng'}">${p.found ? '✔' : '✘'}</span> <span class="badge">${TYPE_LABELS[p.type]}</span> ${esc(p.label)}</li>`
    ).join('');
    const warns = r.triggered.map((t) => `<p class="ng">⚠ ${esc(t.label)}</p>`);
    if (r.verbose) warns.push('<p class="warn">議事録が長めです。要点に絞ると読みやすくなります。</p>');
    $('res-warn').hidden = !warns.length;
    $('res-warn').innerHTML = '<h3>注意点</h3>' + warns.join('');
    $('res-script').innerHTML = scenario.script.map(([n, t]) =>
      `<li><b>${esc(n)}(${esc((scenario.speakers[n] || {}).role || '')})</b>: ${esc(t)}</li>`
    ).join('');
  }

  // ---- AI ----
  async function postJson(url, body) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error('AIサーバーに接続できません。`npm start` で起動しているか確認してください。');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'AI採点に失敗しました。');
    return data;
  }

  async function runAiReview(sc, minutes, formal, at) {
    $('ai-card').hidden = false;
    $('ai-badge').textContent = '';
    $('ai-body').innerHTML = '<p class="spin">⏳ AIが議事録を確認しています…(10〜30秒ほど)</p>';
    try {
      const ai = await postJson('/api/review', { scenarioId: sc.id, minutes });
      if (sc !== scenario || at !== historyAt) return; // 画面が切り替わっていたら反映しない
      const final = Math.min(100, Math.max(0, formal.total + ai.bonus));
      $('ai-badge').textContent = ai.cached ? '同じ内容なので前回の結果を再利用' : '';
      $('ai-body').innerHTML =
        `<p class="hint">形式採点を土台に、AIは上下限つきのボーナス(${ai.bonusRange[0]}〜+${ai.bonusRange[1]}点)だけを加減します。</p>
        <ul class="ai-items">${ai.items.map((i) =>
          `<li><span>${esc(i.label)}<br><small class="hint">${esc(i.reason)}</small></span><span class="pt ${i.score > 0 ? 'pos' : i.score < 0 ? 'neg' : ''}">${i.score > 0 ? '+' : ''}${i.score}</span></li>`).join('')}</ul>
        <p><strong>AIボーナス合計: ${ai.bonus > 0 ? '+' : ''}${ai.bonus}点</strong></p>
        ${ai.advice.length ? `<h3>アドバイス</h3><ul class="advice">${ai.advice.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}`;
      $('res-final').hidden = false;
      $('res-final').innerHTML = `形式 ${formal.total} ${ai.bonus >= 0 ? '+' : '−'} AIボーナス ${Math.abs(ai.bonus)} = 最終 <strong>${final}点(${rankOf(final)})</strong>`;
      $('res-rank').textContent = rankOf(final);
      $('res-total').textContent = final;
      updateHistory(at, { total: final, rank: rankOf(final), ai: true, formal: formal.total, bonus: ai.bonus });
      renderRedPen(minutes, ai.redPen);
    } catch (e) {
      if (sc !== scenario || at !== historyAt) return;
      $('ai-body').innerHTML = `<p class="warn">AI採点は利用できませんでした: ${esc(e.message)}</p><p class="hint">形式採点のスコアは有効です。</p>`;
    }
  }

  function renderRedPen(minutes, items) {
    if (!items.length) return;
    $('redpen-card').hidden = false;
    // 引用の位置を求め、重ならないものだけを本文に重ねて表示する
    const spans = [];
    items.forEach((it, idx) => {
      if (!it.quote) return;
      const start = minutes.indexOf(it.quote);
      if (start < 0) return;
      const end = start + it.quote.length;
      if (spans.some((s) => start < s.end && end > s.start)) return;
      spans.push({ start, end, idx, kind: it.kind });
    });
    spans.sort((a, b) => a.start - b.start);
    let html = '';
    let pos = 0;
    spans.forEach((s) => {
      html += esc(minutes.slice(pos, s.start));
      html += `<mark class="k-${s.kind}">${esc(minutes.slice(s.start, s.end))}</mark><sup>${s.idx + 1}</sup>`;
      pos = s.end;
    });
    html += esc(minutes.slice(pos));
    $('redpen-text').innerHTML = html;
    $('redpen-list').innerHTML = items.map((it) =>
      `<li class="k-${it.kind}"><span class="c">[${KIND_LABEL[it.kind]}] ${esc(it.comment)}</span><br>
        <span class="s">→ ${esc(it.suggestion)}</span>${it.quote ? '' : '<br><span class="q">(該当箇所なし)</span>'}</li>`
    ).join('');
  }

  async function showModelAnswer(useAi) {
    const body = $('model-body');
    if (!useAi) {
      body.textContent = scenario.modelAnswer || '(模範解答は未登録です)';
      body.hidden = false;
      $('model-note').textContent = '台本に基づく標準の模範解答です。';
      $('btn-model').textContent = '閉じる';
      $('btn-model-ai').hidden = false;
      return;
    }
    $('model-note').textContent = '⏳ AIが模範解答を作成中…';
    try {
      const ai = await postJson('/api/model-answer', { scenarioId: scenario.id });
      body.textContent = ai.minutes;
      $('model-note').textContent = 'AIが台本から作成した模範解答です' + (ai.cached ? '(保存済み)' : '') + '。';
    } catch (e) {
      $('model-note').textContent = `AI版は利用できませんでした(${e.message})。標準の模範解答を表示しています。`;
      body.textContent = scenario.modelAnswer || '';
    }
  }

  // ---- イベント ----
  $('btn-play').addEventListener('click', play);
  $('btn-stop').addEventListener('click', () => { stopSpeech(); updatePlayUi(); $('now-speaking').textContent = '停止しました。'; setSubtitle(''); });
  $('opt-subtitle').addEventListener('change', () => { if (!speaking) setSubtitle(''); });
  $('btn-submit').addEventListener('click', submit);
  $('btn-template').addEventListener('click', () => {
    if (!$('minutes').value.trim() || confirm('入力中の内容を置き換えますか?')) { $('minutes').value = TEMPLATE; updateCount(); }
  });
  $('minutes').addEventListener('input', updateCount);
  $('btn-back').addEventListener('click', () => { stopSpeech(); renderSelect(); show('select'); });
  $('btn-home').addEventListener('click', () => { historyAt = null; renderSelect(); show('select'); });
  $('btn-retry').addEventListener('click', () => start(scenario));
  $('btn-model').addEventListener('click', () => {
    if (!$('model-body').hidden) { $('model-body').hidden = true; $('btn-model').textContent = '模範解答を見る'; return; }
    showModelAnswer(false);
  });
  $('btn-model-ai').addEventListener('click', () => showModelAnswer(true));
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

  renderSelect();
  show('select');
})();
