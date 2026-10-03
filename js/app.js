(function () {
  const MAX_PLAYS = 2;
  const STORE_KEY = 'pmo-minutes-history-v1';
  const $ = (id) => document.getElementById(id);
  const screens = ['select', 'play', 'result'];
  let scenario = null;
  let playsLeft = MAX_PLAYS;
  let speaking = false;

  const TEMPLATE = '【決定事項】\n・\n\n【ToDo】(誰が・何を・いつまでに)\n・\n\n【課題・懸念】\n・\n\n【次回予定】\n・';

  function show(name) {
    screens.forEach((s) => ($('screen-' + s).hidden = s !== name));
    window.scrollTo(0, 0);
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
  }
  function saveHistory(entry) {
    try {
      const h = loadHistory();
      h.push(entry);
      localStorage.setItem(STORE_KEY, JSON.stringify(h.slice(-100)));
    } catch (e) { /* 保存不可の環境では履歴なしで続行 */ }
  }

  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
    const chronological = h.slice().reverse();
    $('history').innerHTML =
      `<div class="card">${chartSvg(chronological.map((x) => x.total))}` +
      h.slice(0, 10).map((x) =>
        `<div class="h-item"><span>${new Date(x.at).toLocaleString('ja-JP')} ${esc(x.title)}</span><strong>${x.rank} ${x.total}点</strong></div>`
      ).join('') + '</div>';
  }

  // 成長グラフ(簡易版): 直近のスコア推移
  function chartSvg(values) {
    const v = values.slice(-20);
    if (v.length < 2) return '<p class="hint">2回以上プレイすると成長グラフが表示されます。</p>';
    const W = 600, H = 110, pad = 12;
    const pts = v.map((y, i) => [pad + (i * (W - pad * 2)) / (v.length - 1), H - pad - (y / 100) * (H - pad * 2)]);
    return `<svg id="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="スコア推移">
      <polyline fill="none" stroke="var(--primary)" stroke-width="2.5" points="${pts.map((p) => p.join(',')).join(' ')}"/>
      ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--primary)"/>`).join('')}</svg>`;
  }

  // ---- プレイ ----
  function start(s) {
    scenario = s;
    playsLeft = MAX_PLAYS;
    stopSpeech();
    $('play-title').textContent = s.title;
    $('minutes').value = '';
    $('now-speaking').textContent = '';
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

  function pickVoice() {
    const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ja')) || null;
  }

  function play() {
    if (!('speechSynthesis' in window)) {
      $('play-status').textContent = 'このブラウザは音声読み上げ非対応です。台本を下に表示します。';
      $('now-speaking').innerHTML = '<ol class="script">' +
        scenario.script.map(([n, t]) => `<li><b>${n}</b>: ${esc(t)}</li>`).join('') + '</ol>';
      playsLeft = 0; updatePlayUi();
      return;
    }
    playsLeft--;
    speaking = true;
    updatePlayUi();
    speechSynthesis.cancel();
    const voice = pickVoice();
    const lines = scenario.script;
    lines.forEach(([name, text], i) => {
      const sp = scenario.speakers[name] || {};
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (voice) u.voice = voice;
      u.pitch = sp.pitch || 1;
      u.rate = sp.rate || 1;
      // 話者名は画面に出さず、誰が話しているかは声と内容で判断させる(実務に近づける)
      u.onstart = () => { $('now-speaking').textContent = '🔊 発言 ' + (i + 1) + ' / ' + lines.length; };
      if (i === lines.length - 1) u.onend = finishSpeech;
      u.onerror = (e) => { if (e.error !== 'canceled' && e.error !== 'interrupted') finishSpeech(); };
      speechSynthesis.speak(u);
    });
  }

  function finishSpeech() {
    speaking = false;
    $('now-speaking').textContent = '再生が終わりました。';
    updatePlayUi();
  }
  function stopSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    speaking = false;
  }

  // ---- 採点 + 結果 ----
  function submit() {
    const minutes = $('minutes').value.trim();
    if (minutes.length < 20) { alert('議事録がまだ短すぎます。もう少し書いてから採点してください。'); return; }
    stopSpeech();
    const r = evaluate(scenario, minutes);
    saveHistory({ at: Date.now(), scenarioId: scenario.id, title: scenario.title, total: r.total, rank: r.rank, breakdown: r.breakdown });
    renderResult(r);
    show('result');
  }

  function renderResult(r) {
    $('res-rank').textContent = r.rank;
    $('res-total').textContent = r.total;
    $('res-breakdown').innerHTML =
      `<li>網羅性 ${r.breakdown.coverage}/70</li><li>構造化 ${r.breakdown.structure}/15</li><li>正確性 ${r.breakdown.accuracy}/15</li>`;
    $('res-points').innerHTML = r.results.map((p) =>
      `<li><span class="${p.found ? 'ok' : 'ng'}">${p.found ? '✔' : '✘'}</span> <span class="badge">${TYPE_LABELS[p.type]}</span> ${esc(p.label)}</li>`
    ).join('');
    const warns = r.triggered.map((t) => `<p class="ng">⚠ ${esc(t.label)}</p>`);
    if (r.verbose) warns.push('<p class="warn">議事録が長めです。要点に絞ると読みやすくなります。</p>');
    $('res-warn').hidden = !warns.length;
    $('res-warn').innerHTML = '<h3>注意点</h3>' + warns.join('');
    $('res-script').innerHTML = scenario.script.map(([n, t]) =>
      `<li><b>${n}(${esc((scenario.speakers[n] || {}).role || '')})</b>: ${esc(t)}</li>`
    ).join('');
  }

  // ---- イベント ----
  $('btn-play').addEventListener('click', play);
  $('btn-stop').addEventListener('click', () => { stopSpeech(); updatePlayUi(); $('now-speaking').textContent = '停止しました。'; });
  $('btn-submit').addEventListener('click', submit);
  $('btn-template').addEventListener('click', () => {
    if (!$('minutes').value.trim() || confirm('入力中の内容を置き換えますか?')) { $('minutes').value = TEMPLATE; updateCount(); }
  });
  $('minutes').addEventListener('input', updateCount);
  $('btn-back').addEventListener('click', () => { stopSpeech(); renderSelect(); show('select'); });
  $('btn-home').addEventListener('click', () => { renderSelect(); show('select'); });
  $('btn-retry').addEventListener('click', () => start(scenario));
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

  renderSelect();
  show('select');
})();
