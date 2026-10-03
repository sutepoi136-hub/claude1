/* 議事録クエスト — 画面(ホーム / シリーズ / 会議 / 結果)と、ダイアログ・演出。
 * 採点やゲームのロジックは js/core/、物語とシナリオは js/data/ にある。ここは表示と操作だけを受け持つ。 */
(function (root) {
  'use strict';
  const GQ = root.GQ;
  const { Data, Scorer, Game, Store, Templates, Speech, Sfx, Help } = GQ;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reducedMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const MAX_PLAYS = 2;
  const RANK_COLOR = { S: '#e09b00', A: '#e8590c', B: '#2f9e44', C: '#1c7ed6', D: '#868e96' };
  const LV_CLASS = { 初級: 'l1', 中級: 'l2', 上級: 'l3' };
  const TYPE_ORDER = ['decision', 'todo', 'pending', 'issue', 'info', 'next'];
  const TYPE_LABEL = { decision: '決定事項', todo: 'ToDo', pending: '保留', issue: '課題・リスク', info: '共有事項', next: '次回' };

  // ---------------------------------------------------------------- 設定・プレイヤー
  let settings = Store.settings();
  Sfx.setEnabled(settings.sfx);
  const player = () => ({ name: (settings.playerName || '').trim() || 'あなた', reading: (settings.playerReading || '').trim() || (settings.playerName || '').trim() || 'あなた' });
  const ctx = () => ({ player: player() });
  const fill = (text) => Data.fill(text, player());
  function saveSettings(patch) {
    settings = { ...settings, ...patch };
    Store.saveSettings(settings);
    Sfx.setEnabled(settings.sfx);
  }

  // ---------------------------------------------------------------- 汎用
  function toast(msg, ms = 3800) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 500);
  }
  function confetti(count = 70) {
    if (reducedMotion) return;
    const colors = ['#ffc42e', '#ff7a3d', '#ff5d8f', '#2f9e44', '#1c7ed6', '#14b8a6'];
    const box = $('confetti');
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.style.cssText = `left:${Math.random() * 100}vw;--c:${colors[i % colors.length]};--x:${(Math.random() - 0.5) * 220}px;--d:${2.4 + Math.random() * 2}s;--delay:${Math.random() * 0.6}s`;
      box.appendChild(p);
    }
    setTimeout(() => { box.innerHTML = ''; }, 5600);
  }
  function countUp(el, to) {
    if (reducedMotion) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const parseDate = (s) => s.split('-').map(Number);
  function dateLabel(seriesId, date, withYear = true) {
    const [y, m, d] = parseDate(date);
    if (Data.series[seriesId] && Data.series[seriesId].calendar === '魔王暦') return withYear ? `魔王暦${y}年${m}月${d}日` : `${m}/${d}`;
    const wd = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
    return withYear ? `${y}年${m}月${d}日(${wd})` : `${m}/${d}(${wd})`;
  }
  const epTag = (ep) => `${Data.series[ep.series].name} 第${ep.no}話`;
  const lvBadge = (level) => `<span class="lvl ${LV_CLASS[level] || ''}">${esc(level)}</span>`;
  function openDialog(id) {
    const d = $(id);
    if (!d.open) { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); }
    tip.hide();
  }
  const fmtSec = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ---------------------------------------------------------------- ヘッダー(レベル・連続日数)
  function renderMe() {
    const h = Store.history();
    const lv = Game.levelInfo(Game.xpOf(h));
    const streak = Game.streakOf(h);
    $('me').innerHTML =
      `<button type="button" class="lv" data-help="xp" data-tip="${esc(`あと${lv.next - lv.xp}XPでLv.${lv.level + 1}。クリックで説明`)}"><span class="t"><span>Lv.${lv.level} ${esc(lv.title)}</span><span>${lv.xp - lv.floor}/${lv.next - lv.floor}</span></span><span class="bar"><i style="width:${lv.pct}%"></i></span></button>` +
      `<button type="button" class="chip" data-help="streak" data-tip="連続プレイ日数。毎日1回以上提出すると増えます">🔥 ${streak}日</button>`;
  }

  // ---------------------------------------------------------------- 画面の切り替え(URLの#で管理し、ブラウザの「戻る」に対応)
  const VIEWS = ['home', 'series', 'play', 'result'];
  let currentView = 'home';
  function show(view) {
    VIEWS.forEach((v) => { $('view-' + v).hidden = v !== view; });
    currentView = view;
    root.scrollTo(0, 0);
  }
  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }
  function route() {
    const [kind, id] = location.hash.replace(/^#\/?/, '').split('/');
    if (currentView === 'play' && !(kind === 'p' && session && session.ep.id === id)) leavePlay();
    if (currentView === 'result') clearEffects();
    if (kind === 's' && Data.series[id]) renderSeries(id);
    else if (kind === 'p' && Data.byId(id)) startPlay(Data.byId(id));
    else if (kind === 'r' && lastResult && lastResult.ep.id === id) renderResult();
    else if (kind === 'r' && Data.byId(id)) go('#/s/' + Data.byId(id).series);
    else renderHome();
  }

  // ---------------------------------------------------------------- ホーム
  function continueTarget(h) {
    const last = h.length ? Data.byId(h[h.length - 1].episodeId) : null;
    const order = Data.seriesList().map((s) => s.id);
    if (last) order.sort((a, b) => (a === last.series ? -1 : b === last.series ? 1 : 0));
    for (const sid of order) { const n = Game.nextEpisode(sid, h, settings); if (n) return n; }
    return null;
  }

  function averageAxes(h, n = 10) {
    const list = h.filter((x) => x.axes).slice(-n);
    if (!list.length) return null;
    const avg = {};
    Scorer.AXES.forEach((a) => { avg[a.id] = list.reduce((s, x) => s + (x.axes[a.id] || 0), 0) / list.length; });
    return avg;
  }

  function radarSvg(values, compare) {
    const axes = Scorer.AXES;
    const W = 300, H = 260, cx = 150, cy = 136, R = 92;
    const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const poly = (vals) => axes.map((a, i) => pt(i, R * Math.max(0.02, Math.min(1, (vals[a.id] || 0) / Scorer.WEIGHT[a.id])))).map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
    const rings = [0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${axes.map((a, i) => pt(i, R * k).join(',')).join(' ')}" fill="none" stroke="var(--line)" stroke-width="1.5"/>`).join('');
    const spokes = axes.map((a, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)" stroke-width="1.5"/>`; }).join('');
    const labels = axes.map((a, i) => { const [x, y] = pt(i, R + 22); return `<text x="${x}" y="${y + 4}" text-anchor="middle">${a.name}</text>`; }).join('');
    return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="5つの観点のバランス">${rings}${spokes}
      ${compare ? `<polygon points="${poly(compare)}" fill="none" stroke="#86664c" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
      ${values ? `<polygon points="${poly(values)}" fill="rgba(226,83,27,.22)" stroke="var(--primary)" stroke-width="3" stroke-linejoin="round"/>` : ''}
      ${labels}</svg>`;
  }

  function chartSvg(values) {
    const v = values.slice(-20);
    if (v.length < 2) return '<p class="hint">2回以上提出すると、得点の推移グラフが出ます。</p>';
    const W = 600, H = 130, pad = 14;
    const pts = v.map((y, i) => [pad + (i * (W - pad * 2)) / (v.length - 1), H - pad - (y / 100) * (H - pad * 2)]);
    const clearY = H - pad - (Scorer.CLEAR / 100) * (H - pad * 2);
    return `<svg id="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="得点の推移">
      <line x1="0" x2="${W}" y1="${clearY}" y2="${clearY}" stroke="#2b8a3e" stroke-dasharray="6 6" stroke-width="1.5" opacity=".6"/>
      <polyline fill="none" stroke="var(--primary)" stroke-width="3" stroke-linejoin="round" points="${pts.map((p) => p.join(',')).join(' ')}"/>
      ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--accent)" stroke="var(--primary)" stroke-width="2"/>`).join('')}</svg>`;
  }

  function seriesCard(s, h) {
    const prog = Game.seriesProgress(s.id, h);
    const next = Game.nextEpisode(s.id, h, settings);
    const pct = prog.total ? Math.round((prog.cleared / prog.total) * 100) : 0;
    const nextHtml = next
      ? `<div class="next">次の会議: <b>第${next.no}話「${esc(next.title)}」</b> ${lvBadge(next.level)}</div>`
      : `<div class="next">🎉 配信中の話はすべてクリア!続きの話をお楽しみに。</div>`;
    return `<article class="scard ${s.theme}">
      <div class="cover"><span class="big-ico" aria-hidden="true">${s.icon}</span><small>${esc(s.name)}</small><h3>${esc(s.title)}</h3></div>
      <div class="body">
        <p class="tagline">${esc(s.tagline)}</p>
        <div class="prog"><span>クリア ${prog.cleared}/${prog.total}話</span><span class="pbar"><i style="width:${pct}%"></i></span><span class="muted">全${s.plan.length}話中 ${prog.total}話 配信中</span></div>
        ${nextHtml}
        <div class="btns">
          ${next ? `<button type="button" class="btn primary" data-action="play" data-id="${next.id}">▶ 第${next.no}話へ</button>` : ''}
          <button type="button" class="btn" data-action="series" data-id="${s.id}">📜 話の一覧・登場人物</button>
        </div>
      </div></article>`;
  }

  function renderHome() {
    renderMe();
    const h = Store.history();
    const cont = continueTarget(h);
    const avg = averageAxes(h);
    const earned = new Set(Game.badgesOf(h, Store.badges()));
    const recent = h.slice().reverse().slice(0, 8);
    $('view-home').innerHTML = `
      <div class="hero">
        <div>
          <h1>会議を聞いて、議事録で決着をつけろ。</h1>
          <p>決まったこと。まだ決まっていないこと。誰が、何を、いつまでに。<br>2つの物語の会議を記録して、PMOの「書く力」を鍛えよう。</p>
          <div class="btns">
            ${cont ? `<button type="button" class="btn primary big" data-action="play" data-id="${cont.id}">▶ 続きから: ${esc(epTag(cont))}「${esc(cont.title)}」</button>` : ''}
            <button type="button" class="btn" data-help="howto">はじめての方へ(遊び方)</button>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">🎧</div>
      </div>
      <h2 class="sec">📚 物語を選ぶ</h2>
      <div class="series-grid">${Data.seriesList().map((s) => seriesCard(s, h)).join('')}</div>
      <h2 class="sec">📈 あなたの記録 <button type="button" class="help" data-help="scoring" aria-label="採点の説明">?</button></h2>
      <div class="stats">
        <div class="card"><h3>直近10回のバランス</h3>${avg ? radarSvg(avg) : '<p class="hint">提出すると、5つの観点(網羅・分類・ToDo・正確性・構成)のバランスが出ます。</p>'}</div>
        <div class="card"><h3>得点の推移 <span class="badge">点線=クリア(${Scorer.CLEAR}点)</span></h3>${chartSvg(h.map((x) => x.total))}
          ${recent.length ? recent.map((x) => {
            const ep = Data.byId(x.episodeId);
            return `<div class="h-item"><span>${new Date(x.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ${ep ? esc(epTag(ep) + '「' + ep.title + '」') : esc(x.episodeId)}${x.assist ? ' <span class="badge" data-tip="字幕ありで遊んだ回">字幕</span>' : ''}</span><strong style="color:${RANK_COLOR[x.rank]}">${x.rank} ${x.total}点</strong></div>`;
          }).join('') : '<p class="hint">まだ記録がありません。最初の会議に挑戦しましょう!</p>'}
        </div>
      </div>
      <h2 class="sec">🏅 バッジ <span class="badge">${earned.size}/${Game.BADGES.length}</span> <button type="button" class="help" data-help="badges" aria-label="バッジの説明">?</button></h2>
      <div class="badges">${Game.BADGES.map((b) => `<div class="bd ${earned.has(b.id) ? 'earned' : 'locked'}"><div class="i">${earned.has(b.id) ? b.icon : '🔒'}</div><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join('')}</div>`;
    show('home');
  }

  // ---------------------------------------------------------------- シリーズ(話の一覧・登場人物)
  function knownCast(s, h) {
    const known = new Set();
    Data.episodesOf(s.id).forEach((ep) => { if (Game.isUnlocked(ep, h, settings)) ep.cast.forEach((n) => known.add(n)); });
    return known;
  }

  function renderSeries(id) {
    renderMe();
    const s = Data.series[id];
    const h = Store.history();
    const best = Game.bestByEpisode(h);
    const cleared = Game.clearedSet(h);
    const next = Game.nextEpisode(id, h, settings);
    const known = knownCast(s, h);
    const epCard = (p) => {
      const ep = Data.episodesOf(id).find((e) => e.no === p.no);
      const date = dateLabel(id, p.date, false);
      if (!ep) {
        return `<div class="ep planned"><div class="no">第<b>${p.no}</b>話</div><div><div class="ttl">${esc(p.title)}</div><div class="meta">${date} ・ 準備中(あらすじで補われます)</div></div></div>`;
      }
      const open = Game.isUnlocked(ep, h, settings);
      const b = best[ep.id];
      const isClear = cleared.has(ep.id);
      const status = !open ? '🔒 前の話をクリアすると解放'
        : b ? `<span class="medal" style="--rc:${RANK_COLOR[b.rank]}">${b.rank}</span> 自己ベスト ${b.total}点${isClear ? ' <span class="ok">✔ クリア</span>' : `(あと${Scorer.CLEAR - b.total}点でクリア)`}`
          : '<span class="badge" style="background:#fff3c4">NEW</span>';
      return `<div class="ep ${isClear ? 'cleared' : open ? 'open' : 'locked'}">
        <div class="no">第<b>${ep.no}</b>話</div>
        <div><div class="ttl">${esc(ep.title)}${ep.finale ? ' <span class="badge">最終話</span>' : ''}</div>
          <div class="meta">${date} ・ ${lvBadge(ep.level)} ・ 参加 ${ep.cast.length}人 ・ ${status}</div></div>
        <div class="side">
          ${open ? `<button type="button" class="btn ${b ? '' : 'primary'} small" data-action="play" data-id="${ep.id}">${b ? '再挑戦' : '挑戦する'}</button>` : '<button type="button" class="btn small" disabled>🔒</button>'}
          ${isClear ? `<button type="button" class="btn small" data-action="story" data-id="${ep.id}">📖 その後</button>` : ''}
        </div></div>`;
    };
    const castHtml = Object.entries(s.cast).map(([name, c]) => {
      if (!known.has(name)) return `<div class="person unknown ${s.theme}"><div class="av">?</div><div><b>???</b><small>物語が進むと登場します</small></div></div>`;
      return `<div class="person ${s.theme}" style="--c:${c.color}"><div class="av" aria-hidden="true">${esc(c.avatar)}</div><div><b>${esc(c.full)}</b><small>${esc(c.org)} ・ ${esc(c.role)}</small><p>${esc(c.desc)}</p></div></div>`;
    }).join('');
    $('view-series').innerHTML = `
      <div class="back"><button type="button" class="btn small" data-action="home">← ホームへ</button></div>
      <div class="series-head ${s.theme}">
        <span class="big-ico" aria-hidden="true">${s.icon}</span>
        <small>${esc(s.name)}</small>
        <h2>${esc(s.title)}</h2>
        <p>${esc(s.tagline)}</p>
        <div class="btns">
          <button type="button" class="btn" data-action="prologue" data-id="${s.id}">📜 プロローグを読む</button>
          ${next ? `<button type="button" class="btn" data-action="play" data-id="${next.id}">▶ 第${next.no}話「${esc(next.title)}」へ</button>` : ''}
        </div>
      </div>
      ${s.chapters.map((ch) => `<section class="chapter">
        <div class="chapter-head"><h3>第${ch.no}章 ${esc(ch.title)}</h3>${lvBadge(ch.level)}<span class="muted">${esc(ch.period)} — ${esc(ch.summary)}</span></div>
        <div class="timeline">${s.plan.filter((p) => p.chapter === ch.no).map(epCard).join('')}</div></section>`).join('')}
      <h2 class="sec">👥 登場人物</h2>
      <p class="hint" style="margin-bottom:8px">あなた: ${esc(s.player.role)}。${esc(s.player.note)}</p>
      <div class="cast-grid">${castHtml}</div>`;
    show('series');
  }

  // ---------------------------------------------------------------- 会議(プレイ)
  let session = null;
  let clockTimer = null;
  let saveTimer = null;
  let tplData = Store.templates();

  function peopleOf(ep) {
    const s = Data.series[ep.series];
    return Object.fromEntries(ep.cast.map((n) => [n, s.cast[n]]));
  }
  // 途中参加の人(台本で @join より前に発言がない人)
  function lateJoiners(ep) {
    const late = new Set();
    const spoke = new Set();
    ep.script.forEach(([who, arg]) => {
      if (who === '@join' && !spoke.has(arg)) late.add(arg);
      else if (who.charAt(0) !== '@') spoke.add(who);
    });
    return late;
  }

  function leavePlay() {
    if (!session) return;
    if (session.speech) session.speech.stop();
    Speech.stopAll();
    clearInterval(clockTimer);
    saveDraftNow();
    session = null;
  }

  function startPlay(ep) {
    const h = Store.history();
    if (!Game.isUnlocked(ep, h, settings)) {
      toast('🔒 この話は、ひとつ前の話をクリアすると解放されます');
      go('#/s/' + ep.series);
      return;
    }
    leavePlay();
    renderMe();
    const s = Data.series[ep.series];
    session = { ep, s, playsLeft: MAX_PLAYS, assist: false, heard: false, endedAt: null, elapsed: 0, speech: null, late: lateJoiners(ep) };
    const people = peopleOf(ep);
    const me = player();
    const meTile = s.theme === 'maou'
      ? { name: '書記官', role: 'あなた(記録)', avatar: '🪶', color: '#e8b84a' }
      : { name: me.name, role: 'PMO・あなた(議事録)', avatar: '✍️', color: '#e2531b' };
    const totalLen = ep.script.reduce((n, l) => n + (l[0].charAt(0) === '@' ? 0 : l[1].length), 0);

    $('view-play').innerHTML = `
      <div class="back"><button type="button" class="btn small" data-action="series" data-id="${s.id}">← ${esc(s.name)}の一覧へ</button></div>
      <div class="play-head">${lvBadge(ep.level)}<span class="badge">${esc(epTag(ep))}</span><h2>${esc(ep.title)}</h2></div>
      <details class="card brief" open>
        <summary>📋 ブリーフィング(会議の前に読む)</summary>
        <div class="synopsis">${esc(fill(ep.synopsis))}</div>
        <dl class="minfo">
          <dt>会議</dt><dd>${esc(ep.meeting.name)}</dd>
          <dt>日時</dt><dd>${esc(dateLabel(ep.series, ep.meeting.date))} ${esc(ep.meeting.time)}</dd>
          <dt>場所</dt><dd>${esc(ep.meeting.place)}</dd>
          <dt>参加者</dt><dd><div class="people">${ep.cast.map((n) => `<span>${esc(n)}(${esc(people[n].role)})${session.late.has(n) ? ' ※途中参加' : ''}</span>`).join('')}<span>${esc(meTile.name)}(${esc(meTile.role)})</span></div></dd>
          <dt>目安</dt><dd>約${Math.max(1, Math.round(totalLen / 6.5 / 60))}分 ・ 要点${ep.points.length}個 ・ 再生は${MAX_PLAYS}回まで</dd>
        </dl>
        <b>🎯 記録のポイント</b>
        <ul class="focus">${ep.focus.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      </details>

      <div class="room room--${s.theme}" id="room">
        ${s.theme === 'maou' ? '<span class="candle l" aria-hidden="true">🕯️</span><span class="candle r" aria-hidden="true">🕯️</span>' : ''}
        <div class="room-bar"><span>${s.theme === 'maou' ? '⚜' : '📹'} ${esc(ep.meeting.name)}</span><span class="rec" id="rec"><i></i><span id="clock">00:00</span></span></div>
        <div class="tiles" id="tiles">
          ${ep.cast.map((n) => `<div class="tile ${session.late.has(n) ? 'away' : ''}" data-name="${esc(n)}" style="--c:${people[n].color}">
            <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
            <div class="av" aria-hidden="true">${esc(people[n].avatar)}</div><div class="nm">${esc(n)}</div><div class="rl">${esc(people[n].role)}</div></div>`).join('')}
          <div class="tile me-tile" style="--c:${meTile.color}"><div class="av" aria-hidden="true">${meTile.avatar}</div><div class="nm">${esc(meTile.name)}</div><div class="rl">${esc(meTile.role)}</div></div>
        </div>
        <div class="caption" id="caption" aria-live="off"><span class="who"></span><span class="txt">「会議を始める」を押すと、会議が始まります。</span></div>
        <div class="tl" id="tl" aria-hidden="true">${ep.script.map((l, i) => l[0].charAt(0) === '@'
          ? `<i class="ev" data-i="${i}"></i>`
          : `<i data-i="${i}" style="--w:${Math.max(8, l[1].length)};--c:${people[l[0]] ? people[l[0]].color : '#999'}"></i>`).join('')}</div>
        <div class="controls">
          <button type="button" class="btn primary" id="btn-start">▶ 会議を始める</button>
          <button type="button" class="btn" id="btn-pause" hidden data-tip="Esc キーでも一時停止・再開できます">⏸ 一時停止</button>
          <button type="button" class="btn" id="btn-resume" hidden>▶ 再開</button>
          <button type="button" class="btn" id="btn-stop" hidden data-tip="会議を最後まで聞かずに終えます(再生回数は1回使います)">⏹ 終了</button>
          <span class="plays" id="plays" tabindex="0" data-tip="残りの再生回数。1つの会議につき${MAX_PLAYS}回まで"></span>
          <span class="spacer"></span>
          <label class="opt" data-tip="話す速さ(⚙設定でも変えられます)">速さ <select class="sel" id="sel-rate">${[0.8, 0.9, 1, 1.1, 1.25, 1.4].map((r) => `<option value="${r}" ${Number(settings.rate) === r ? 'selected' : ''}>${r}倍</option>`).join('')}</select></label>
          <label class="opt" data-tip="発言を文字でも表示します。聞き取りやすくなる代わりに、今回のXPは半分になります"><input type="checkbox" id="opt-sub"> 字幕</label>
        </div>
        <p class="room-note" id="voice-note"></p>
      </div>

      <div class="note-tabs" role="tablist" aria-label="メモと議事録の切り替え">
        <button type="button" class="btn small" role="tab" data-tab="memo" aria-selected="false">📝 メモ</button>
        <button type="button" class="btn small" role="tab" data-tab="minutes" aria-selected="true">📓 議事録</button>
      </div>
      <div class="notes">
        <div class="pane memo off" data-pane="memo">
          <div class="pane-head"><b>📝 メモ</b><small>採点されません。聞きながら走り書き</small></div>
          <textarea id="memo" placeholder="例)&#10;高木 社長に確認→13日&#10;ACW 4分半&#10;KPI 30% 30% 90%&#10;…"></textarea>
        </div>
        <div class="pane paper" data-pane="minutes">
          <div class="pane-head"><b>📓 議事録(提出用)</b><small id="char-count">0文字</small></div>
          <div class="tpl-bar">
            <select id="tpl-select" aria-label="テンプレートを選ぶ"></select>
            <button type="button" class="btn small" id="btn-tpl-insert" data-tip="選んだテンプレートを入れます(空のときは全体を置き換え)">挿入</button>
            <button type="button" class="btn small" id="btn-tpl-save" data-tip="いまの内容を、自分のテンプレートとして保存">💾 保存</button>
            <button type="button" class="btn small" id="btn-tpl-manage" data-tip="テンプレートの編集・削除・自動挿入の設定">⚙ 管理</button>
            <button type="button" class="help" data-help="templates" aria-label="テンプレートの説明">?</button>
          </div>
          <textarea id="minutes" placeholder="会議の議事録をまとめましょう。テンプレートを「挿入」すると見出しがそろいます。"></textarea>
        </div>
      </div>
      <div class="submit-bar">
        <span class="save-state" id="save-state">書いた内容は自動で保存されます</span>
        <span class="btns">
          <button type="button" class="btn" id="btn-clear">白紙に戻す</button>
          <button type="button" class="btn primary big" id="btn-submit">✅ 提出して採点</button>
        </span>
      </div>`;

    // 下書きの復元 / 既定テンプレート
    tplData = Store.templates();
    const draft = Store.draft(ep.id);
    const def = tplData.defaultId && Templates.find(tplData, tplData.defaultId);
    $('minutes').value = draft ? draft.minutes || '' : def ? def.body : '';
    $('memo').value = draft ? draft.memo || '' : '';
    if (draft && (draft.minutes || draft.memo)) toast('📝 書きかけの議事録を復元しました');
    renderTplSelect(ep.series === 'maou' && !tplData.defaultId ? 'builtin-maou' : null);
    updateCount();
    updatePlays();
    wirePlay();
    show('play');
    Speech.ready().then(() => { if (session && session.ep === ep) updateVoiceNote(); });
    updateVoiceNote();
  }

  function updateVoiceNote() {
    if (!session) return;
    const vs = Speech.voices();
    let msg;
    if (!Speech.supported) msg = '⚠ このブラウザは音声読み上げに対応していません。字幕だけで会議が進みます(字幕モード)。';
    else if (!vs.length) msg = '⚠ 日本語の音声が見つかりません。字幕だけで会議が進みます。Microsoft Edge や Chrome でお試しください。';
    else {
      const v = Speech.assign(peopleOf(session.ep));
      const natural = vs.some((x) => /natural|online|neural/i.test(x.name));
      msg = `🔈 日本語の音声 ${vs.length}種類を使用${v.shared ? '(足りない分は声の高さ・速さで区別)' : ''}。${natural ? '' : 'Microsoft Edge だと、より自然な声で聞けます。'}`;
    }
    $('voice-note').textContent = msg;
  }

  function updatePlays() {
    if (!session) return;
    $('plays').innerHTML = Array.from({ length: MAX_PLAYS }, (_, i) => `<span class="${i < session.playsLeft ? '' : 'off'}">🎧</span>`).join('') + `<span class="sr">残り${session.playsLeft}回</span>`;
    const st = session.speech ? session.speech.state : 'idle';
    const playing = st === 'playing';
    const paused = st === 'paused';
    $('btn-start').hidden = playing || paused;
    $('btn-start').disabled = session.playsLeft <= 0;
    $('btn-start').textContent = session.playsLeft <= 0 ? '再生回数を使い切りました' : session.playsLeft < MAX_PLAYS ? `▶ もう一度聞く(残り${session.playsLeft}回)` : '▶ 会議を始める';
    $('btn-pause').hidden = !playing;
    $('btn-resume').hidden = !paused;
    $('btn-stop').hidden = !(playing || paused);
    $('rec').classList.toggle('on', playing);
  }

  function setSpeaker(name) {
    document.querySelectorAll('#tiles .tile[data-name]').forEach((t) => t.classList.toggle('speaking', t.dataset.name === name));
  }
  function setCaption(name, text) {
    const cap = $('caption');
    const people = peopleOf(session.ep);
    cap.style.setProperty('--c', name && people[name] ? people[name].color : '#555');
    cap.querySelector('.who').textContent = name ? `${name}:` : '';
    cap.querySelector('.txt').textContent = text;
  }
  function markTimeline(i) {
    document.querySelectorAll('#tl i').forEach((el) => {
      const k = Number(el.dataset.i);
      el.classList.toggle('done', k < i);
      el.classList.toggle('now', k === i);
    });
  }
  function subtitlesOn() { return $('opt-sub').checked; }

  function startMeeting() {
    if (!session || session.playsLeft <= 0) return;
    const { ep, s } = session;
    if (session.speech) session.speech.stop();
    const vs = Speech.voices();
    const textOnly = !Speech.supported || !vs.length;
    if (textOnly) { $('opt-sub').checked = true; session.assist = true; }
    if (subtitlesOn()) session.assist = true;
    session.playsLeft--;
    session.heard = true;
    session.elapsed = 0;
    // 途中参加の人を、いったん未参加に戻す
    document.querySelectorAll('#tiles .tile[data-name]').forEach((t) => t.classList.toggle('away', session.late.has(t.dataset.name)));
    const me = player();
    session.speech = Speech.createPlayer({
      lines: ep.script,
      people: peopleOf(ep),
      readings: s.readings,
      playerName: me.name,
      playerReading: me.reading,
      rate: Number($('sel-rate').value) || 1,
      textOnly,
      onLine(i, [name, text]) {
        setSpeaker(name);
        markTimeline(i);
        const shown = subtitlesOn() ? fill(text) : '🔊 発言中……(字幕オフ)';
        setCaption(name, shown);
      },
      onEvent(i, [kind, name]) {
        markTimeline(i);
        setSpeaker(null);
        const tile = document.querySelector(`#tiles .tile[data-name="${CSS.escape(name)}"]`);
        if (kind === '@join') {
          if (tile) tile.classList.remove('away');
          Sfx.play(s.theme === 'maou' ? 'door' : 'join');
          setCaption(null, s.theme === 'maou' ? `——${name}が入室しました——` : `——${name}さんが会議に参加しました——`);
        } else if (kind === '@leave') {
          if (tile) tile.classList.add('away');
          Sfx.play(s.theme === 'maou' ? 'door' : 'leave');
          setCaption(null, s.theme === 'maou' ? `——${name}が退室しました——` : `——${name}さんが退出しました——`);
        }
      },
      onState() { updatePlays(); },
      onEnd() {
        setSpeaker(null);
        markTimeline(ep.script.length);
        session.endedAt = Date.now();
        Sfx.play('end');
        setCaption(null, session.playsLeft > 0 ? '会議が終わりました。議事録をまとめて提出しましょう(もう一度聞くこともできます)。' : '会議が終わりました。議事録をまとめて提出しましょう。');
        updatePlays();
        saveDraftNow();
      },
    });
    Sfx.play('start');
    setCaption(null, textOnly ? '字幕モードで会議を始めます……' : '会議を始めます……');
    session.speech.play();
    clearInterval(clockTimer);
    let last = performance.now();
    clockTimer = setInterval(() => {
      const now = performance.now();
      if (session && session.speech && session.speech.state === 'playing') session.elapsed += (now - last) / 1000;
      last = now;
      if (session) $('clock').textContent = fmtSec(session.elapsed);
    }, 500);
    updatePlays();
    // 狭い画面では、議事録の欄が見えるようにする
    if (root.innerWidth < 860) setTab('memo');
  }

  function togglePause() {
    if (!session || !session.speech) return;
    if (session.speech.state === 'playing') { session.speech.pause(); setSpeaker(null); setCaption(null, '⏸ 一時停止中(Esc か「再開」で、いまの発言の頭から再開します)'); }
    else if (session.speech.state === 'paused') session.speech.resume();
    updatePlays();
  }

  function stopMeeting() {
    if (!session || !session.speech) return;
    session.speech.stop();
    setSpeaker(null);
    session.endedAt = session.endedAt || Date.now();
    setCaption(null, '会議を終了しました。');
    updatePlays();
  }

  function setTab(name) {
    document.querySelectorAll('.note-tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('.notes [data-pane]').forEach((p) => p.classList.toggle('off', p.dataset.pane !== name));
  }

  function updateCount() { if ($('char-count')) $('char-count').textContent = `${$('minutes').value.length}文字`; }
  function saveDraftNow() {
    if (!session || !$('minutes')) return;
    const minutes = $('minutes').value;
    const memo = $('memo').value;
    Store.saveDraft(session.ep.id, minutes.trim() || memo.trim() ? { minutes, memo } : null);
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveDraftNow();
      const el = $('save-state');
      if (el) el.textContent = `✓ 自動保存しました(${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })})`;
    }, 600);
  }

  function wirePlay() {
    $('btn-start').addEventListener('click', startMeeting);
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-resume').addEventListener('click', togglePause);
    $('btn-stop').addEventListener('click', stopMeeting);
    $('sel-rate').addEventListener('change', (e) => {
      const r = Number(e.target.value) || 1;
      saveSettings({ rate: r });
      if (session && session.speech) session.speech.setRate(r);
    });
    $('opt-sub').addEventListener('change', (e) => {
      if (e.target.checked) {
        if (session) session.assist = true;
        toast('字幕オン: 今回のXPは半分になります');
      }
    });
    $('minutes').addEventListener('input', () => { updateCount(); scheduleSave(); });
    $('memo').addEventListener('input', scheduleSave);
    document.querySelectorAll('.note-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('btn-tpl-insert').addEventListener('click', () => insertTemplate($('tpl-select').value));
    $('btn-tpl-manage').addEventListener('click', () => openTplDialog());
    $('btn-tpl-save').addEventListener('click', () => { const body = $('minutes').value; openTplDialog(body.trim() ? { name: '', body } : null); });
    $('btn-clear').addEventListener('click', () => {
      if (!confirm('議事録とメモを白紙に戻しますか?')) return;
      $('minutes').value = '';
      $('memo').value = '';
      updateCount();
      saveDraftNow();
    });
    $('btn-submit').addEventListener('click', submit);
  }

  // ---------------------------------------------------------------- 提出・採点
  let lastResult = null;

  function submit() {
    if (!session) return;
    const text = $('minutes').value.trim();
    if (text.length < 20) { alert('議事録がまだ短すぎます。もう少し書いてから提出してください。'); return; }
    if (!session.heard && !confirm('まだ会議を聞いていません。このまま提出しますか?')) return;
    if (session.speech && session.speech.state === 'playing' && !confirm('会議の途中です。提出しますか?')) return;
    const { ep } = session;
    if (session.speech) session.speech.stop();
    clearInterval(clockTimer);

    const r = Scorer.evaluate(ep, text, ctx());
    const before = Store.history();
    const prevBest = Game.bestByEpisode(before)[ep.id];
    const wasCleared = Game.clearedSet(before).has(ep.id);
    const entry = {
      at: Date.now(), episodeId: ep.id, series: ep.series, total: r.total, rank: r.rank, axes: r.axes, traps: r.traps.length,
      assist: !!session.assist, writeSec: session.endedAt ? Math.round((Date.now() - session.endedAt) / 1000) : null, chars: r.chars,
    };
    const after = before.concat([entry]);
    Store.saveHistory(after);
    const xpParts = Game.xpLog(after)[after.length - 1];
    const lvBefore = Game.levelInfo(Game.xpOf(before));
    const lvAfter = Game.levelInfo(Game.xpOf(after));
    const list = Data.episodesOf(ep.series);
    const nextEp = list[list.indexOf(ep) + 1] || null;
    const unlocked = nextEp && !Game.isUnlocked(nextEp, before, settings) && Game.isUnlocked(nextEp, after, settings) ? nextEp : null;
    const oldBadges = Game.badgesOf(before, Store.badges());
    const allBadges = Game.badgesOf(after, oldBadges);
    Store.saveBadges(allBadges);
    const newBadges = allBadges.filter((id) => !oldBadges.includes(id));
    Store.saveDraft(ep.id, null);

    lastResult = {
      ep, r, entry, text, memo: $('memo').value, xpParts, lvBefore, lvAfter, unlocked, nextEp,
      firstClear: !wasCleared && r.total >= Scorer.CLEAR,
      isBest: !!prevBest && r.total > prevBest.total, prevBest: prevBest ? prevBest.total : null,
      newBadges, shown: false,
    };
    session = null;
    go('#/r/' + ep.id);
  }

  // 台本のどの発言が、その要点の出どころか(要点の語が最も多く含まれる発言。同点なら後の発言=最終的な結論)
  const sourceCache = new Map();
  function sourceLines(ep) {
    const key = ep.id + '|' + player().name;
    if (sourceCache.has(key)) return sourceCache.get(key);
    const T = GQ.Text;
    const normLines = ep.script.map((l) => (l[0].charAt(0) === '@' ? '' : T.norm(l[0] + ' ' + fill(l[1]))));
    const map = {};
    ep.points.forEach((p) => {
      const groups = p.must.map((g) => T.words(g));
      let best = -1;
      let bestScore = 0;
      normLines.forEach((t, i) => {
        if (!t) return;
        const sc = groups.filter((g) => T.hasAny(t, g)).length;
        if (sc > 0 && sc >= bestScore) { bestScore = sc; best = i; }
      });
      map[p.id] = best;
    });
    sourceCache.set(key, map);
    return map;
  }

  function redPen(text, r) {
    const lines = text.split(/\r?\n/);
    const notes = [];
    const lineMarks = lines.map(() => ({ kind: null, nums: [] }));
    const rankKind = { bad: 3, warn: 2, good: 1 };
    const mark = (item, kind, msg) => {
      notes.push({ kind, msg });
      const n = notes.length;
      for (let l = item.line; l <= item.lineEnd; l++) {
        const m = lineMarks[l];
        if (!m) continue;
        if (!m.kind || rankKind[kind] > rankKind[m.kind]) m.kind = kind;
        m.nums.push({ n, kind });
      }
    };
    r.traps.forEach((t) => mark(t.item, 'bad', `⚠ 引っかけ: ${t.label}。${t.why}`));
    r.points.forEach((p) => {
      if (!p.item) return;
      if (p.perfect) mark(p.item, 'good', `✔ ${p.label}`);
      else mark(p.item, 'warn', `△ ${p.label} — ${p.hints.join('/')}`);
    });
    const html = lines.map((ln, i) => {
      const m = lineMarks[i];
      if (!m.kind || !ln.trim()) return esc(ln);
      return `<mark class="k-${m.kind}">${esc(ln)}</mark>${m.nums.map((x) => `<sup class="k-${x.kind}">${x.n}</sup>`).join('')}`;
    }).join('\n');
    return { html, notes };
  }

  function renderResult() {
    const R = lastResult;
    const { ep, r } = R;
    const s = Data.series[ep.series];
    renderMe();
    const pass = r.total >= Scorer.CLEAR;
    const src = sourceLines(ep);
    const pen = redPen(R.text, r);
    const allTraps = Scorer.trapsOf(ep);
    const hitIds = new Set(r.traps.map((t) => t.id));
    const avg = averageAxes(Store.history().slice(0, -1));
    const foundN = r.points.filter((p) => p.found).length;
    const perfectN = r.points.filter((p) => p.perfect).length;
    const people = peopleOf(ep);

    const pointLi = (p) => {
      const st = p.perfect ? '<span class="ok">✔</span>' : p.found || p.partial ? '<span class="warn">△</span>' : '<span class="ng">✘</span>';
      const line = src[p.id];
      return `<li><span class="st">${st}</span><span><span class="badge">${TYPE_LABEL[p.type]}</span> ${esc(fill(p.label))}${p.weight > 1 ? ' <span class="badge" data-tip="重要な要点(配点2倍)">重要</span>' : ''}
        ${p.perfect ? '' : `<span class="hint-ng">${esc(p.hints.join('/'))}</span>`}
        ${p.item ? `<span class="quote">あなた: ${esc(p.item.text)}</span>` : ''}
        ${!p.perfect && p.why ? `<span class="why">${esc(p.why)}</span>` : ''}</span>
        ${line >= 0 ? `<button type="button" class="jump" data-action="jump" data-line="${line}">台本へ</button>` : '<span></span>'}</li>`;
    };
    const grouped = TYPE_ORDER.map((t) => r.points.filter((p) => p.type === t)).filter((g) => g.length);
    const xpLine = R.xpParts.parts.map((p, i) => `<span class="pill ${i ? 'sub' : ''}">${esc(p.label)} +${p.xp}</span>`).join('');
    const storyReady = Game.clearedSet(Store.history()).has(ep.id);

    $('view-result').innerHTML = `
      <div class="back"><button type="button" class="btn small" data-action="series" data-id="${s.id}">← ${esc(s.name)}の一覧へ</button></div>
      <div class="play-head">${lvBadge(ep.level)}<span class="badge">${esc(epTag(ep))}</span><h2>${esc(ep.title)} — 結果</h2></div>
      <div class="grid2">
        <div class="card score-hero">
          <div class="stamp" id="res-stamp" data-rank="${r.rank}" data-help="rank" data-tip="ランクの基準を見る">${r.rank}</div>
          <div class="total"><span id="res-total">0</span><small> / 100点</small></div>
          <div><span class="verdict ${pass ? 'ok' : 'ng'}">${pass ? (R.firstClear ? '🎉 クリア!' : '✔ クリア') : `あと${Scorer.CLEAR - r.total}点でクリア`}</span>${R.isBest ? `<span class="new-best">自己ベスト更新!(前回 ${R.prevBest}点)</span>` : ''}</div>
          <div class="xp-row"><span class="pill">+${R.xpParts.xp} XP</span>${xpLine}</div>
          ${R.entry.assist ? '<p class="hint" style="margin-top:6px">字幕ありのため、得点のXPは半分です。</p>' : ''}
          ${R.lvAfter.level > R.lvBefore.level ? `<span class="lvup">🎊 レベルアップ! Lv.${R.lvAfter.level}「${esc(R.lvAfter.title)}」</span>` : ''}
          ${R.unlocked ? `<span class="unlock">🔓 第${R.unlocked.no}話「${esc(R.unlocked.title)}」が解放されました</span>` : ''}
          ${R.newBadges.length ? `<div class="new-badges">${R.newBadges.map((id) => { const b = Game.BADGES.find((x) => x.id === id); return `<span data-tip="${esc(b.desc)}">${b.icon} ${esc(b.name)}</span>`; }).join('')}</div>` : ''}
          ${R.entry.writeSec != null ? `<p class="hint" style="margin-top:6px">会議の終了から提出まで ${fmtSec(R.entry.writeSec)}</p>` : ''}
        </div>
        <div class="card">
          <h3>📊 5つの観点 <button type="button" class="help" data-help="scoring" aria-label="採点の説明">?</button></h3>
          ${radarSvg(r.axes, avg)}
          <p class="hint" style="text-align:center;margin:-4px 0 8px">塗り=今回 ${avg ? '/ 点線=これまでの平均' : ''}</p>
          <div class="axes">${Scorer.AXES.map((a) => {
            const v = r.axes[a.id];
            const max = Scorer.WEIGHT[a.id];
            return `<div class="axis ${v / max < 0.6 ? 'low' : ''}"><span>${a.name}<small>${esc(a.desc)}</small></span><span class="pbar"><i style="width:${Math.round((v / max) * 100)}%"></i></span><span>${v}/${max}</span></div>`;
          }).join('')}</div>
        </div>
      </div>

      ${storyReady ? `<div class="card story-cta ${s.theme}"><span class="ico" aria-hidden="true">📖</span><div><b>物語の続き「${esc(ep.epilogue.title)}」${R.firstClear ? 'が解放されました' : ''}</b><p>会議のあと、何が起きたのか。</p></div><button type="button" class="btn primary" data-action="story" data-id="${ep.id}">読む</button></div>` : ''}

      <div class="card"><h3>🖍 赤ペン添削 <button type="button" class="help" data-help="redpen" aria-label="赤ペンの説明">?</button></h3>
        <div class="redpen">${pen.html}</div>
        ${pen.notes.length ? `<ol class="pen-notes">${pen.notes.map((n, i) => `<li class="k-${n.kind}"><span class="n">${i + 1}</span><span>${esc(fill(n.msg))}</span></li>`).join('')}</ol>` : '<p class="hint">印をつけられる箇所がありませんでした。下の「要点チェック」を見てみましょう。</p>'}
      </div>

      <div class="card"><h3>🎯 要点チェック <span class="badge">書けた ${foundN}/${r.points.length}</span><span class="badge">完璧 ${perfectN}</span></h3>
        ${grouped.map((g) => `<ul class="points">${g.map(pointLi).join('')}</ul>`).join('')}
      </div>

      <div class="card"><h3>🪤 引っかけ <span class="badge">${allTraps.length - r.traps.length}/${allTraps.length} 回避</span></h3>
        <ul class="trap-list">${allTraps.map((t) => {
          const hit = r.traps.find((x) => x.id === t.id);
          return hitIds.has(t.id)
            ? `<li class="hit"><b class="ng">✘ ${esc(t.label)}</b><small>${esc(t.why || '')}</small><small>あなた: ${esc(hit.item.text)}</small></li>`
            : `<li class="safe"><b class="ok">✔ 回避</b> ${esc(t.label.replace(/書いている$/, '書いていない'))}<small>${esc(t.why || '')}</small></li>`;
        }).join('')}</ul>
      </div>

      ${r.notes.length ? `<div class="card"><h3>📐 構成のアドバイス</h3><ul class="notes-list">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}

      <div class="card"><h3>📖 模範解答と見比べる</h3>
        <div class="compare"><div><h4>あなたの議事録</h4><pre class="model">${esc(R.text)}</pre></div><div><h4>模範解答</h4><pre class="model">${esc(fill(ep.model))}</pre></div></div>
      </div>

      <div class="card"><h3>🎙 台本(答え合わせ)</h3>
        <ol class="script" id="res-script">${ep.script.map((l, i) => {
          if (l[0].charAt(0) === '@') return `<li class="ev" id="sl-${i}">——${esc(l[1])}${l[0] === '@join' ? 'が参加' : 'が退出'}——</li>`;
          const tags = ep.points.filter((p) => src[p.id] === i).map((p) => `<span class="badge tag">${TYPE_LABEL[p.type]}</span>`).join('');
          return `<li id="sl-${i}" class="${tags ? 'src' : ''}" style="--c:${people[l[0]] ? people[l[0]].color : '#555'}"><b>${esc(l[0])}</b>${esc(fill(l[1]))}${tags}</li>`;
        }).join('')}</ol>
      </div>

      <div class="row">
        <span class="btns">
          <button type="button" class="btn" data-action="retry" data-id="${ep.id}">↻ 白紙から再挑戦</button>
          <button type="button" class="btn" data-action="retry-keep" data-id="${ep.id}">✎ この議事録を直して再挑戦</button>
        </span>
        <span class="btns">
          ${R.nextEp && Game.isUnlocked(R.nextEp, Store.history(), settings) ? `<button type="button" class="btn primary big" data-action="play" data-id="${R.nextEp.id}">次の話へ ▶</button>` : `<button type="button" class="btn primary" data-action="series" data-id="${s.id}">${esc(s.name)}の一覧へ</button>`}
        </span>
      </div>`;
    show('result');

    // 演出(この結果を初めて表示したときだけ)
    countUp($('res-total'), r.total);
    if (R.shown) return;
    R.shown = true;
    const stamp = $('res-stamp');
    if (!reducedMotion) { stamp.classList.remove('pop'); void stamp.offsetWidth; stamp.classList.add('pop'); }
    Sfx.play('stamp');
    setTimeout(() => Sfx.play(pass ? 'good' : 'meh'), 450);
    if (r.rank === 'S' || R.firstClear || R.isBest || R.lvAfter.level > R.lvBefore.level) confetti(r.rank === 'S' ? 130 : 80);
    let delay = 900;
    const later = (fn) => { effectTimers.push(setTimeout(fn, delay)); };
    if (R.lvAfter.level > R.lvBefore.level) { later(() => Sfx.play('levelup')); delay += 700; }
    if (R.unlocked) { later(() => { Sfx.play('unlock'); toast(`🔓 第${R.unlocked.no}話「${R.unlocked.title}」が解放されました`); }); delay += 900; }
    if (R.newBadges.length) {
      const names = R.newBadges.map((id) => { const b = Game.BADGES.find((x) => x.id === id); return `${b.icon}${b.name}`; });
      later(() => { Sfx.play('badge'); toast(`🏅 バッジを獲得: ${names.join('、')}`); });
    }
  }
  // 結果画面の演出(遅れて出る通知)は、画面を離れたら取り消す
  const effectTimers = [];
  function clearEffects() {
    effectTimers.splice(0).forEach(clearTimeout);
    const box = $('toasts');
    if (box) box.innerHTML = '';
  }

  function jumpToLine(i) {
    const el = $('sl-' + i);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  // ---------------------------------------------------------------- 物語(プロローグ・その後)
  function chatHtml(s, messages) {
    return `<div class="chat">${messages.map((m) => {
      const c = s.cast[m.from] || {};
      const where = m.to === 'DM' ? 'あなたへのDM' : m.to;
      return `<div class="msg"><div class="av" style="--c:${c.color || '#888'}" aria-hidden="true">${esc(c.avatar || m.from.slice(0, 1))}</div>
        <div><div class="head">${esc(m.from)} <span class="chan">${esc(where)}</span>${m.time ? ' ・ ' + esc(m.time) : ''}</div><div class="bubble">${esc(fill(m.text))}</div></div></div>`;
    }).join('')}</div>`;
  }

  function openStory(epId) {
    const ep = Data.byId(epId);
    if (!ep) return;
    const s = Data.series[ep.series];
    const e = ep.epilogue;
    $('dlg-story-title').textContent = `📖 ${epTag(ep)}のその後 — ${e.title}`;
    $('story-body').innerHTML = e.kind === 'chat'
      ? `<p class="hint" style="margin-bottom:8px">会議のあと、プロジェクトのチャットに届いたメッセージ。</p>${chatHtml(s, e.messages)}`
      : `<div class="story ${s.theme}">${e.text.map((t) => `<p>${esc(fill(t))}</p>`).join('')}</div>`;
    const list = Data.episodesOf(ep.series);
    const next = list[list.indexOf(ep) + 1];
    const h = Store.history();
    $('story-foot').innerHTML = next && Game.isUnlocked(next, h, settings)
      ? `<button type="button" class="btn primary" data-action="play" data-id="${next.id}">第${next.no}話「${esc(next.title)}」へ ▶</button>`
      : next ? '' : `<span class="hint">${ep.finale ? '——完。最後まで記録してくれて、ありがとう。' : '続きの話は準備中です。お楽しみに。'}</span>`;
    Store.markStoryRead(ep.id);
    Sfx.play('page');
    openDialog('dlg-story');
  }

  function openPrologue(seriesId) {
    const s = Data.series[seriesId];
    const first = Data.episodesOf(seriesId)[0];
    $('dlg-story-title').textContent = `📜 プロローグ — ${s.name}「${s.title}」`;
    $('story-body').innerHTML = `<div class="story ${s.theme}">${s.prologue.map((t) => `<p>${esc(fill(t))}</p>`).join('')}</div>`;
    $('story-foot').innerHTML = first ? `<button type="button" class="btn primary" data-action="play" data-id="${first.id}">第1話「${esc(first.title)}」へ ▶</button>` : '';
    Sfx.play('page');
    openDialog('dlg-story');
  }

  // ---------------------------------------------------------------- 設定・はじめに
  function settingsForm(prefix, blank) {
    return `
      <div class="field"><label for="${prefix}-name">あなたの名前(名字)</label><input type="text" id="${prefix}-name" maxlength="12" value="${blank ? '' : esc(settings.playerName)}" placeholder="例: 皆川(空欄なら「皆川」)">
        <span class="hint">仕事編の会議で、この名前で呼ばれ、ToDoを振られることもあります(魔王軍編では「書記官」)。</span></div>
      <div class="field"><label for="${prefix}-reading">名前の読み(ひらがな)</label><input type="text" id="${prefix}-reading" maxlength="20" value="${blank ? '' : esc(settings.playerReading)}" placeholder="例: みながわ">
        <span class="hint">会議の音声が、この読みであなたを呼びます。</span></div>`;
  }

  function openSettings() {
    const vs = Speech.voices();
    $('settings-body').innerHTML = `
      ${settingsForm('st')}
      <div class="field"><label for="st-rate">会議の話す速さ</label><select id="st-rate">${[0.8, 0.9, 1, 1.1, 1.25, 1.4].map((r) => `<option value="${r}" ${Number(settings.rate) === r ? 'selected' : ''}>${r}倍</option>`).join('')}</select></div>
      <label class="opt"><input type="checkbox" id="st-sfx" ${settings.sfx ? 'checked' : ''}> 効果音を鳴らす</label><br>
      <label class="opt" style="margin-top:8px"><input type="checkbox" id="st-unlock" ${settings.unlockAll ? 'checked' : ''}> すべての話を解放する(順番に関係なく遊べます)</label>
      <h4 style="margin:16px 0 6px">🔈 音声のチェック</h4>
      <p class="hint">${!Speech.supported ? 'このブラウザは音声読み上げに対応していません。' : vs.length ? `日本語の音声: ${vs.map((v) => esc(v.name)).join(' / ')}` : '日本語の音声が見つかりません(読み込み中の場合は、少し待って開き直してください)。'}</p>
      <div class="btns" style="margin-top:6px">
        <button type="button" class="btn small" id="st-try-work">仕事編の声を試す</button>
        <button type="button" class="btn small" id="st-try-maou">魔王軍編の声を試す</button>
      </div>
      <h4 style="margin:16px 0 6px">💾 記録</h4>
      <p class="hint">${Store.persistent ? '記録はこのブラウザに保存されています。' : '⚠ このブラウザでは保存領域が使えないため、ページを閉じると記録が消えます。'}</p>
      <div class="btns" style="margin-top:6px"><button type="button" class="btn small danger" id="st-reset">記録をリセット(テンプレートと設定は残ります)</button></div>`;
    const commitName = () => {
      saveSettings({ playerName: $('st-name').value.trim(), playerReading: $('st-reading').value.trim() });
      sourceCache.clear();
      renderMe();
    };
    $('st-name').addEventListener('change', commitName);
    $('st-reading').addEventListener('change', commitName);
    $('st-rate').addEventListener('change', (e) => saveSettings({ rate: Number(e.target.value) || 1 }));
    $('st-sfx').addEventListener('change', (e) => { saveSettings({ sfx: e.target.checked }); Sfx.play('click'); });
    $('st-unlock').addEventListener('change', (e) => { saveSettings({ unlockAll: e.target.checked }); if (currentView === 'home' || currentView === 'series') route(); });
    const tryVoice = (sid, who, text) => {
      const s = Data.series[sid];
      const people = Object.fromEntries(Object.entries(s.cast));
      if (!Speech.sample(Speech.applyReadings(text.replace(/\{player\}/g, player().reading), s.readings), people, who, settings.rate)) toast('音声を再生できませんでした');
    };
    $('st-try-work').addEventListener('click', () => tryVoice('work', '柴田', 'ブリッジワークスの柴田です。{player}さん、議事録をお願いしますね。'));
    $('st-try-maou').addEventListener('click', () => tryVoice('maou', '魔王', '書記官。記録とは、剣より長く残るものじゃ。'));
    $('st-reset').addEventListener('click', () => {
      if (!confirm('スコア・バッジ・書きかけの議事録をすべて消します。よろしいですか?')) return;
      Store.resetAll();
      lastResult = null;
      toast('記録をリセットしました');
      $('dlg-settings').close();
      go('#/');
    });
    openDialog('dlg-settings');
  }

  function openWelcome() {
    $('welcome-body').innerHTML = `
      <p>会議の音声を聞いて、<b>議事録</b>を書くゲームです。決まったこと、まだ決まっていないこと、誰が・何を・いつまでに——を書き分けて、採点を受けます。</p>
      <p style="margin:10px 0">物語は2つ。<b>💼 仕事編</b>(生成AIでコールセンターを変えるAXプロジェクト)と、<b>🏰 魔王軍編</b>(勇者を迎え撃つ魔王軍の軍議)。どちらも話数の順に物語が進みます。</p>
      ${settingsForm('wl', true)}
      <p class="hint">あとから ⚙設定 で変えられます。会議には音声が出ます。音量にご注意ください。</p>`;
    $('welcome-start').onclick = () => {
      saveSettings({ playerName: $('wl-name').value.trim() || '皆川', playerReading: $('wl-reading').value.trim() || ($('wl-name').value.trim() ? '' : 'みながわ'), welcomed: true });
      $('dlg-welcome').close();
      Sfx.play('start');
      if (currentView !== 'play') route();
    };
    openDialog('dlg-welcome');
  }

  // ---------------------------------------------------------------- 議事録テンプレート
  let tplEditingId = null;
  function renderTplSelect(selectId) {
    const sel = $('tpl-select');
    if (!sel) return;
    const keep = selectId || sel.value || tplData.defaultId || 'builtin-standard';
    sel.innerHTML =
      `<optgroup label="組み込み">${Templates.BUILTIN.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</optgroup>` +
      `<optgroup label="マイテンプレート">${tplData.items.length ? tplData.items.map((t) => `<option value="${t.id}">${esc(t.name)}${tplData.defaultId === t.id ? ' ★自動' : ''}</option>`).join('') : '<option disabled>(まだありません)</option>'}</optgroup>`;
    sel.value = Templates.find(tplData, keep) ? keep : 'builtin-standard';
  }
  function insertTemplate(id) {
    const t = Templates.find(tplData, id);
    const ta = $('minutes');
    if (!t || !ta) return;
    const r = Templates.insertInto(ta.value, t.body, ta.selectionStart);
    ta.value = r.text;
    ta.focus();
    ta.setSelectionRange(r.caret, r.caret);
    updateCount();
    scheduleSave();
  }
  function renderTplList() {
    const row = (t) => `<button type="button" class="tpl-item ${t.id === tplEditingId ? 'sel' : ''}" data-tpl="${t.id}"><span>${esc(t.name)}</span>${tplData.defaultId === t.id ? '<small>★自動</small>' : ''}</button>`;
    $('tpl-list').innerHTML = '<h4>組み込み(変更不可)</h4>' + Templates.BUILTIN.map(row).join('') +
      '<h4>マイテンプレート</h4>' + (tplData.items.length ? tplData.items.map(row).join('') : '<p class="hint">まだありません。右で作って保存できます。</p>');
    $('tpl-list').querySelectorAll('[data-tpl]').forEach((el) => el.addEventListener('click', () => loadTplEditor(el.dataset.tpl)));
  }
  function loadTplEditor(id, preset) {
    tplEditingId = id;
    const t = id ? Templates.find(tplData, id) : null;
    const builtin = !!(t && t.builtin);
    $('tpl-name').value = preset ? preset.name : t ? (builtin ? t.name + '(コピー)' : t.name) : '';
    $('tpl-body').value = preset ? preset.body : t ? t.body : '';
    $('tpl-default').checked = !!(t && !builtin && tplData.defaultId === t.id);
    $('tpl-delete').disabled = !t || builtin;
    $('tpl-note').textContent = builtin ? '組み込みテンプレートは変更できません。保存すると、自分用のコピーとして追加されます。' : t ? '書き換えて「保存」で上書きできます。' : '名前と内容を入れて「保存」すると、マイテンプレートに追加されます。';
    if (builtin) tplEditingId = null;
    renderTplList();
    if (builtin) { const b = $('tpl-list').querySelector(`[data-tpl="${id}"]`); if (b) b.classList.add('sel'); }
  }
  function openTplDialog(preset) {
    tplData = Store.templates();
    loadTplEditor(null, preset);
    openDialog('dlg-tpl');
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
  $('tpl-save').addEventListener('click', saveTpl);
  $('tpl-delete').addEventListener('click', deleteTpl);
  $('tpl-new').addEventListener('click', () => loadTplEditor(null));

  // ---------------------------------------------------------------- ルール説明
  let helpBuilt = false;
  function openHelp(topic) {
    const body = $('help-body');
    if (!helpBuilt) {
      body.innerHTML = Help.sections().map((sec) => `<details id="help-${sec.id}"><summary><span aria-hidden="true">${sec.icon}</span> ${esc(sec.title)}</summary><div class="hbody">${sec.html}</div></details>`).join('');
      helpBuilt = true;
    }
    body.querySelectorAll('details').forEach((d) => { d.open = false; });
    const target = body.querySelector('#help-' + (topic || 'howto')) || body.querySelector('details');
    target.open = true;
    openDialog('dlg-help');
    target.scrollIntoView({ block: 'start' });
  }

  // ---------------------------------------------------------------- ツールチップ
  const tip = (function () {
    const el = $('tip');
    let current = null;
    function showTip(target) {
      const text = target.dataset.tip;
      if (!text || target.closest('dialog')) return;
      current = target;
      el.textContent = text;
      el.hidden = false;
      const r = target.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      el.style.left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 8), root.innerWidth - w - 8) + 'px';
      el.style.top = (r.bottom + 8 + h <= root.innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - h - 8)) + 'px';
    }
    function hide() { current = null; el.hidden = true; }
    document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) showTip(t); else if (current) hide(); });
    document.addEventListener('focusin', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) showTip(t); });
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', hide, true);
    return { hide };
  })();

  // ---------------------------------------------------------------- 操作(クリック・キーボード)
  document.addEventListener('click', (e) => {
    const helpEl = e.target.closest && e.target.closest('[data-help]');
    if (helpEl) { e.preventDefault(); openHelp(helpEl.dataset.help); return; }
    const a = e.target.closest && e.target.closest('[data-action]');
    if (!a) { if (!(e.target.closest && e.target.closest('[data-tip]'))) tip.hide(); return; }
    const id = a.dataset.id;
    const dlg = a.closest('dialog');
    switch (a.dataset.action) {
      case 'home': go('#/'); break;
      case 'series': go('#/s/' + id); break;
      case 'play': if (dlg) dlg.close(); go('#/p/' + id); break;
      case 'story': openStory(id); break;
      case 'prologue': openPrologue(id); break;
      case 'settings': openSettings(); break;
      case 'jump': jumpToLine(Number(a.dataset.line)); break;
      case 'retry': Store.saveDraft(id, null); go('#/p/' + id); break;
      case 'retry-keep': if (lastResult) Store.saveDraft(id, { minutes: lastResult.text, memo: lastResult.memo }); go('#/p/' + id); break;
      default: break;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      tip.hide();
      if (currentView === 'play' && session && session.speech && !e.isComposing && !document.querySelector('dialog[open]')) {
        if (session.speech.state === 'playing' || session.speech.state === 'paused') { e.preventDefault(); togglePause(); }
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-help]:not(button)')) { e.preventDefault(); openHelp(e.target.dataset.help); }
  });
  root.addEventListener('hashchange', route);
  root.addEventListener('pagehide', saveDraftNow);

  // ---------------------------------------------------------------- 起動
  // 初回起動時は、すでに獲得済みのバッジを記録しておく(通知を出さない)
  if (Store.badges() === null) Store.saveBadges(Game.badgesOf(Store.history(), []));
  route();
  if (!settings.welcomed) openWelcome();
})(typeof globalThis !== 'undefined' ? globalThis : this);
