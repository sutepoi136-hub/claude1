(function () {
  const MAX_PLAYS = 2;
  const GAP_MS = 450; // 発言と発言の間の間(ま)
  const $ = (id) => document.getElementById(id);
  const screens = ['select', 'stages', 'play', 'result'];
  const KIND_LABEL = { error: '誤り', improve: '改善', missing: '抜け漏れ', good: '良い点' };
  const RANK_COLOR = { S: '#e09b00', A: '#e8590c', B: '#2f9e44', C: '#1c7ed6', D: '#868e96' };
  const LEVELS = [
    { id: '初級', icon: '🌱', stars: 1, blurb: '話者3〜4人・約1〜2分。決定・ToDo・保留の区別から練習しよう。実務の会議に加え、ファンタジー(魔王軍編)も。' },
    { id: '中級', icon: '🔥', stars: 2, blurb: '話者4〜5人・約3〜5分。言い直し・数字の訂正・遅れて入る人・保留など、実際の会議に近い内容。魔王軍編の続きもここ。' },
    { id: '上級', icon: '⚡', stars: 3, blurb: '炎上案件・関係者多数など、手ごわい会議。準備中です。', soon: true },
  ];
  const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let scenario = null;
  let playsLeft = MAX_PLAYS;
  let speaking = false;
  let runId = 0; // 再生のキャンセル用トークン
  let voiceMap = {};
  let historyAt = null;
  let beforeHistory = [];
  let hadBestBefore = null;
  let tplData = Store.templates();
  let tplEditingId = null;
  let aiProbe = null;
  let celebrated = false; // 結果画面ごとに紙吹雪は1回だけ
  let currentLevel = '初級';

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function show(name) {
    screens.forEach((s) => ($('screen-' + s).hidden = s !== name));
    window.scrollTo(0, 0);
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4300);
  }

  function confetti(count = 70) {
    if (reducedMotion) return;
    const colors = ['#ffc42e', '#ff7a3d', '#ff5d8f', '#2f9e44', '#1c7ed6'];
    const box = $('confetti');
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.style.cssText = `left:${Math.random() * 100}vw;--c:${colors[i % colors.length]};--x:${(Math.random() - 0.5) * 200}px;--d:${2.4 + Math.random() * 2}s;--delay:${Math.random() * 0.6}s`;
      box.appendChild(p);
    }
    setTimeout(() => (box.innerHTML = ''), 5500);
  }

  function countUp(el, to) {
    if (reducedMotion) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 800);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---- 成績・バッジ ----
  function renderMe() {
    const h = Store.history();
    const lv = Game.levelInfo(Game.xpOf(h));
    const streak = Game.streakOf(h);
    const lvTip = `XP(経験値)は遊ぶほど貯まります。あと${lv.next - lv.xp}XPでLv.${lv.level + 1}。クリックで詳しい説明を見られます。`;
    const stTip = '連続プレイ日数です。毎日1回以上遊ぶと増え、1日空くと0に戻ります。';
    $('me').innerHTML =
      `<div class="lv" role="button" tabindex="0" data-help="xp" data-tip="${esc(lvTip)}"><div class="t"><span>Lv.${lv.level} ${esc(lv.title)}</span><span>${lv.xp - lv.floor}/${lv.next - lv.floor} XP</span></div><div class="bar"><i style="width:${lv.pct}%"></i></div></div>` +
      `<span class="chip" role="button" tabindex="0" data-help="streak" data-tip="${stTip}">🔥 ${streak}日</span>`;
  }

  function renderBadges() {
    const earned = new Set(Game.badgesOf(Store.history(), SCENARIOS));
    $('badge-shelf').innerHTML = Game.BADGES.map((b) =>
      `<div class="bd ${earned.has(b.id) ? 'earned' : 'locked'}"><div class="i">${earned.has(b.id) ? b.icon : '🔒'}</div><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`
    ).join('');
  }

  // 新しく獲得したバッジをトーストで知らせる(初回起動時は既存分を黙って記録)
  function announceBadges() {
    const now = Game.badgesOf(Store.history(), SCENARIOS);
    const seen = Store.seenBadges();
    if (seen) {
      now.filter((id) => !seen.includes(id)).forEach((id, i) => {
        const b = Game.BADGES.find((x) => x.id === id);
        setTimeout(() => toast(`${b.icon} 新バッジ「${b.name}」を獲得!`), i * 900);
      });
    }
    Store.saveSeenBadges(now);
  }

  // ---- AI接続の診断 ----
  async function probeAi() {
    if (location.protocol === 'file:') return { state: 'file' };
    let res;
    try { res = await fetch('/api/status', { cache: 'no-store' }); } catch (e) { return { state: 'down' }; }
    let data;
    try { data = await res.json(); } catch (e) { return { state: 'static' }; }
    if (!data || data.app !== 'pmo-practice') return { state: 'static' };
    if (data.reason === 'deps') return { state: 'deps' };
    if (data.reason === 'badkey') return { state: 'badkey' };
    return data.ai ? { state: 'ok', mock: data.mock } : { state: 'nokey' };
  }

  const START_STEPS = '<ol><li>フォルダ内の <code>start.bat</code>(Windows)をダブルクリック。Mac は、ターミナルで <code>bash start.sh</code></li><li>黒い画面に表示された <code>http://localhost:8000</code> をブラウザで開く</li></ol>';
  const DIAG = {
    ok: (p) => ({ cls: 'ok', html: `<b>🤖 AI採点: 使えます${p.mock ? '(ダミー応答モード)' : ''}</b>` }),
    nokey: () => ({ cls: 'warn', html: '<b>🔑 AIサーバーは動いていますが、APIキーが未設定です</b><ol><li>フォルダ内の <code>.env.example</code> を <code>.env</code> という名前にコピー</li><li><code>.env</code> を開き、<code>ANTHROPIC_API_KEY=</code> の右にAPIキーを書いて保存</li><li>黒い画面を閉じて <code>start.bat</code> をもう一度実行</li></ol><span class="hint">キーがなくても形式採点は遊べます。</span>' }),
    badkey: () => ({ cls: 'bad', html: '<b>🔑 APIキーの書き方が正しくありません</b><span class="hint">.env の <code>ANTHROPIC_API_KEY=</code> の右が、見本の文字のままか、日本語などの全角文字・空白が入っています。</span><ol><li><code>.env</code> をメモ帳で開く</li><li><code>ANTHROPIC_API_KEY=</code> の右に、<b>半角英数字だけ</b>でキーを貼り付けて保存(例: <code>sk-ant-api03-…</code>)</li><li>黒い画面を閉じて <code>start.bat</code> をもう一度実行</li></ol>' }),
    deps: () => ({ cls: 'bad', html: '<b>📦 AI採点に必要なパッケージが入っていません</b><ol><li>黒い画面を閉じる</li><li><code>start.bat</code>(Mac は <code>bash start.sh</code>)をもう一度実行。初回は自動でインストールされます(インターネット接続が必要)</li></ol><span class="hint">それでも直らない場合は、フォルダで <code>npm install</code> を実行したときの表示を教えてください。</span>' }),
    down: () => ({ cls: 'bad', html: `<b>🔌 AIサーバーが起動していません</b>${START_STEPS}` }),
    static: () => ({ cls: 'bad', html: `<b>⚠ このページはAIサーバーではなく、普通のWebサーバーで開かれています</b><span class="hint">(python の http.server などで起動していませんか?)</span>${START_STEPS}` }),
    file: () => ({ cls: 'bad', html: `<b>⚠ ファイルを直接開いています(index.html のダブルクリック)</b><span class="hint">AI採点にはサーバーの起動が必要です。</span>${START_STEPS}` }),
  };

  async function refreshAiStatus(force) {
    if (force || !aiProbe) aiProbe = await probeAi();
    const d = DIAG[aiProbe.state](aiProbe);
    const retry = aiProbe.state === 'ok' ? '' : '<br><button class="btn small" data-retry>🔄 もう一度確認</button>';
    ['home', 'play'].forEach((k) => {
      const el = $('ai-status-' + k);
      el.className = 'ai-status ' + d.cls;
      el.innerHTML = d.html + retry;
      const b = el.querySelector('[data-retry]');
      if (b) b.addEventListener('click', () => refreshAiStatus(true));
    });
    $('opt-ai').checked = aiProbe.state === 'ok';
    $('opt-ai').disabled = aiProbe.state !== 'ok';
    return aiProbe;
  }

  // ---- ホーム(難易度を選ぶ) ----
  const scenariosOf = (level) => SCENARIOS.filter((sc) => sc.level === level);
  const isCleared = (best, id) => !!(best[id] && best[id].total >= CLEAR_SCORE);

  function renderSelect() {
    renderMe();
    const history = Store.history();
    const best = Game.bestByScenario(history);
    const rec = LEVELS.find((l) => !l.soon && scenariosOf(l.id).some((sc) => !isCleared(best, sc.id)));
    $('level-list').innerHTML = LEVELS.map((l) => {
      const list = scenariosOf(l.id);
      const cleared = list.filter((sc) => isCleared(best, sc.id)).length;
      const pct = list.length ? Math.round((cleared / list.length) * 100) : 0;
      const stars = `${'★'.repeat(l.stars)}<s>${'★'.repeat(3 - l.stars)}</s>`;
      const tag = rec && rec.id === l.id ? '<span class="rec">おすすめ</span>' : '';
      const body = `<div class="ico" aria-hidden="true">${l.icon}</div>
        <div><div class="nm">${l.id}<span class="stars" aria-hidden="true">${stars}</span>${tag}</div>
        <div class="bl">${esc(l.blurb)}</div>
        ${l.soon ? '<div class="prog">🔒 準備中</div>' : `<div class="prog"><span>クリア ${cleared}/${list.length}</span><span class="pbar"><i style="width:${pct}%"></i></span></div>`}</div>
        <div class="go" aria-hidden="true">${l.soon ? '' : '▶'}</div>`;
      return l.soon
        ? `<div class="level-card soon" aria-disabled="true" data-tip="上級は準備中です。初級・中級をクリアしてお待ちください。">${body}</div>`
        : `<button type="button" class="level-card" data-level="${l.id}" data-tip="${l.id}のステージ(${list.length}本)を選びます。クリア=${CLEAR_SCORE}点以上。">${body}</button>`;
    }).join('');
    $('level-list').querySelectorAll('[data-level]').forEach((el) => el.addEventListener('click', () => showStages(el.dataset.level)));
    renderBadges();
    const h = history.slice().reverse();
    $('history').innerHTML = !h.length
      ? '<div class="card"><p class="hint">まだ記録がありません。最初のステージに挑戦しましょう!</p></div>'
      : `<div class="card">${chartSvg(h.slice().reverse().map((x) => x.total))}` +
        h.slice(0, 10).map((x) =>
          `<div class="h-item"><span>${new Date(x.at).toLocaleString('ja-JP')} ${esc(x.title)}${x.ai ? ' <span class="badge" data-tip="AI採点を受けた回です">AI</span>' : ''}</span><strong>${x.rank} ${x.total}点</strong></div>`
        ).join('') + '</div>';
  }

  // ---- ステージを選ぶ(難易度ごと) ----
  function showStages(levelId) {
    currentLevel = levelId;
    const lv = LEVELS.find((l) => l.id === levelId) || LEVELS[0];
    const best = Game.bestByScenario(Store.history());
    const list = scenariosOf(lv.id);
    const cleared = list.filter((sc) => isCleared(best, sc.id)).length;
    renderMe();
    $('stages-head').innerHTML = `<div class="ico" aria-hidden="true">${lv.icon}</div><div><h2>${lv.id}のステージ</h2><p>${esc(lv.blurb)}(クリア ${cleared}/${list.length})</p></div>`;
    $('scenario-list').innerHTML = list.map((sc) => {
      const b = best[sc.id];
      const status = !b ? '未挑戦'
        : b.total >= CLEAR_SCORE ? `<span class="clear">✔ クリア済み</span> <span class="medal" style="--rc:${RANK_COLOR[b.rank]}" data-tip="自己ベストのランク">${b.rank}</span> 自己ベスト ${b.total}点`
        : `<span class="medal" style="--rc:${RANK_COLOR[b.rank]}">${b.rank}</span> 自己ベスト ${b.total}点(あと${CLEAR_SCORE - b.total}点でクリア)`;
      return `<div class="stage"><div class="ico" aria-hidden="true">${sc.icon || '🎧'}</div>
        <div><div class="ttl">${esc(sc.title)}</div>
        ${sc.series ? `<div><span class="badge" data-tip="物語が時系列で進むシリーズです。第1話から順に遊ぶと、戦いの流れを追えます。">⚔ ${esc(sc.series)} 第${sc.episode}話</span></div>` : ''}
        <div class="hint">${esc(sc.description)}</div>
        <div class="best">${status}</div></div>
        <button class="btn primary" data-id="${sc.id}">${b ? '再挑戦' : '挑戦する'}</button></div>`;
    }).join('');
    $('scenario-list').querySelectorAll('button[data-id]').forEach((el) =>
      el.addEventListener('click', () => start(SCENARIOS.find((x) => x.id === el.dataset.id)))
    );
    show('stages');
  }

  function chartSvg(values) {
    const v = values.slice(-20);
    if (v.length < 2) return '<p class="hint">2回以上プレイすると成長グラフが表示されます。</p>';
    const W = 600, H = 120, pad = 14;
    const pts = v.map((y, i) => [pad + (i * (W - pad * 2)) / (v.length - 1), H - pad - (y / 100) * (H - pad * 2)]);
    return `<svg id="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="スコア推移">
      <polyline fill="none" stroke="var(--primary)" stroke-width="3" stroke-linejoin="round" points="${pts.map((p) => p.join(',')).join(' ')}"/>
      ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--accent)" stroke="var(--primary)" stroke-width="2"/>`).join('')}</svg>`;
  }

  // ---- 声の割り当て ----
  const FEMALE_HINT = /kyoko|haruka|ayumi|nanami|mizuki|o-ren|sayaka|female|女性|google 日本語/i;
  const MALE_HINT = /otoya|ichiro|keita|hattori|takumi|male|男性/i;

  function jaVoices() {
    const vs = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
    return vs.filter((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith('ja'));
  }

  // 話者ごとに別の声を割り当てる。声の種類が足りない場合は pitch / rate の差で区別する。
  function assignVoices(speakers) {
    const pool = jaVoices();
    const used = new Set();
    const map = {};
    Object.keys(speakers).forEach((n) => {
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
      ([n, sp]) => `<div class="who" data-name="${esc(n)}" style="--c:${sp.color || '#5b4bd6'}">
        <div class="avatar" aria-hidden="true">${esc(n.slice(0, 1))}</div>
        <div class="nm">${esc(n)}</div><div class="rl">${esc(sp.role)}</div></div>`
    ).join('');
  }
  function setActive(name) {
    $('cast').classList.toggle('idle', !name);
    $('cast').querySelectorAll('.who').forEach((el) => el.classList.toggle('active', el.dataset.name === name));
  }
  function setSubtitle(text) {
    $('subtitle').hidden = !$('opt-subtitle').checked || !text;
    $('subtitle').textContent = text || '';
  }

  // ---- プレイ ----
  function start(s) {
    scenario = s;
    currentLevel = s.level;
    playsLeft = MAX_PLAYS;
    stopSpeech();
    $('play-title').textContent = s.title;
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
    // 既定テンプレートがあれば最初からノートに入れる
    tplData = Store.templates();
    const def = tplData.defaultId && Templates.find(tplData, tplData.defaultId);
    $('minutes').value = def ? def.body : '';
    renderTplSelect();
    updatePlayUi();
    updateCount();
    show('play');
    refreshAiStatus(true); // サーバーが途中で止まっていても気づけるよう、開始のたびに再確認
  }

  function updatePlayUi() {
    $('plays-icons').innerHTML = Array.from({ length: MAX_PLAYS }, (_, i) => `<span class="${i < playsLeft ? '' : 'off'}">🎧</span>`).join('');
    $('plays-left').textContent = `残り${playsLeft}回`;
    $('btn-play').disabled = playsLeft <= 0 || speaking;
    $('btn-stop').disabled = !speaking;
    $('play-status').textContent = speaking ? '再生中…' : playsLeft <= 0 ? '再生回数を使い切りました' : `あと${playsLeft}回聞けます`;
  }
  function updateCount() { $('char-count').textContent = $('minutes').value.length + ' 文字'; }

  function speakLine(i, id) {
    if (id !== runId) return;
    const lines = scenario.script;
    if (i >= lines.length) { finishSpeech('会議が終わりました。議事録にまとめましょう!'); return; }
    const [name, text] = lines[i];
    const sp = scenario.speakers[name] || {};
    const vm = voiceMap[name] || {};
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (vm.voice) u.voice = vm.voice;
    // 声の種類が足りない場合に備え、話者ごとの pitch / rate を常に反映する
    u.pitch = Math.min(2, Math.max(0.1, sp.pitch || 1));
    u.rate = Math.min(2, Math.max(0.5, sp.rate || 1));
    u.onstart = () => {
      if (id !== runId) return;
      setActive(name);
      $('now-speaking').textContent = `${name}(${sp.role || ''})が発言中  ${i + 1} / ${lines.length}`;
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
    if (scenario) setActive(null);
  }

  // ---- 採点 + 結果 ----
  function submit() {
    const minutes = $('minutes').value.trim();
    if (minutes.length < 20) { alert('議事録がまだ短すぎます。もう少し書いてから提出してください。'); return; }
    stopSpeech();
    const r = evaluate(scenario, minutes);
    const history = Store.history();
    beforeHistory = history.slice();
    const prevBest = Game.bestByScenario(history)[scenario.id];
    hadBestBefore = prevBest ? prevBest.total : null;
    historyAt = Date.now();
    history.push({
      at: historyAt, scenarioId: scenario.id, title: scenario.title, total: r.total, rank: r.rank,
      breakdown: r.breakdown, traps: r.triggered.length,
    });
    Store.saveHistory(history);
    renderResult(r);
    show('result');
    afterScoreUpdate(r.total, r.rank);
    if ($('opt-ai').checked && !$('opt-ai').disabled) runAiReview(scenario, minutes, r, historyAt);
  }

  function renderResult(r) {
    celebrated = false;
    $('res-rank').textContent = '';
    $('res-rank').removeAttribute('data-rank');
    $('res-total').textContent = '0';
    $('res-new-best').hidden = true;
    $('res-breakdown').innerHTML =
      `<li data-tip="会議の要点(決定事項・ToDo・課題・次回予定)をどれだけ拾えたか。70点満点">網羅性 ${r.breakdown.coverage}/70</li>` +
      `<li data-tip="箇条書きや見出し、決定/ToDo/課題/次回の分類ができているか。15点満点">構造化 ${r.breakdown.structure}/15</li>` +
      `<li data-tip="保留を決定と書く、訂正前の数字を書くなどの引っかけに乗らなかったか。15点満点">正確性 ${r.breakdown.accuracy}/15</li>`;
    $('res-final').hidden = true;
    $('res-xp').innerHTML = '';
    $('ai-card').hidden = true;
    $('redpen-card').hidden = true;
    $('model-body').hidden = true;
    $('btn-model-ai').hidden = true;
    $('btn-model').textContent = '模範解答を見る';
    $('model-note').textContent = '答え合わせ用の議事録です。';
    $('res-points').innerHTML = r.results.map((p) =>
      `<li><span class="${p.found ? 'ok' : 'ng'}">${p.found ? '✔ クリア' : '✘ 未達'}</span> <span class="badge">${TYPE_LABELS[p.type]}</span> ${esc(p.label)}</li>`
    ).join('');
    const warns = r.triggered.map((t) => `<p class="ng">⚠ ${esc(t.label)}</p>`);
    if (r.verbose) warns.push('<p class="warn">議事録が長めです。要点に絞ると読みやすくなります。</p>');
    $('res-warn').hidden = !warns.length;
    $('res-warn').innerHTML = '<h3>⚠ 注意点</h3>' + warns.join('');
    $('res-script').innerHTML = scenario.script.map(([n, t]) =>
      `<li><b>${esc(n)}(${esc((scenario.speakers[n] || {}).role || '')})</b>: ${esc(t)}</li>`
    ).join('');
  }

  // スコアが確定(形式採点のあと、AIボーナス反映のあと)するたびに、演出・XP・バッジを更新する
  function afterScoreUpdate(total, rank) {
    const stamp = $('res-rank');
    stamp.textContent = rank;
    stamp.dataset.rank = rank;
    if (!reducedMotion) { stamp.classList.remove('pop'); void stamp.offsetWidth; stamp.classList.add('pop'); }
    countUp($('res-total'), total);

    const nowHistory = Store.history();
    const gain = Game.xpOf(nowHistory) - Game.xpOf(beforeHistory);
    const lvBefore = Game.levelInfo(Game.xpOf(beforeHistory));
    const lvAfter = Game.levelInfo(Game.xpOf(nowHistory));
    $('res-xp').innerHTML =
      `<span class="pill" role="button" tabindex="0" data-help="xp" data-tip="今回もらったXPです。得点+初挑戦ボーナス+Sランクボーナス。クリックで詳しい説明">+${gain} XP</span>` +
      (lvAfter.level > lvBefore.level ? `<span class="lvup">🎊 レベルアップ! Lv.${lvAfter.level}「${esc(lvAfter.title)}」</span>` : '');
    const isBest = hadBestBefore !== null && total > hadBestBefore;
    $('res-new-best').hidden = !isBest;
    const big = rank === 'S' || rank === 'A' || isBest || lvAfter.level > lvBefore.level;
    if (big && !celebrated) { celebrated = true; confetti(rank === 'S' ? 120 : 70); }
    renderMe();
    announceBadges();
  }

  // ---- AI ----
  async function postJson(url, body) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      aiProbe = await probeAi();
      refreshAiStatus(false);
      throw new Error(aiProbe.state === 'file' ? 'ファイルを直接開いているため、AIサーバーに接続できません(上の案内を参照)。' : 'AIサーバーに接続できません(上の案内を参照)。');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || (res.status === 404 ? 'AIサーバーではなく普通のWebサーバーで開いているようです。' : 'AI採点に失敗しました。'));
    return data;
  }

  function updateHistory(at, patch) {
    const h = Store.history();
    const e = h.find((x) => x.at === at);
    if (e) { Object.assign(e, patch); Store.saveHistory(h); }
  }

  async function runAiReview(sc, minutes, formal, at) {
    $('ai-card').hidden = false;
    $('ai-badge').textContent = '';
    $('ai-body').innerHTML = '<p class="spin">AIが議事録を確認しています…(10〜30秒ほど)</p>';
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
        ${ai.advice.length ? `<h3>💡 アドバイス</h3><ul class="advice">${ai.advice.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}`;
      $('res-final').hidden = false;
      $('res-final').innerHTML = `形式 ${formal.total} ${ai.bonus >= 0 ? '+' : '−'} AIボーナス ${Math.abs(ai.bonus)} = 最終 <strong>${final}点(${rankOf(final)})</strong>`;
      updateHistory(at, { total: final, rank: rankOf(final), ai: true, formal: formal.total, bonus: ai.bonus });
      afterScoreUpdate(final, rankOf(final));
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
      $('btn-model-ai').hidden = !(aiProbe && aiProbe.state === 'ok');
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

  // ---- 議事録テンプレート ----
  function renderTplSelect(selectId) {
    const sel = $('tpl-select');
    const keep = selectId || sel.value || tplData.defaultId || 'builtin-standard';
    const mine = tplData.items;
    sel.innerHTML =
      `<optgroup label="組み込み">${Templates.BUILTIN.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</optgroup>` +
      `<optgroup label="マイテンプレート">${mine.length
        ? mine.map((t) => `<option value="${t.id}">${esc(t.name)}${tplData.defaultId === t.id ? ' ★既定' : ''}</option>`).join('')
        : '<option disabled>(まだありません)</option>'}</optgroup>`;
    sel.value = Templates.find(tplData, keep) ? keep : 'builtin-standard';
  }

  function insertTemplate(id) {
    const t = Templates.find(tplData, id);
    if (!t) return;
    const ta = $('minutes');
    const r = Templates.insertInto(ta.value, t.body, ta.selectionStart);
    ta.value = r.text;
    ta.focus();
    ta.setSelectionRange(r.caret, r.caret);
    updateCount();
  }

  function renderTplList() {
    const row = (t) =>
      `<button type="button" class="tpl-item ${t.id === tplEditingId ? 'sel' : ''}" data-id="${t.id}"><span>${esc(t.name)}</span>${tplData.defaultId === t.id ? '<small>★既定</small>' : ''}</button>`;
    $('tpl-list').innerHTML =
      '<h4>組み込み(変更不可)</h4>' + Templates.BUILTIN.map(row).join('') +
      '<h4>マイテンプレート</h4>' + (tplData.items.length ? tplData.items.map(row).join('') : '<p class="hint">まだありません。右で作って保存できます。</p>');
    $('tpl-list').querySelectorAll('.tpl-item').forEach((el) => el.addEventListener('click', () => loadTplEditor(el.dataset.id)));
  }

  function loadTplEditor(id, preset) {
    tplEditingId = id;
    const t = id ? Templates.find(tplData, id) : null;
    const builtin = !!(t && t.builtin);
    $('tpl-name').value = preset ? preset.name : t ? (builtin ? t.name + '(コピー)' : t.name) : '';
    $('tpl-body').value = preset ? preset.body : t ? t.body : '';
    $('tpl-default').checked = !!(t && !builtin && tplData.defaultId === t.id);
    $('tpl-delete').disabled = !t || builtin;
    $('tpl-note').textContent = builtin
      ? '組み込みテンプレートは変更できません。保存すると、自分用のコピーとして追加されます。'
      : t ? '内容を書き換えて「保存」で上書きできます。' : '名前と内容を入力して「保存」すると、マイテンプレートに追加されます。';
    if (builtin) tplEditingId = null; // 保存は常に新規コピー
    renderTplList();
    if (builtin) $('tpl-list').querySelector(`[data-id="${id}"]`)?.classList.add('sel');
  }

  function openTplDialog(preset) {
    tplData = Store.templates();
    loadTplEditor(null, preset);
    if (typeof $('tpl-dialog').showModal === 'function') $('tpl-dialog').showModal(); else $('tpl-dialog').setAttribute('open', '');
  }

  function saveTpl() {
    const body = $('tpl-body').value;
    if (!body.trim()) { alert('テンプレートの内容が空です。'); return; }
    const r = Templates.save(tplData, { id: tplEditingId, name: $('tpl-name').value, body });
    tplData = $('tpl-default').checked ? Templates.setDefault(r.data, r.id) : r.data.defaultId === r.id ? Templates.setDefault(r.data, null) : r.data;
    if (!Store.saveTemplates(tplData)) { alert('保存できませんでした(ブラウザの保存領域が使えない可能性があります)。'); return; }
    tplEditingId = r.id;
    renderTplSelect(r.id);
    loadTplEditor(r.id);
    toast('💾 テンプレートを保存しました');
  }

  function deleteTpl() {
    const t = tplEditingId && Templates.find(tplData, tplEditingId);
    if (!t || t.builtin || !confirm(`「${t.name}」を削除しますか?`)) return;
    tplData = Templates.remove(tplData, tplEditingId);
    Store.saveTemplates(tplData);
    renderTplSelect();
    loadTplEditor(null);
    toast('🗑 テンプレートを削除しました');
  }

  // ---- イベント ----
  $('btn-play').addEventListener('click', play);
  $('btn-stop').addEventListener('click', () => { stopSpeech(); updatePlayUi(); $('now-speaking').textContent = '停止しました。'; setSubtitle(''); });
  $('opt-subtitle').addEventListener('change', () => { if (!speaking) setSubtitle(''); });
  $('btn-submit').addEventListener('click', submit);
  $('minutes').addEventListener('input', updateCount);
  $('btn-tpl-insert').addEventListener('click', () => insertTemplate($('tpl-select').value));
  $('btn-tpl-manage').addEventListener('click', () => openTplDialog());
  $('btn-tpl-save').addEventListener('click', () => {
    const body = $('minutes').value;
    openTplDialog(body.trim() ? { name: '', body } : null);
  });
  $('tpl-save').addEventListener('click', saveTpl);
  $('tpl-delete').addEventListener('click', deleteTpl);
  $('tpl-new').addEventListener('click', () => loadTplEditor(null));
  $('btn-back').addEventListener('click', () => { stopSpeech(); showStages(currentLevel); });
  $('btn-home').addEventListener('click', () => { historyAt = null; showStages(currentLevel); });
  $('btn-stages-back').addEventListener('click', () => { renderSelect(); show('select'); });
  $('btn-retry').addEventListener('click', () => start(scenario));
  $('btn-model').addEventListener('click', () => {
    if (!$('model-body').hidden) { $('model-body').hidden = true; $('btn-model').textContent = '模範解答を見る'; return; }
    showModelAnswer(false);
  });
  $('btn-model-ai').addEventListener('click', () => showModelAnswer(true));
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

  // ---- ルール説明(「?」やチップのクリックで開く) ----
  let helpBuilt = false;
  function openHelp(topic) {
    const body = $('help-body');
    if (!helpBuilt) {
      body.innerHTML = Help.sections().map((sec) =>
        `<details id="help-${sec.id}"><summary><span aria-hidden="true">${sec.icon}</span> ${esc(sec.title)}</summary><div class="hbody">${sec.html}</div></details>`
      ).join('');
      helpBuilt = true;
    }
    body.querySelectorAll('details').forEach((d) => { d.open = false; });
    const target = body.querySelector('#help-' + (topic || 'howto')) || body.querySelector('details');
    target.open = true;
    const dlg = $('help-dialog');
    if (!dlg.open) { if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', ''); }
    tip.hide();
    target.scrollIntoView({ block: 'start' });
  }

  // ---- ツールチップ(マウスを乗せる/キーボードでフォーカスすると説明を表示) ----
  const tip = (function () {
    const el = $('tip');
    let current = null;
    function show(target) {
      const text = target.dataset.tip;
      if (!text || target.closest('dialog')) return;
      current = target;
      el.textContent = text;
      el.hidden = false;
      const r = target.getBoundingClientRect();
      const w = el.offsetWidth, h = el.offsetHeight;
      const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 8), window.innerWidth - w - 8);
      const below = r.bottom + 8 + h <= window.innerHeight - 8;
      el.style.left = left + 'px';
      el.style.top = (below ? r.bottom + 8 : Math.max(8, r.top - h - 8)) + 'px';
    }
    function hide() { current = null; el.hidden = true; }
    document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) show(t); else if (current) hide(); });
    document.addEventListener('focusin', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) show(t); });
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    // タッチ端末: タップで表示し、別の場所をタップすると消える
    document.addEventListener('click', (e) => { if (!(e.target.closest && e.target.closest('[data-tip]'))) hide(); });
    return { hide };
  })();

  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-help]');
    if (t) { e.preventDefault(); openHelp(t.dataset.help); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target.closest && e.target.closest('[data-help]');
    if (t && t.tagName !== 'BUTTON') { e.preventDefault(); openHelp(t.dataset.help); }
  });

  renderSelect();
  show('select');
  announceBadges();
  refreshAiStatus(false);
})();
