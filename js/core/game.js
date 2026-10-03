/* 議事録クエスト — ゲーム要素(XP・レベル・称号・連続日数・エピソードの解放・バッジ)。
 * 画面に依存しない純粋な関数だけで構成する(テストで確認する)。
 * 履歴1件: { at, episodeId, series, total, rank, axes, traps, assist(字幕), writeSec(会議終了→提出の秒数) } */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});

  const TITLES = ['見習い書記', '新人記録係', 'メモ取りルーキー', '議事録の新星', 'まとめ上手', '決定事項ハンター', 'ToDoの番人', '会議の名脇役', 'PMOエース', '議事録マイスター', '伝説の書記官'];
  const XP = { firstTry: 10, firstClear: 30, rankS: 20, assistRate: 0.5, unit: 50 };
  const DAY = 86400000;

  const clearScore = () => GQ.Scorer.CLEAR;
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  // 1回のプレイで得たXPの内訳(履歴の順に計算する)
  function xpLog(history) {
    const tried = new Set();
    const cleared = new Set();
    return history.map((h) => {
      const parts = [{ label: h.assist ? '得点(字幕ありは半分)' : '得点', xp: Math.round(h.total * (h.assist ? XP.assistRate : 1)) }];
      if (!tried.has(h.episodeId)) { parts.push({ label: '初挑戦', xp: XP.firstTry }); tried.add(h.episodeId); }
      if (h.total >= clearScore() && !cleared.has(h.episodeId)) { parts.push({ label: '初クリア', xp: XP.firstClear }); cleared.add(h.episodeId); }
      if (h.rank === 'S') parts.push({ label: 'Sランク', xp: XP.rankS });
      return { parts, xp: parts.reduce((s, p) => s + p.xp, 0) };
    });
  }
  const xpOf = (history) => xpLog(history).reduce((s, x) => s + x.xp, 0);

  // Lv.n に必要な累計XP = 50 × (n−1)²
  const levelStart = (level) => XP.unit * (level - 1) * (level - 1);
  function levelInfo(xp) {
    const level = Math.floor(Math.sqrt(xp / XP.unit)) + 1;
    const floor = levelStart(level);
    const next = levelStart(level + 1);
    return { level, title: TITLES[Math.min(level - 1, TITLES.length - 1)], xp, floor, next, pct: Math.min(100, Math.round(((xp - floor) / (next - floor)) * 100)) };
  }

  function streakOf(history, now = Date.now()) {
    const set = new Set(history.map((h) => dayKey(h.at)));
    let cur = set.has(dayKey(now)) ? now : set.has(dayKey(now - DAY)) ? now - DAY : null;
    let n = 0;
    while (cur !== null && set.has(dayKey(cur))) { n++; cur -= DAY; }
    return n;
  }

  function longestStreak(history) {
    const ts = [...new Set(history.map((h) => new Date(new Date(h.at).setHours(12, 0, 0, 0)).getTime()))].sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    let prev = null;
    ts.forEach((t) => { run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t; });
    return best;
  }

  function bestByEpisode(history) {
    const best = {};
    history.forEach((h) => { if (!best[h.episodeId] || h.total > best[h.episodeId].total) best[h.episodeId] = h; });
    return best;
  }
  const clearedSet = (history) => new Set(history.filter((h) => h.total >= clearScore()).map((h) => h.episodeId));

  // エピソードの解放: シリーズ最初の話は最初から。以降は「ひとつ前の(実装済みの)話」をクリアすると解放
  function isUnlocked(ep, history, opts) {
    if (opts && opts.unlockAll) return true;
    const list = GQ.Data.episodesOf(ep.series);
    const i = list.indexOf(ep);
    return i <= 0 || clearedSet(history).has(list[i - 1].id);
  }

  // 次に遊ぶとよいエピソード(未クリアで解放済みの最初の話)
  function nextEpisode(seriesId, history, opts) {
    const cleared = clearedSet(history);
    return GQ.Data.episodesOf(seriesId).find((e) => !cleared.has(e.id) && isUnlocked(e, history, opts)) || null;
  }

  function seriesProgress(seriesId, history) {
    const list = GQ.Data.episodesOf(seriesId);
    const cleared = clearedSet(history);
    return { cleared: list.filter((e) => cleared.has(e.id)).length, total: list.length };
  }

  const allCleared = (eps, history) => { const c = clearedSet(history); return eps.length > 0 && eps.every((e) => c.has(e.id)); };
  const chapterEps = (seriesId, ch) => GQ.Data.episodesOf(seriesId).filter((e) => e.chapter === ch);

  const BADGES = [
    { id: 'first', icon: '🎬', name: 'はじめの一歩', desc: '初めて議事録を提出する', test: (h) => h.length >= 1 },
    { id: 'clear', icon: '🎉', name: '初クリア', desc: '60点以上をとる', test: (h) => h.some((x) => x.total >= 60) },
    { id: 'rankA', icon: '🥈', name: 'Aランク', desc: '75点以上をとる', test: (h) => h.some((x) => x.total >= 75) },
    { id: 'rankS', icon: '🥇', name: 'Sランク', desc: '90点以上をとる', test: (h) => h.some((x) => x.total >= 90) },
    { id: 'perfect', icon: '💯', name: 'パーフェクト', desc: '100点をとる', test: (h) => h.some((x) => x.total >= 100) },
    { id: 'clean', icon: '🛡️', name: '引っかけ回避', desc: '引っかけゼロで75点以上', test: (h) => h.some((x) => x.traps === 0 && x.total >= 75) },
    { id: 'sorter', icon: '🗂️', name: '分類の達人', desc: '「分類」で満点をとる(60点以上で)', test: (h) => h.some((x) => x.axes && x.axes.classify >= 15 && x.total >= 60) },
    { id: 'todo', icon: '📌', name: 'ToDoの番人', desc: '「ToDo」で満点をとる(60点以上で)', test: (h) => h.some((x) => x.axes && x.axes.todo >= 15 && x.total >= 60) },
    { id: 'ears', icon: '🎧', name: '耳だけで', desc: '字幕なしでAランク以上', test: (h) => h.some((x) => !x.assist && x.total >= 75) },
    { id: 'speed', icon: '⚡', name: 'スピード書記', desc: '会議終了から5分以内に提出して75点以上', test: (h) => h.some((x) => x.writeSec != null && x.writeSec <= 300 && x.total >= 75) },
    { id: 'grow', icon: '📈', name: '成長の証', desc: '同じ会議で前回より10点以上アップ', test: (h) => {
      const best = {};
      return h.some((x) => { const prev = best[x.episodeId]; best[x.episodeId] = Math.max(prev === undefined ? -1 : prev, x.total); return prev !== undefined && x.total >= prev + 10; });
    } },
    { id: 'ten', icon: '📚', name: 'コツコツ書記', desc: '10回プレイする', test: (h) => h.length >= 10 },
    { id: 'streak3', icon: '🔥', name: '3日連続', desc: '3日連続でプレイする', test: (h) => longestStreak(h) >= 3 },
    { id: 'streak7', icon: '🌋', name: '7日連続', desc: '7日連続でプレイする', test: (h) => longestStreak(h) >= 7 },
    { id: 'work1', icon: '🚀', name: '立ち上げ完了', desc: '仕事編 第1章(配信中の話)をすべてクリア', test: (h) => allCleared(chapterEps('work', 1), h) },
    { id: 'work3', icon: '💼', name: 'AX推進の立役者', desc: '仕事編(配信中の話)をすべてクリア', test: (h) => allCleared(GQ.Data.episodesOf('work'), h) },
    { id: 'maou1', icon: '🕯️', name: '新任書記官', desc: '魔王軍編 第1章(配信中の話)をすべてクリア', test: (h) => allCleared(chapterEps('maou', 1), h) },
    { id: 'maou3', icon: '📜', name: '和平の書記官', desc: '魔王軍編(配信中の話)をすべてクリア', test: (h) => allCleared(GQ.Data.episodesOf('maou'), h) },
    { id: 'all', icon: '🏆', name: '全会議制覇', desc: '配信中のすべての会議をクリア', test: (h) => allCleared(GQ.Data.episodes, h) },
  ];

  // 一度獲得したバッジは、後からエピソードが増えても失わない(earned を保存して和をとる)
  function badgesOf(history, earned) {
    const now = BADGES.filter((b) => b.test(history)).map((b) => b.id);
    return [...new Set([...(earned || []), ...now])];
  }

  GQ.Game = { TITLES, XP, BADGES, xpLog, xpOf, levelStart, levelInfo, streakOf, longestStreak, bestByEpisode, clearedSet, isUnlocked, nextEpisode, seriesProgress, badgesOf, dayKey };
})(typeof globalThis !== 'undefined' ? globalThis : this);
