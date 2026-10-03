// 履歴・ゲーム要素(XP/レベル/連続日数/バッジ)・議事録テンプレートのロジック。
// 画面に依存しない純粋な関数と、localStorage への薄い入出力だけで構成する。
const Game = (function () {
  const TITLES = ['見習い書記', '新人記録係', '議事録ルーキー', '会議の名脇役', 'まとめ上手', '議事録の達人', 'PMOエース', '伝説のファシリテーター'];

  const dayKey = (t) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const DAY = 86400000;

  // 初クリア(シナリオごと最初の1回)+20、Sランク+30 を加えた累計XP
  function xpOf(history) {
    const seen = new Set();
    return history.reduce((sum, h) => {
      let xp = h.total;
      if (!seen.has(h.scenarioId)) { xp += 20; seen.add(h.scenarioId); }
      if (h.rank === 'S') xp += 30;
      return sum + xp;
    }, 0);
  }

  // level = floor(sqrt(xp/60)) + 1。次のレベルは 60 × level² XP
  function levelInfo(xp) {
    const level = Math.floor(Math.sqrt(xp / 60)) + 1;
    const floor = 60 * (level - 1) * (level - 1);
    const next = 60 * level * level;
    return {
      level,
      title: TITLES[Math.min(level - 1, TITLES.length - 1)],
      xp,
      floor,
      next,
      pct: Math.min(100, Math.round(((xp - floor) / (next - floor)) * 100)),
    };
  }

  function days(history) {
    return [...new Set(history.map((h) => dayKey(h.at)))];
  }

  // 今日(または昨日)から遡った連続プレイ日数
  function streakOf(history, now = Date.now()) {
    const set = new Set(days(history));
    let cur = set.has(dayKey(now)) ? now : set.has(dayKey(now - DAY)) ? now - DAY : null;
    let n = 0;
    while (cur !== null && set.has(dayKey(cur))) { n++; cur -= DAY; }
    return n;
  }

  function longestStreak(history) {
    const ts = [...new Set(history.map((h) => new Date(new Date(h.at).setHours(12, 0, 0, 0)).getTime()))].sort((a, b) => a - b);
    let best = 0, run = 0, prev = null;
    ts.forEach((t) => {
      run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = t;
    });
    return best;
  }

  const BADGES = [
    { id: 'first', icon: '🎬', name: 'はじめの一歩', desc: '初めて議事録を提出', test: (h) => h.length >= 1 },
    { id: 'five', icon: '📚', name: 'コツコツ書記', desc: '5回プレイ', test: (h) => h.length >= 5 },
    { id: 'rankA', icon: '🥈', name: 'Aランク到達', desc: 'Aランク以上を取る', test: (h) => h.some((x) => x.rank === 'A' || x.rank === 'S') },
    { id: 'rankS', icon: '🥇', name: 'Sランク到達', desc: 'Sランクを取る', test: (h) => h.some((x) => x.rank === 'S') },
    { id: 'clean', icon: '🛡️', name: 'ひっかけ回避', desc: '引っかけに掛からず60点以上', test: (h) => h.some((x) => x.traps === 0 && x.total >= 60) },
    { id: 'ai', icon: '🤖', name: 'AI添削デビュー', desc: 'AI採点を受ける', test: (h) => h.some((x) => x.ai) },
    { id: 'aiplus', icon: '✨', name: 'AIも唸る出来', desc: 'AIボーナスが+5以上', test: (h) => h.some((x) => x.bonus >= 5) },
    { id: 'streak3', icon: '🔥', name: '3日連続', desc: '3日連続でプレイ', test: (h) => longestStreak(h) >= 3 },
    { id: 'grow', icon: '📈', name: '成長の証', desc: '同じシナリオで前回より10点以上アップ', test: (h) => {
      const best = {};
      return h.some((x) => {
        const prev = best[x.scenarioId];
        best[x.scenarioId] = Math.max(prev === undefined ? -1 : prev, x.total);
        return prev !== undefined && x.total >= prev + 10;
      });
    } },
    { id: 'all', icon: '🏆', name: '全ステージ制覇', desc: '全シナリオで60点以上', test: (h, scenarios) => scenarios.length > 0 && scenarios.every((s) => h.some((x) => x.scenarioId === s.id && x.total >= 60)) },
  ];

  function badgesOf(history, scenarios) {
    return BADGES.filter((b) => b.test(history, scenarios)).map((b) => b.id);
  }

  function bestByScenario(history) {
    const best = {};
    history.forEach((h) => { if (!best[h.scenarioId] || h.total > best[h.scenarioId].total) best[h.scenarioId] = h; });
    return best;
  }

  return { TITLES, BADGES, xpOf, levelInfo, streakOf, longestStreak, badgesOf, bestByScenario, dayKey };
})();

// ---- 議事録テンプレート ----
const Templates = (function () {
  const BUILTIN = [
    {
      id: 'builtin-standard',
      name: '標準(決定/ToDo/課題/次回)',
      body: '【決定事項】\n・\n\n【ToDo】(誰が・何を・いつまでに)\n・\n\n【課題・懸念】\n・\n\n【次回予定】\n・',
    },
    {
      id: 'builtin-header',
      name: 'ヘッダー付き(日時・参加者つき)',
      body: '■ 会議名:\n■ 日時:\n■ 参加者:\n\n【決定事項】\n1.\n\n【ToDo】\n担当者 / 内容 / 期限\n・\n\n【未決事項・課題】\n・\n\n【次回】\n・',
    },
    {
      id: 'builtin-simple',
      name: 'シンプル(結論→TODO)',
      body: '【結論】\n・\n\n【TODO】\n・\n\n【気になる点】\n・',
    },
  ];

  const empty = () => ({ items: [], defaultId: null });
  const newId = () => 'my-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function all(data) { return [...BUILTIN.map((t) => ({ ...t, builtin: true })), ...data.items]; }
  function find(data, id) { return all(data).find((t) => t.id === id) || null; }

  // 追加または上書き。名前は空なら「マイテンプレート」。同名は連番を付けて区別する
  function save(data, { id, name, body }) {
    const items = data.items.slice();
    const base = (name || '').trim().slice(0, 40) || 'マイテンプレート';
    const idx = id ? items.findIndex((t) => t.id === id) : -1;
    const taken = new Set(items.filter((t) => t.id !== id).map((t) => t.name).concat(BUILTIN.map((t) => t.name)));
    let finalName = base, n = 2;
    while (taken.has(finalName)) finalName = `${base} (${n++})`;
    if (idx >= 0) {
      items[idx] = { ...items[idx], name: finalName, body, updatedAt: Date.now() };
      return { data: { ...data, items }, id };
    }
    const created = { id: newId(), name: finalName, body, updatedAt: Date.now() };
    items.push(created);
    return { data: { ...data, items }, id: created.id };
  }

  function remove(data, id) {
    return { items: data.items.filter((t) => t.id !== id), defaultId: data.defaultId === id ? null : data.defaultId };
  }

  function setDefault(data, id) { return { ...data, defaultId: id || null }; }

  // カーソル位置に挿入する。空欄なら全体を置き換える
  function insertInto(text, body, caret) {
    if (!text.trim()) return { text: body, caret: body.length };
    const pos = Math.min(Math.max(caret ?? text.length, 0), text.length);
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    const lead = before && !before.endsWith('\n') ? '\n\n' : '';
    const tail = after && !after.startsWith('\n') ? '\n\n' : '';
    const merged = before + lead + body + tail + after;
    return { text: merged, caret: (before + lead + body).length };
  }

  return { BUILTIN, empty, all, find, save, remove, setDefault, insertInto };
})();

// ---- 保存(localStorage) ----
const Store = (function () {
  const K = { history: 'pmo-minutes-history-v1', templates: 'pmo-minutes-templates-v1', seen: 'pmo-badges-seen-v1' };
  const read = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; }
  };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } };

  return {
    history: () => read(K.history, []),
    saveHistory: (h) => write(K.history, h.slice(-200)),
    templates: () => {
      const d = read(K.templates, null);
      return d && Array.isArray(d.items) ? { items: d.items, defaultId: d.defaultId || null } : Templates.empty();
    },
    saveTemplates: (d) => write(K.templates, d),
    seenBadges: () => read(K.seen, null),
    saveSeenBadges: (ids) => write(K.seen, ids),
  };
})();

if (typeof module !== 'undefined') module.exports = { Game, Templates, Store };
