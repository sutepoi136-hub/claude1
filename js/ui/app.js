/* 議事録クエスト — 画面(ホーム / 目次 / 会議 / 結果)と、ダイアログ・演出。
 * 採点やゲームのロジックは js/core/、物語とシナリオは js/data/ にある。ここは表示と操作だけを受け持つ。 */
(function (root) {
  'use strict';
  const GQ = root.GQ;
  const { Data, Scorer, Game, Store, Templates, Speech, Sfx, Bgm, Help } = GQ;
  const { icon, EMBLEM } = GQ.Icon;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reducedMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const MAX_PLAYS = 2;
  const LV_CLASS = { 初級: 'lv1', 中級: 'lv2', 上級: 'lv3' };
  const TYPE_ORDER = ['decision', 'todo', 'pending', 'issue', 'info', 'next'];
  const TYPE_LABEL = { decision: '決定事項', todo: 'ToDo', pending: '保留', issue: '課題・リスク', info: '共有事項', next: '次回' };
  const KANJI_NO = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  // バッジの線画アイコン(ゲームの定義は絵文字だが、画面では線画で統一する)
  const BADGE_ICON = {
    first: 'pen', clear: 'check', rankA: 'star', rankS: 'star', perfect: 'trophy', clean: 'shield', sorter: 'layers', todo: 'list',
    ears: 'headphones', speed: 'bolt', grow: 'trend', ten: 'book', streak3: 'flame', streak7: 'flame', work1: 'file', work3: 'trophy',
    maou1: 'candle', maou3: 'open', all: 'seal',
  };

  // ---------------------------------------------------------------- 設定・プレイヤー
  let settings = Store.settings();
  const applySound = () => GQ.Audio.setVolumes({ bgm: settings.bgmVol / 100, sfx: settings.sfxVol / 100, amb: settings.ambience, muted: settings.muted });
  applySound();
  const player = () => ({ name: (settings.playerName || '').trim() || 'あなた', reading: (settings.playerReading || '').trim() || (settings.playerName || '').trim() || 'あなた' });
  const ctx = () => ({ player: player() });
  const fill = (text) => Data.fill(text, player());
  function saveSettings(patch) {
    settings = { ...settings, ...patch };
    Store.saveSettings(settings);
    applySound();
    renderSoundBtn();
  }
  function renderSoundBtn() {
    const b = $('nav-sound');
    b.innerHTML = `${icon(settings.muted ? 'mute' : 'sound')}<span>${settings.muted ? '消音中' : '音'}</span>`;
    b.setAttribute('aria-pressed', String(!!settings.muted));
    b.setAttribute('aria-label', settings.muted ? '音を出す' : '音を消す');
    b.dataset.tip = settings.muted ? '音を出す(BGM・効果音)' : 'すべての音を消す(会議の音声は消えません)';
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
  function confetti(count = 60) {
    if (reducedMotion) return;
    const colors = ['#b3352c', '#c39a4a', '#0f5f68', '#1c2230', '#e7dcc4'];
    const box = $('confetti');
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.style.cssText = `left:${Math.random() * 100}vw;--c:${colors[i % colors.length]};--x:${(Math.random() - 0.5) * 200}px;--d:${2.6 + Math.random() * 2}s;--delay:${Math.random() * 0.5}s`;
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
    if (Data.series[seriesId] && Data.series[seriesId].calendar === '魔王暦') return withYear ? `魔王暦${y}年${m}月${d}日` : `${m}月${d}日`;
    const wd = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
    return withYear ? `${y}年${m}月${d}日(${wd})` : `${m}月${d}日(${wd})`;
  }
  const epTag = (ep) => `${Data.series[ep.series].name} 第${ep.no}話`;
  const lvTag = (level) => `<span class="tag ${LV_CLASS[level] || ''}">${esc(level)}</span>`;
  const seal = (rank, cls = '') => `<span class="seal ${cls} ${rank === 'C' || rank === 'D' ? 'dim' : ''}" data-rank="${rank}" data-help="rank"><b>${rank}</b><small>審査済</small></span>`;
  const miniSeal = (rank) => `<span class="mini-seal ${rank === 'C' || rank === 'D' ? 'dim' : ''}">${rank}</span>`;
  // 話者のアイコン(仕事編=頭文字の丸、魔王軍編=金縁の紋章)
  function avatar(seriesId, name, c, extra = '') {
    if (seriesId === 'maou') return `<span class="av crest serif ${extra}" aria-hidden="true">${esc(name.slice(0, 1))}</span>`;
    return `<span class="av ${extra}" style="--c:${c && c.color ? c.color : '#888'}" aria-hidden="true">${esc((c && c.avatar) || name.slice(0, 1))}</span>`;
  }
  function openDialog(id) {
    const d = $(id);
    if (!d.open) { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); }
    tip.hide();
  }
  const fmtSec = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ---------------------------------------------------------------- ヘッダー
  function renderMe() {
    const h = Store.history();
    const lv = Game.levelInfo(Game.xpOf(h));
    const streak = Game.streakOf(h);
    $('me').innerHTML =
      `<button type="button" class="lv" data-help="xp" data-tip="${esc(`あと${lv.next - lv.xp} XPで Lv.${lv.level + 1}`)}"><span class="t"><span>Lv.${lv.level} ${esc(lv.title)}</span><span class="num">${lv.xp - lv.floor} / ${lv.next - lv.floor}</span></span><span class="meter"><i style="width:${lv.pct}%"></i></span></button>` +
      `<button type="button" class="streak" data-help="streak" data-tip="連続プレイ日数">${icon('flame')}<span class="num">${streak}日</span></button>`;
  }
  renderSoundBtn();
  $('nav-help').innerHTML = `${icon('help')}<span>ルール</span>`;
  $('nav-settings').innerHTML = `${icon('sliders')}<span>設定</span>`;
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

  // ---------------------------------------------------------------- 画面の切り替え(#で管理し、ブラウザの「戻る」に対応)
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

  function radarSvg(values) {
    const axes = Scorer.AXES;
    const W = 280, H = 240, cx = 140, cy = 126, R = 84;
    const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const poly = (vals) => axes.map((a, i) => pt(i, R * Math.max(0.03, Math.min(1, (vals[a.id] || 0) / Scorer.WEIGHT[a.id])))).map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
    const rings = [0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${axes.map((a, i) => pt(i, R * k).join(',')).join(' ')}" fill="none" stroke="#e3e0d7" stroke-width="1"/>`).join('');
    const spokes = axes.map((a, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e3e0d7" stroke-width="1"/>`; }).join('');
    const labels = axes.map((a, i) => { const [x, y] = pt(i, R + 20); return `<text x="${x}" y="${y + 4}" text-anchor="middle">${a.name}</text>`; }).join('');
    return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="5つの観点のバランス">${rings}${spokes}
      <polygon points="${poly(values)}" fill="rgba(28,34,48,.10)" stroke="#1c2230" stroke-width="2" stroke-linejoin="round"/>${labels}</svg>`;
  }

  function chartSvg(values) {
    const v = values.slice(-20);
    if (v.length < 2) return '<p class="hint" style="padding:30px 0;text-align:center">2回以上提出すると、得点の推移が表示されます。</p>';
    const W = 600, H = 120, pad = 10;
    const pts = v.map((y, i) => [pad + (i * (W - pad * 2)) / (v.length - 1), H - pad - (y / 100) * (H - pad * 2)]);
    const clearY = H - pad - (Scorer.CLEAR / 100) * (H - pad * 2);
    return `<svg id="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="得点の推移">
      <line x1="0" x2="${W}" y1="${clearY}" y2="${clearY}" stroke="#b3352c" stroke-dasharray="4 5" stroke-width="1" opacity=".55" vector-effect="non-scaling-stroke"/>
      <polyline fill="none" stroke="#1c2230" stroke-width="2" stroke-linejoin="round" points="${pts.map((p) => p.join(',')).join(' ')}" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function volCard(s, h, i) {
    const prog = Game.seriesProgress(s.id, h);
    const next = Game.nextEpisode(s.id, h, settings);
    const pct = prog.total ? Math.round((prog.cleared / prog.total) * 100) : 0;
    return `<article class="vol">
      <div class="jacket ${s.theme}">
        <span class="emblem" aria-hidden="true">${EMBLEM[s.id] || ''}</span>
        <span class="vno">VOL.${i + 1} — ${esc(s.name)}</span>
        <h3>${esc(s.title)}</h3>
        <span class="sub">全${s.plan.length}話 ・ 配信中 ${prog.total}話</span>
      </div>
      <div class="vol-body">
        <p class="tagline">${esc(s.tagline)}</p>
        <div class="vol-prog"><b class="num">${prog.cleared} / ${prog.total}</b><span class="bar"><i style="width:${pct}%"></i></span><span>話クリア</span></div>
        ${next
          ? `<div class="next-up"><span class="lab">次の会議</span><b>第${next.no}話「${esc(next.title)}」</b>${lvTag(next.level)}</div>`
          : '<div class="next-up"><span class="lab">完了</span><b>配信中の話をすべてクリアしました</b></div>'}
        <div class="btns">
          ${next ? `<button type="button" class="btn primary" data-action="play" data-id="${next.id}">${icon('play')}第${next.no}話を始める</button>` : ''}
          <button type="button" class="btn" data-action="series" data-id="${s.id}">${icon('list')}目次と登場人物</button>
        </div>
      </div></article>`;
  }

  function renderHome() {
    renderMe();
    const h = Store.history();
    const cont = continueTarget(h);
    const avg = averageAxes(h);
    const earned = new Set(Game.badgesOf(h, Store.badges()));
    const recent = h.slice().reverse().slice(0, 6);
    const lv = Game.levelInfo(Game.xpOf(h));
    const clearedN = Game.clearedSet(h).size;
    const best = h.length ? Math.max(...h.map((x) => x.total)) : null;
    $('view-home').innerHTML = `
      <section class="hero">
        <div>
          <span class="eyebrow">PMO Training — Meeting Minutes</span>
          <h1>会議を聞き、<br><em>記録</em>で決着をつける。</h1>
          <p class="lead">決まったこと。まだ決まっていないこと。誰が、何を、いつまでに。2つの物語の会議を記録しながら、議事録を書く力を鍛えます。</p>
          <div class="btns">
            ${cont ? `<button type="button" class="btn primary lg" data-action="play" data-id="${cont.id}">${icon('play')}続きから — ${esc(epTag(cont))}「${esc(cont.title)}」</button>` : ''}
            <button type="button" class="btn lg" data-help="howto">遊び方</button>
          </div>
        </div>
        <div class="sheet" aria-hidden="true">
          <h4>議事録 — CS AXプロジェクト キックオフ</h4>
          <div class="k">【決定事項】</div>
          <div class="l">・対象範囲は <mark>通話要約・メール下書き・ナレッジ検索</mark></div>
          <div class="k">【ToDo】</div>
          <div class="l">・高木様: 社長に確認し <mark>10/13</mark> に回答</div>
          <div class="k">【保留】</div>
          <div class="l">・顧客向けチャットボットの扱い</div>
          <span class="seal sm"><b>S</b></span>
        </div>
      </section>

      <div class="sec-head"><h2>物語</h2><span class="muted">2つの物語は、話数の順に進みます</span></div>
      <div class="vols">${Data.seriesList().map((s, i) => volCard(s, h, i)).join('')}</div>

      <div class="sec-head"><h2>あなたの記録</h2><button type="button" class="help" data-help="scoring">${icon('help')}採点のしくみ</button></div>
      <div class="kpis">
        <div class="kpi"><div class="lab">レベル</div><div class="val">${lv.level}<small>${esc(lv.title)}</small></div></div>
        <div class="kpi"><div class="lab">累計XP</div><div class="val num">${lv.xp}</div></div>
        <div class="kpi"><div class="lab">クリアした会議</div><div class="val num">${clearedN}<small>/ ${Data.episodes.length}</small></div></div>
        <div class="kpi"><div class="lab">最高得点</div><div class="val num">${best == null ? '—' : best}<small>${best == null ? '' : '点'}</small></div></div>
      </div>
      <div class="stats">
        <div class="card pad"><h3>直近10回のバランス</h3>${avg ? radarSvg(avg) : '<p class="hint" style="padding:40px 0;text-align:center">提出すると、5つの観点のバランスが表示されます。</p>'}</div>
        <div class="card pad"><h3>得点の推移 <span class="hint" style="font-weight:500">— 破線はクリアライン(${Scorer.CLEAR}点)</span></h3>${chartSvg(h.map((x) => x.total))}
          ${recent.length ? `<ul class="log">${recent.map((x) => {
            const ep = Data.byId(x.episodeId);
            return `<li><time>${new Date(x.at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</time><span>${ep ? esc(epTag(ep) + '「' + ep.title + '」') : esc(x.episodeId)}${x.assist ? ' <span class="tag plain">字幕</span>' : ''}</span><span class="sc num">${x.rank} ・ ${x.total}点</span></li>`;
          }).join('')}</ul>` : ''}
        </div>
      </div>

      <div class="sec-head"><h2>バッジ</h2><span class="muted num">${earned.size} / ${Game.BADGES.length}</span><button type="button" class="help" data-help="badges">${icon('help')}条件</button></div>
      <div class="badges">${Game.BADGES.map((b) => `<div class="bd ${earned.has(b.id) ? 'earned' : 'locked'}"><span class="ic">${icon(earned.has(b.id) ? BADGE_ICON[b.id] || 'star' : 'lock')}</span><div><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div></div>`).join('')}</div>`;
    show('home');
    Bgm.play('home');
  }

  // ---------------------------------------------------------------- 目次(シリーズ)
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
    const prog = Game.seriesProgress(id, h);
    const epRow = (p) => {
      const ep = Data.episodesOf(id).find((e) => e.no === p.no);
      const date = dateLabel(id, p.date, false);
      const no = `<div class="no">${String(p.no).padStart(2, '0')}<small>第${p.no}話</small></div>`;
      if (!ep) return `<div class="ep planned">${no}<div><div class="ttl">${esc(p.title)}</div><div class="meta"><span>${date}</span><span>あらすじで補われます</span></div></div></div>`;
      const open = Game.isUnlocked(ep, h, settings);
      const b = best[ep.id];
      const isClear = cleared.has(ep.id);
      const status = !open ? `<span class="hint">${icon('lock')} 前の話をクリアで解放</span>`
        : b ? `<span class="best">${miniSeal(b.rank)}<span class="num">自己ベスト ${b.total}点</span>${isClear ? '' : `<span class="hint">あと${Scorer.CLEAR - b.total}点</span>`}</span>`
          : '<span class="tag new">NEW</span>';
      return `<div class="ep ${isClear ? 'cleared' : open ? 'open' : 'locked'}">${no}
        <div><div class="ttl">${esc(ep.title)}${ep.finale ? ' <span class="tag plain">最終話</span>' : ''}</div>
          <div class="meta"><span>${date}</span>${lvTag(ep.level)}<span>${icon('users')} ${ep.cast.length}人</span></div></div>
        <div class="side">${status}
          ${isClear ? `<button type="button" class="btn sm ghost" data-action="story" data-id="${ep.id}" data-tip="会議のあとの出来事">${icon('open')}その後</button>` : ''}
          ${open ? `<button type="button" class="btn sm ${b ? '' : 'primary'}" data-action="play" data-id="${ep.id}">${b ? '再挑戦' : '挑戦する'}</button>` : ''}
        </div></div>`;
    };
    const castHtml = Object.entries(s.cast).map(([name, c]) => known.has(name)
      ? `<div class="person">${avatar(s.id, name, c)}<div><b>${esc(c.full)}</b><small>${esc(c.org)} ・ ${esc(c.role)}</small><p>${esc(c.desc)}</p></div></div>`
      : '<div class="person unknown"><span class="av unknown">?</span><div><b>???</b><small>物語が進むと登場します</small></div></div>').join('');
    $('view-series').innerHTML = `
      <nav class="crumbs"><button type="button" data-action="home">${icon('left')}ホーム</button><span>/</span><span>${esc(s.name)}</span></nav>
      <header class="cover ${s.theme}">
        <div style="position:relative;z-index:1">
          <span class="eyebrow" style="color:rgba(255,255,255,.7)">${esc(s.name)}</span>
          <h1>${esc(s.title)}</h1>
          <p>${esc(s.tagline)}</p>
          <div class="btns">
            ${next ? `<button type="button" class="btn" data-action="play" data-id="${next.id}">${icon('play')}第${next.no}話「${esc(next.title)}」</button>` : ''}
            <button type="button" class="btn ghost" data-action="prologue" data-id="${s.id}">${icon('open')}プロローグ</button>
          </div>
        </div>
        <div class="stat"><div class="big num">${prog.cleared}<small> / ${prog.total}</small></div><div class="lab">話クリア(全${s.plan.length}話中 ${prog.total}話 配信中)</div></div>
      </header>
      <div class="series-grid">
        <div class="toc">
          ${s.chapters.map((ch) => `<section class="chapter">
            <div class="ch-head"><h2>第${KANJI_NO[ch.no]}章 ${esc(ch.title)}</h2>${lvTag(ch.level)}<span class="muted">${esc(ch.period)}</span></div>
            <p class="ch-sum">${esc(ch.summary)}</p>
            ${s.plan.filter((p) => p.chapter === ch.no).map(epRow).join('')}</section>`).join('')}
        </div>
        <aside class="aside">
          <h3>登場人物</h3>
          <div class="people-list">${castHtml}</div>
          <p class="hint" style="margin-top:12px">あなた: ${esc(s.player.role)}。${esc(s.player.note)}</p>
        </aside>
      </div>`;
    show('series');
    Bgm.play(Bgm.trackFor(id));
  }

  // ---------------------------------------------------------------- 会議
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
    Bgm.ambience(null);
    session = null;
  }

  function startPlay(ep) {
    const h = Store.history();
    if (!Game.isUnlocked(ep, h, settings)) {
      toast('この話は、ひとつ前の話をクリアすると解放されます');
      go('#/s/' + ep.series);
      return;
    }
    leavePlay();
    renderMe();
    const s = Data.series[ep.series];
    session = { ep, s, playsLeft: MAX_PLAYS, assist: false, heard: false, endedAt: null, elapsed: 0, speech: null, late: lateJoiners(ep) };
    const people = peopleOf(ep);
    const me = player();
    const meName = s.theme === 'maou' ? '書記官' : me.name;
    const meRole = s.theme === 'maou' ? 'あなた・記録' : 'PMO・あなた・議事録';
    const totalLen = ep.script.reduce((n, l) => n + (l[0].charAt(0) === '@' ? 0 : l[1].length), 0);

    $('view-play').innerHTML = `
      <nav class="crumbs"><button type="button" data-action="home">${icon('left')}ホーム</button><span>/</span><button type="button" data-action="series" data-id="${s.id}">${esc(s.name)}</button><span>/</span><span>第${ep.no}話</span></nav>
      <div class="play-head">
        <div><div class="sub">${esc(epTag(ep))} ${lvTag(ep.level)}</div><h1>${esc(ep.title)}</h1></div>
        <button type="button" class="btn sm ghost" id="btn-brief"></button>
      </div>
      <section class="card brief" id="brief">
        <div class="story-col"><span class="eyebrow">これまでのあらすじ</span><p>${esc(fill(ep.synopsis))}</p></div>
        <div>
          <span class="eyebrow">会議の情報</span>
          <dl>
            <dt>会議</dt><dd>${esc(ep.meeting.name)}</dd>
            <dt>日時</dt><dd>${esc(dateLabel(ep.series, ep.meeting.date))} ${esc(ep.meeting.time)}</dd>
            <dt>場所</dt><dd>${esc(ep.meeting.place)}</dd>
            <dt>目安</dt><dd>約${Math.max(1, Math.round(totalLen / 6.5 / 60))}分 ・ 要点 ${ep.points.length}個 ・ 再生は${MAX_PLAYS}回まで</dd>
          </dl>
          <span class="eyebrow">記録のポイント</span>
          <ul>${ep.focus.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        </div>
      </section>

      <div class="workspace">
        <section class="room ${s.theme}" id="room" aria-label="会議室">
          <div class="room-head"><span class="ico">${icon(s.theme === 'maou' ? 'candle' : 'video')}</span><span class="nm">${esc(ep.meeting.name)}</span><span class="rec" id="rec"><i></i><span id="clock">00:00</span></span></div>
          <div class="seats" id="seats">
            ${ep.cast.map((n) => `<div class="seat ${session.late.has(n) ? 'away' : ''}" data-name="${esc(n)}" style="--c:${people[n].color}">
              ${avatar(s.id, n, people[n])}<div><b>${esc(n)}</b><small>${esc(people[n].role)}</small></div><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></div>`).join('')}
            <div class="seat"><span class="av me" aria-hidden="true">${icon('pen')}</span><div><b>${esc(meName)}</b><small>${esc(meRole)}</small></div></div>
          </div>
          <div class="caption" id="caption" aria-live="off"><span class="who"></span><span class="txt">準備ができたら「会議を始める」を押してください。</span></div>
          <div class="tl" id="tl" aria-hidden="true">${ep.script.map((l, i) => l[0].charAt(0) === '@' ? `<i class="ev" data-i="${i}"></i>` : `<i data-i="${i}" style="--w:${Math.max(8, l[1].length)}"></i>`).join('')}</div>
          <div class="controls">
            <button type="button" class="btn primary" id="btn-start"></button>
            <button type="button" class="btn icon" id="btn-pause" hidden aria-label="一時停止" data-tip="一時停止(Esc)">${icon('pause')}</button>
            <button type="button" class="btn icon" id="btn-resume" hidden aria-label="再開" data-tip="再開(Esc)。いまの発言の頭から">${icon('play')}</button>
            <button type="button" class="btn icon" id="btn-stop" hidden aria-label="終了" data-tip="会議を終える(再生回数を1回使います)">${icon('stop')}</button>
            <span class="spacer"></span>
            <span class="plays" id="plays" tabindex="0" data-tip="残りの再生回数(1つの会議につき${MAX_PLAYS}回)"></span>
          </div>
          <div class="room-foot">
            <label class="switch" data-tip="話す速さ">${icon('clock')}<select id="sel-rate" aria-label="話す速さ">${[0.8, 0.9, 1, 1.1, 1.25, 1.4].map((r) => `<option value="${r}" ${Number(settings.rate) === r ? 'selected' : ''}>${r}倍速</option>`).join('')}</select></label>
            <label class="switch" data-tip="発言を文字で表示します。今回のXPは半分になります"><input type="checkbox" id="opt-sub">字幕</label>
          </div>
          <p class="voice-note" id="voice-note"></p>
        </section>

        <section class="card notebook" aria-label="ノート">
          <div class="nb-tabs" role="tablist">
            <button type="button" class="nb-tab" role="tab" data-tab="minutes" aria-selected="true">${icon('file')}議事録 <small>提出用</small></button>
            <button type="button" class="nb-tab" role="tab" data-tab="memo" aria-selected="false">${icon('pen')}メモ <small>採点されません</small></button>
            <div class="nb-tools" id="nb-tools">
              <select id="tpl-select" aria-label="テンプレート"></select>
              <button type="button" class="btn sm" id="btn-tpl-insert" data-tip="テンプレートを入れる(空なら全体を置き換え)">挿入</button>
              <button type="button" class="btn sm icon" id="btn-tpl-save" aria-label="テンプレートとして保存" data-tip="いまの内容をテンプレートとして保存">${icon('save')}</button>
              <button type="button" class="btn sm icon" id="btn-tpl-manage" aria-label="テンプレートの管理" data-tip="テンプレートの管理">${icon('sliders')}</button>
            </div>
          </div>
          <div class="nb-pane" data-pane="minutes"><textarea id="minutes" placeholder="ここに議事録をまとめます。右上の「挿入」でテンプレートを入れると、見出しがそろいます。"></textarea></div>
          <div class="nb-pane" data-pane="memo" hidden><textarea id="memo" class="memo" placeholder="聞きながらの走り書きに。例)&#10;高木 社長に確認 → 13日&#10;KPI 30% 30% 90%"></textarea></div>
          <div class="nb-foot">
            <span class="state" id="save-state">${icon('check')}自動で保存されます</span>
            <span class="count num" id="char-count">0文字</span>
            <div class="btns">
              <button type="button" class="btn sm ghost" id="btn-clear">白紙に戻す</button>
              <button type="button" class="btn accent" id="btn-submit">${icon('seal')}提出して採点</button>
            </div>
          </div>
        </section>
      </div>`;

    tplData = Store.templates();
    const draft = Store.draft(ep.id);
    const def = tplData.defaultId && Templates.find(tplData, tplData.defaultId);
    $('minutes').value = draft ? draft.minutes || '' : def ? def.body : '';
    $('memo').value = draft ? draft.memo || '' : '';
    if (draft && (draft.minutes || draft.memo)) toast('書きかけの議事録を復元しました');
    renderTplSelect(ep.series === 'maou' && !tplData.defaultId ? 'builtin-maou' : null);
    setBrief(true);
    updateCount();
    updatePlays();
    wirePlay();
    show('play');
    Bgm.play(Bgm.trackFor(ep.series, ep));
    Bgm.ambience(null);
    Speech.ready().then(() => { if (session && session.ep === ep) updateVoiceNote(); });
    updateVoiceNote();
  }

  function setBrief(open) {
    $('brief').hidden = !open;
    $('btn-brief').innerHTML = `${icon('file')}ブリーフィングを${open ? '閉じる' : '開く'}`;
  }

  function updateVoiceNote() {
    if (!session) return;
    const vs = Speech.voices();
    let msg;
    if (!Speech.supported) msg = 'このブラウザは音声読み上げに対応していません。字幕だけで会議が進みます。';
    else if (!vs.length) msg = '日本語の音声が見つかりません。字幕だけで会議が進みます(Microsoft Edge や Chrome を推奨)。';
    else {
      const v = Speech.assign(peopleOf(session.ep));
      const natural = vs.some((x) => /natural|online|neural/i.test(x.name));
      msg = `日本語の音声 ${vs.length}種類を使用${v.shared ? '(足りない分は声の高さで区別)' : ''}。${natural ? '' : 'Microsoft Edge では、より自然な声で聞けます。'}`;
    }
    $('voice-note').textContent = msg;
  }

  function updatePlays() {
    if (!session) return;
    $('plays').innerHTML = `${Array.from({ length: MAX_PLAYS }, (_, i) => `<i class="${i < session.playsLeft ? '' : 'off'}"></i>`).join('')}<span>残り${session.playsLeft}回</span>`;
    const st = session.speech ? session.speech.state : 'idle';
    const playing = st === 'playing';
    const paused = st === 'paused';
    $('btn-start').hidden = playing || paused;
    $('btn-start').disabled = session.playsLeft <= 0;
    $('btn-start').innerHTML = session.playsLeft <= 0 ? '再生回数を使い切りました' : session.playsLeft < MAX_PLAYS ? `${icon('replay')}もう一度聞く` : `${icon('play')}会議を始める`;
    $('btn-pause').hidden = !playing;
    $('btn-resume').hidden = !paused;
    $('btn-stop').hidden = !(playing || paused);
    $('rec').classList.toggle('on', playing);
  }

  function setSpeaker(name) {
    document.querySelectorAll('#seats .seat[data-name]').forEach((t) => t.classList.toggle('speaking', t.dataset.name === name));
  }
  function setCaption(name, text) {
    const cap = $('caption');
    const people = peopleOf(session.ep);
    cap.style.setProperty('--c', name && people[name] ? people[name].color : '');
    cap.querySelector('.who').textContent = name || '';
    cap.querySelector('.txt').textContent = text;
  }
  function markTimeline(i) {
    document.querySelectorAll('#tl i').forEach((el) => {
      const k = Number(el.dataset.i);
      el.classList.toggle('done', k < i);
      el.classList.toggle('now', k === i);
    });
  }
  const subtitlesOn = () => $('opt-sub').checked;

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
    setBrief(false);
    document.querySelectorAll('#seats .seat[data-name]').forEach((t) => t.classList.toggle('away', session.late.has(t.dataset.name)));
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
        setCaption(name, subtitlesOn() ? fill(text) : '発言中……(字幕はオフです)');
      },
      onEvent(i, [kind, name]) {
        markTimeline(i);
        setSpeaker(null);
        const seat = document.querySelector(`#seats .seat[data-name="${CSS.escape(name)}"]`);
        if (kind === '@join') {
          if (seat) seat.classList.remove('away');
          Sfx.play('join', s.theme);
          setCaption(null, s.theme === 'maou' ? `——${name}が入室しました——` : `——${name}さんが会議に参加しました——`);
        } else if (kind === '@leave') {
          if (seat) seat.classList.add('away');
          Sfx.play('leave', s.theme);
          setCaption(null, s.theme === 'maou' ? `——${name}が退室しました——` : `——${name}さんが退出しました——`);
        }
      },
      onState() { updatePlays(); },
      onEnd() {
        setSpeaker(null);
        markTimeline(ep.script.length);
        session.endedAt = Date.now();
        Sfx.play('end', s.theme);
        setCaption(null, session.playsLeft > 0 ? '会議が終わりました。議事録をまとめて提出しましょう(もう一度聞くこともできます)。' : '会議が終わりました。議事録をまとめて提出しましょう。');
        updatePlays();
        saveDraftNow();
      },
    });
    // 会議中は曲を止め、部屋の環境音だけにする(聞き取りの邪魔をしない)
    Bgm.play(null, { fade: 1 });
    Bgm.ambience(s.theme);
    Sfx.play('start', s.theme);
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
  }

  function togglePause() {
    if (!session || !session.speech) return;
    if (session.speech.state === 'playing') { session.speech.pause(); setSpeaker(null); setCaption(null, '一時停止中 — Esc か ▶ で、いまの発言の頭から再開します。'); }
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
    document.querySelectorAll('.nb-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('.nb-pane').forEach((p) => { p.hidden = p.dataset.pane !== name; });
    $('nb-tools').style.visibility = name === 'minutes' ? '' : 'hidden';
    $(name === 'minutes' ? 'minutes' : 'memo').focus();
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
      if (el) el.innerHTML = `${icon('check')}保存しました ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
    }, 600);
  }

  function wirePlay() {
    $('btn-start').addEventListener('click', startMeeting);
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-resume').addEventListener('click', togglePause);
    $('btn-stop').addEventListener('click', stopMeeting);
    $('btn-brief').addEventListener('click', () => setBrief($('brief').hidden));
    $('sel-rate').addEventListener('change', (e) => {
      const r = Number(e.target.value) || 1;
      saveSettings({ rate: r });
      if (session && session.speech) session.speech.setRate(r);
    });
    $('opt-sub').addEventListener('change', (e) => {
      if (e.target.checked) {
        if (session) session.assist = true;
        toast('字幕オン — 今回のXPは半分になります');
      }
    });
    $('minutes').addEventListener('input', () => { updateCount(); scheduleSave(); });
    $('memo').addEventListener('input', scheduleSave);
    document.querySelectorAll('.nb-tab').forEach((b) => b.addEventListener('click', () => { Sfx.play('tick'); setTab(b.dataset.tab); }));
    $('btn-tpl-insert').addEventListener('click', () => { Sfx.play('pen'); insertTemplate($('tpl-select').value); });
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
    Bgm.ambience(null);

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
      newBadges, shown: false, tab: 'pen',
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
    r.traps.forEach((t) => mark(t.item, 'bad', `引っかけ: ${t.label}。${t.why}`));
    r.points.forEach((p) => {
      if (!p.item) return;
      if (p.perfect) mark(p.item, 'good', p.label);
      else mark(p.item, 'warn', `${p.label} — ${p.hints.join('/')}`);
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
    const foundN = r.points.filter((p) => p.found).length;
    const people = peopleOf(ep);
    const storyReady = Game.clearedSet(Store.history()).has(ep.id);
    const nextOpen = R.nextEp && Game.isUnlocked(R.nextEp, Store.history(), settings);

    const events = [];
    if (R.isBest) events.push(['trend', `自己ベストを更新(前回 ${R.prevBest}点)`]);
    if (R.lvAfter.level > R.lvBefore.level) events.push(['star', `レベルアップ — Lv.${R.lvAfter.level}「${R.lvAfter.title}」`]);
    if (R.unlocked) events.push(['lock', `第${R.unlocked.no}話「${R.unlocked.title}」が解放されました`]);
    R.newBadges.forEach((id) => { const b = Game.BADGES.find((x) => x.id === id); events.push([BADGE_ICON[id] || 'star', `バッジ「${b.name}」を獲得`]); });

    const pointLi = (p) => {
      const st = p.perfect ? ['s-ok', 'check'] : p.found || p.partial ? ['s-warn', 'tri'] : ['s-ng', 'x'];
      const line = src[p.id];
      return `<li><span class="st ${st[0]}">${icon(st[1])}</span><span><span class="lbl">${esc(fill(p.label))}</span>${p.weight > 1 ? '<span class="imp">重要</span>' : ''}
        ${p.perfect ? '' : `<span class="hint-ng">${esc(p.hints.join('/'))}</span>`}
        ${p.item ? `<span class="quote">${esc(p.item.text)}</span>` : ''}
        ${!p.perfect && p.why ? `<span class="why">${esc(p.why)}</span>` : ''}</span>
        ${line >= 0 ? `<button type="button" class="jump" data-action="jump" data-line="${line}">台本 ${icon('right')}</button>` : '<span></span>'}</li>`;
    };
    const groups = TYPE_ORDER.map((t) => [t, r.points.filter((p) => p.type === t)]).filter(([, g]) => g.length);

    const panels = {
      pen: `<div class="pen-grid">
        <div class="doc"><div class="legend"><span>よく書けた</span><span class="lw">不足あり</span><span class="lb">誤り</span></div><div class="redpen">${pen.html}</div></div>
        <div>
          ${pen.notes.length ? `<ol class="margin-notes">${pen.notes.map((n, i) => `<li class="k-${n.kind}"><span class="n">${i + 1}</span><span>${esc(fill(n.msg))}</span></li>`).join('')}</ol>` : '<p class="hint">印をつけられる箇所がありませんでした。「要点チェック」を確認しましょう。</p>'}
          ${r.notes.length ? `<div class="doc" style="margin-top:16px;padding:16px 20px"><span class="eyebrow">構成のアドバイス</span><ul class="notes-list" style="margin-top:6px">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
        </div></div>`,
      points: `<div class="doc">${groups.map(([t, g]) => `<div class="pgroup"><h4>${TYPE_LABEL[t]}</h4><ul class="plist">${g.map(pointLi).join('')}</ul></div>`).join('')}</div>`,
      traps: `<ul class="traps">${allTraps.map((t) => {
        const hit = r.traps.find((x) => x.id === t.id);
        return hit
          ? `<li class="hit"><div class="h">${icon('x')}${esc(t.label)}</div><p>${esc(t.why || '')}</p><div class="q">${esc(hit.item.text)}</div></li>`
          : `<li class="safe"><div class="h">${icon('check')}回避 — ${esc(t.label.replace(/書いている$/, '書いていない'))}</div><p>${esc(t.why || '')}</p></li>`;
      }).join('')}</ul>`,
      model: `<div class="compare"><div><h4>あなたの議事録</h4><pre>${esc(R.text)}</pre></div><div><h4>模範解答</h4><pre class="model">${esc(fill(ep.model))}</pre></div></div>`,
      script: `<div class="doc"><ol class="script" id="res-script">${ep.script.map((l, i) => {
        if (l[0].charAt(0) === '@') return `<li class="ev" id="sl-${i}">——${esc(l[1])}${l[0] === '@join' ? 'が参加' : 'が退出'}——</li>`;
        const tags = ep.points.filter((p) => src[p.id] === i).map((p) => `<span class="tag plain">${TYPE_LABEL[p.type]}</span>`).join('');
        return `<li id="sl-${i}" class="${tags ? 'src' : ''}" style="--c:${people[l[0]] ? people[l[0]].color : '#555'}"><b>${esc(l[0])}</b><span>${esc(fill(l[1]))}${tags ? `<span class="tags">${tags}</span>` : ''}</span></li>`;
      }).join('')}</ol></div>`,
    };
    const tabs = [
      ['pen', '赤ペン添削', ''],
      ['points', '要点チェック', `<span class="cnt">${foundN}/${r.points.length}</span>`],
      ['traps', '引っかけ', `<span class="cnt ${r.traps.length ? 'ng' : ''}">${allTraps.length - r.traps.length}/${allTraps.length}</span>`],
      ['model', '模範解答と比較', ''],
      ['script', '台本', ''],
    ];

    $('view-result').innerHTML = `
      <nav class="crumbs"><button type="button" data-action="home">${icon('left')}ホーム</button><span>/</span><button type="button" data-action="series" data-id="${s.id}">${esc(s.name)}</button><span>/</span><span>第${ep.no}話 結果</span></nav>
      <div class="play-head"><div><div class="sub">${esc(epTag(ep))} ${lvTag(ep.level)}</div><h1>${esc(ep.title)} — 審査結果</h1></div></div>
      <section class="card report-head">
        <div class="seal-col">${seal(r.rank)}</div>
        <div class="score-col">
          <span class="eyebrow">総合得点</span>
          <div class="score num"><span id="res-total">0</span><small>/ 100</small></div>
          <div class="verdict">${pass ? `<span class="tag ok">${icon('check')}${R.firstClear ? 'クリア' : 'クリア済み'}</span>` : `<span class="tag new">あと${Scorer.CLEAR - r.total}点でクリア</span>`}${R.entry.assist ? '<span class="tag plain">字幕あり</span>' : ''}</div>
          <p class="xp">獲得 <b class="num">+${R.xpParts.xp} XP</b>(${R.xpParts.parts.map((p) => `${esc(p.label)} ${p.xp}`).join('・')})${R.entry.writeSec != null ? ` ・ 会議終了から提出まで ${fmtSec(R.entry.writeSec)}` : ''}</p>
          ${events.length ? `<ul class="events">${events.map(([ic, t]) => `<li>${icon(ic)}${esc(t)}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="axes-col"><div class="axes">${Scorer.AXES.map((a) => {
          const v = r.axes[a.id];
          const max = Scorer.WEIGHT[a.id];
          const k = v / max;
          return `<div class="axis"><div class="row1"><span>${a.name}</span><span>${v} / ${max}</span></div><div class="bar ${k >= 0.8 ? 'good' : k >= 0.5 ? '' : 'warn'}"><i style="width:${Math.round(k * 100)}%"></i></div><small>${esc(a.desc)}</small></div>`;
        }).join('')}</div></div>
      </section>
      ${storyReady ? `<div class="card story-strip ${s.theme}">${icon('open')}<span class="t">物語の続き —<b>「${esc(ep.epilogue.title)}」</b>${R.firstClear ? 'が解放されました' : ''}</span><button type="button" class="btn sm" data-action="story" data-id="${ep.id}">読む ${icon('right')}</button></div>` : ''}

      <div class="rtabs" role="tablist">${tabs.map(([id, name, extra]) => `<button type="button" class="rtab" role="tab" data-rtab="${id}" aria-selected="${R.tab === id}">${name}${extra}</button>`).join('')}</div>
      ${tabs.map(([id]) => `<div class="rpanel" data-rpanel="${id}" ${R.tab === id ? '' : 'hidden'}>${panels[id]}</div>`).join('')}

      <div class="result-actions">
        <div class="btns">
          <button type="button" class="btn" data-action="retry" data-id="${ep.id}">${icon('replay')}白紙から再挑戦</button>
          <button type="button" class="btn" data-action="retry-keep" data-id="${ep.id}">${icon('pen')}この議事録を直して再挑戦</button>
        </div>
        ${nextOpen ? `<button type="button" class="btn primary lg" data-action="play" data-id="${R.nextEp.id}">第${R.nextEp.no}話へ進む ${icon('right')}</button>` : `<button type="button" class="btn primary" data-action="series" data-id="${s.id}">${esc(s.name)}の目次へ</button>`}
      </div>`;
    document.querySelectorAll('[data-rtab]').forEach((b) => b.addEventListener('click', () => { Sfx.play('tick'); setResultTab(b.dataset.rtab); }));
    show('result');

    countUp($('res-total'), r.total);
    const track = Bgm.trackFor(ep.series, ep);
    if (R.shown) { Bgm.play(track); return; }
    R.shown = true;
    const stampEl = document.querySelector('.report-head .seal');
    if (stampEl && !reducedMotion) stampEl.classList.add('pop');
    // 朱印 → 物語ごとのファンファーレ → ごほうびの音 → 曲が戻る
    Bgm.play(null, { fade: 0.6 });
    Sfx.play('stamp');
    effectTimers.push(setTimeout(() => Sfx.play(r.rank === 'S' ? 'great' : pass ? 'good' : 'meh', s.theme), 450));
    if (r.rank === 'S' || R.firstClear || R.isBest) confetti(r.rank === 'S' ? 90 : 50);
    const extra = [];
    if (R.lvAfter.level > R.lvBefore.level) extra.push('levelup');
    if (R.unlocked) extra.push('unlock');
    if (R.newBadges.length) extra.push('badge');
    extra.forEach((name, i) => effectTimers.push(setTimeout(() => Sfx.play(name), 2300 + i * 700)));
    Bgm.play(track, { delay: 3.5 + extra.length * 0.7, fade: 4 });
  }
  // 結果画面の遅れて鳴る演出は、画面を離れたら取り消す
  const effectTimers = [];
  function clearEffects() {
    effectTimers.splice(0).forEach(clearTimeout);
    const box = $('toasts');
    if (box) box.innerHTML = '';
  }

  function setResultTab(id) {
    if (lastResult) lastResult.tab = id;
    document.querySelectorAll('[data-rtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.rtab === id)));
    document.querySelectorAll('[data-rpanel]').forEach((p) => { p.hidden = p.dataset.rpanel !== id; });
  }

  function jumpToLine(i) {
    setResultTab('script');
    const el = $('sl-' + i);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  // ---------------------------------------------------------------- 物語(プロローグ・その後)
  function chatHtml(s, messages) {
    return `<div class="chat-frame"><div class="chat">${messages.map((m) => {
      const c = s.cast[m.from] || {};
      const where = m.to === 'DM' ? 'あなたへのDM' : m.to;
      return `<div class="msg">${avatar(s.id, m.from, c)}<div><div class="head"><b>${esc(c.full || m.from)}</b><span class="chan">${esc(where)}</span>${m.time ? `<span>${esc(m.time)}</span>` : ''}</div><div class="bubble">${esc(fill(m.text))}</div></div></div>`;
    }).join('')}</div></div>`;
  }

  function openStory(epId) {
    const ep = Data.byId(epId);
    if (!ep) return;
    const s = Data.series[ep.series];
    const e = ep.epilogue;
    $('dlg-story-title').textContent = `${epTag(ep)} その後 — ${e.title}`;
    $('story-body').innerHTML = e.kind === 'chat'
      ? `<p class="hint" style="margin-bottom:12px">会議のあと、プロジェクトのチャットに届いたメッセージ</p>${chatHtml(s, e.messages)}`
      : `<div class="story ${s.theme}">${e.text.map((t) => `<p>${esc(fill(t))}</p>`).join('')}</div>`;
    const list = Data.episodesOf(ep.series);
    const next = list[list.indexOf(ep) + 1];
    const h = Store.history();
    $('story-foot').innerHTML = next && Game.isUnlocked(next, h, settings)
      ? `<button type="button" class="btn primary" data-action="play" data-id="${next.id}">第${next.no}話「${esc(next.title)}」へ ${icon('right')}</button>`
      : `<span class="hint">${ep.finale ? '——完。最後まで記録してくれて、ありがとう。' : next ? '' : '続きの話は準備中です。'}</span>`;
    Store.markStoryRead(ep.id);
    Sfx.play('page');
    openDialog('dlg-story');
  }

  function openPrologue(seriesId) {
    const s = Data.series[seriesId];
    const first = Data.episodesOf(seriesId)[0];
    $('dlg-story-title').textContent = `プロローグ — ${s.title}`;
    $('story-body').innerHTML = `<div class="story ${s.theme}">${s.prologue.map((t) => `<p>${esc(fill(t))}</p>`).join('')}</div>`;
    $('story-foot').innerHTML = first ? `<button type="button" class="btn primary" data-action="play" data-id="${first.id}">第1話「${esc(first.title)}」へ ${icon('right')}</button>` : '';
    Sfx.play('page');
    openDialog('dlg-story');
  }

  // ---------------------------------------------------------------- 設定・はじめに
  function nameFields(prefix, blank) {
    return `
      <div class="field"><label for="${prefix}-name">あなたの名前(名字)</label><input type="text" id="${prefix}-name" maxlength="12" value="${blank ? '' : esc(settings.playerName)}" placeholder="例: 皆川(空欄なら「皆川」)">
        <span class="hint">仕事編の会議では、この名前で呼ばれ、ToDoを振られることもあります。魔王軍編では「書記官」と呼ばれます。</span></div>
      <div class="field"><label for="${prefix}-reading">名前の読み(ひらがな)</label><input type="text" id="${prefix}-reading" maxlength="20" value="${blank ? '' : esc(settings.playerReading)}" placeholder="例: みながわ">
        <span class="hint">会議の音声が、この読みであなたを呼びます。</span></div>`;
  }

  function openSettings() {
    const vs = Speech.voices();
    $('settings-body').innerHTML = `
      <div class="set-group"><h4>プレイヤー</h4>${nameFields('st')}</div>
      <div class="set-group"><h4>会議</h4>
        <div class="field"><label for="st-rate">話す速さ</label><select id="st-rate">${[0.8, 0.9, 1, 1.1, 1.25, 1.4].map((r) => `<option value="${r}" ${Number(settings.rate) === r ? 'selected' : ''}>${r}倍速</option>`).join('')}</select></div>
        <label class="check"><input type="checkbox" id="st-unlock" ${settings.unlockAll ? 'checked' : ''}><span>すべての話を解放する<br><small class="hint">順番に関係なく遊べます</small></span></label>
      </div>
      <div class="set-group"><h4>BGM・効果音</h4>
        ${GQ.Audio.supported ? `
        <div class="field range"><label for="st-bgm">${icon('music')}BGM<output id="st-bgm-v">${settings.bgmVol}</output></label><input type="range" id="st-bgm" min="0" max="100" step="5" value="${settings.bgmVol}"></div>
        <div class="field range"><label for="st-sfxv">${icon('sound')}効果音<output id="st-sfxv-v">${settings.sfxVol}</output></label><input type="range" id="st-sfxv" min="0" max="100" step="5" value="${settings.sfxVol}"></div>
        <label class="check"><input type="checkbox" id="st-amb" ${settings.ambience ? 'checked' : ''}><span>会議中に部屋の環境音を流す<br><small class="hint">会議中はBGMを止め、空調やタイピング(魔王軍編は暖炉と風)の音だけを小さく流します</small></span></label>
        <label class="check"><input type="checkbox" id="st-mute" ${settings.muted ? 'checked' : ''}><span>すべての音を消す<br><small class="hint">画面右上の${icon('sound')}でも切り替えられます。会議の音声は消えません</small></span></label>`
        : '<p class="hint">このブラウザは効果音・BGMに対応していません。</p>'}
      </div>
      <div class="set-group"><h4>音声のチェック</h4>
        <p class="hint">${!Speech.supported ? 'このブラウザは音声読み上げに対応していません。' : vs.length ? `日本語の音声: ${vs.map((v) => esc(v.name)).join(' / ')}` : '日本語の音声が見つかりません(読み込み中の場合は、少し待って開き直してください)。'}</p>
        <div class="btns" style="margin-top:10px"><button type="button" class="btn sm" id="st-try-work">${icon('sound')}仕事編の声</button><button type="button" class="btn sm" id="st-try-maou">${icon('sound')}魔王軍編の声</button></div>
      </div>
      <div class="set-group"><h4>記録</h4>
        <p class="hint">${Store.persistent ? '記録はこのブラウザに保存されています。' : 'このブラウザでは保存領域が使えないため、ページを閉じると記録が消えます。'}</p>
        <div class="btns" style="margin-top:10px"><button type="button" class="btn sm danger" id="st-reset">記録をリセット</button><span class="hint">テンプレートと設定は残ります</span></div>
      </div>`;
    const commitName = () => {
      saveSettings({ playerName: $('st-name').value.trim(), playerReading: $('st-reading').value.trim() });
      sourceCache.clear();
      renderMe();
    };
    $('st-name').addEventListener('change', commitName);
    $('st-reading').addEventListener('change', commitName);
    $('st-rate').addEventListener('change', (e) => saveSettings({ rate: Number(e.target.value) || 1 }));
    if (GQ.Audio.supported) {
      [['st-bgm', 'bgmVol'], ['st-sfxv', 'sfxVol']].forEach(([id, key]) => {
        $(id).addEventListener('input', (e) => { settings[key] = Number(e.target.value); $(id + '-v').textContent = e.target.value; applySound(); });
        $(id).addEventListener('change', (e) => { saveSettings({ [key]: Number(e.target.value) }); if (key === 'sfxVol') Sfx.play('badge'); });
      });
      $('st-amb').addEventListener('change', (e) => saveSettings({ ambience: e.target.checked }));
      $('st-mute').addEventListener('change', (e) => saveSettings({ muted: e.target.checked }));
    }
    $('st-unlock').addEventListener('change', (e) => { saveSettings({ unlockAll: e.target.checked }); if (currentView === 'home' || currentView === 'series') route(); });
    const tryVoice = (sid, who, text) => {
      const s = Data.series[sid];
      if (!Speech.sample(Speech.applyReadings(text.replace(/\{player\}/g, player().reading), s.readings), s.cast, who, settings.rate)) toast('音声を再生できませんでした');
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
      <p>会議の音声を聞いて<b>議事録</b>を書き、採点を受けるゲームです。決まったこと、まだ決まっていないこと、誰が・何を・いつまでに——を書き分けましょう。</p>
      <p style="margin:12px 0 20px" class="hint">物語は2つ。生成AIでコールセンターを変える<b>仕事編</b>と、勇者を迎え撃つ<b>魔王軍編</b>。どちらも話数の順に進みます。会議には音声が出ます。</p>
      ${nameFields('wl', true)}`;
    $('welcome-start').onclick = () => {
      saveSettings({ playerName: $('wl-name').value.trim() || '皆川', playerReading: $('wl-reading').value.trim() || ($('wl-name').value.trim() ? '' : 'みながわ'), welcomed: true });
      $('dlg-welcome').close();
      Sfx.play('open');
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
      `<optgroup label="マイテンプレート">${tplData.items.length ? tplData.items.map((t) => `<option value="${t.id}">${esc(t.name)}${tplData.defaultId === t.id ? '(自動)' : ''}</option>`).join('') : '<option disabled>(まだありません)</option>'}</optgroup>`;
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
    const row = (t) => `<button type="button" class="tpl-item ${t.id === tplEditingId ? 'sel' : ''}" data-tpl="${t.id}"><span>${esc(t.name)}</span>${tplData.defaultId === t.id ? '<small>自動</small>' : ''}</button>`;
    $('tpl-list').innerHTML = '<h4>組み込み</h4>' + Templates.BUILTIN.map(row).join('') +
      '<h4>マイテンプレート</h4>' + (tplData.items.length ? tplData.items.map(row).join('') : '<p class="hint">まだありません。</p>');
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
    toast('テンプレートを保存しました');
  }
  function deleteTpl() {
    const t = tplEditingId && Templates.find(tplData, tplEditingId);
    if (!t || t.builtin || !confirm(`「${t.name}」を削除しますか?`)) return;
    tplData = Templates.remove(tplData, tplEditingId);
    Store.saveTemplates(tplData);
    renderTplSelect();
    loadTplEditor(null);
    toast('テンプレートを削除しました');
  }
  $('tpl-save').addEventListener('click', saveTpl);
  $('tpl-delete').addEventListener('click', deleteTpl);
  $('tpl-new').addEventListener('click', () => loadTplEditor(null));

  // ---------------------------------------------------------------- ルール説明
  let helpBuilt = false;
  function openHelp(topic) {
    const body = $('help-body');
    if (!helpBuilt) {
      body.innerHTML = Help.sections().map((sec) => `<details id="help-${sec.id}"><summary>${esc(sec.title)}</summary><div class="hbody">${sec.html}</div></details>`).join('');
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

  // ---------------------------------------------------------------- 操作
  document.addEventListener('click', (e) => {
    const helpEl = e.target.closest && e.target.closest('[data-help]');
    if (helpEl) { e.preventDefault(); openHelp(helpEl.dataset.help); return; }
    const a = e.target.closest && e.target.closest('[data-action]');
    if (!a) { if (!(e.target.closest && e.target.closest('[data-tip]'))) tip.hide(); return; }
    const id = a.dataset.id;
    const dlg = a.closest('dialog');
    if (a.dataset.action !== 'mute' && a.dataset.action !== 'story' && a.dataset.action !== 'prologue') Sfx.play(a.dataset.action === 'play' ? 'page' : 'tick');
    switch (a.dataset.action) {
      case 'mute': saveSettings({ muted: !settings.muted }); if (!settings.muted) Sfx.play('tick'); break;
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
    if (e.key !== 'Escape') return;
    tip.hide();
    if (currentView === 'play' && session && session.speech && !e.isComposing && !document.querySelector('dialog[open]')) {
      if (session.speech.state === 'playing' || session.speech.state === 'paused') { e.preventDefault(); togglePause(); }
    }
  });
  root.addEventListener('hashchange', route);
  root.addEventListener('pagehide', saveDraftNow);

  // ---------------------------------------------------------------- 起動
  if (Store.badges() === null) Store.saveBadges(Game.badgesOf(Store.history(), []));
  route();
  if (!settings.welcomed) openWelcome();
})(typeof globalThis !== 'undefined' ? globalThis : this);
