/* 議事録クエスト — シリーズ(物語)とエピソード(会議)の登録。
 * データファイルは index.html の <script> で読み込まれ、ここに登録される。
 * シナリオの書き方は docs/authoring.md、物語の設定は docs/story-work.md / docs/story-maou.md を参照。 */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});
  const series = {};
  const episodes = [];
  const LEVELS = ['初級', '中級', '上級'];

  function addSeries(def) {
    series[def.id] = def;
  }

  function addEpisode(def) {
    if (!series[def.series]) throw new Error(`シリーズ ${def.series} が未登録です(${def.id})`);
    episodes.push(def);
    episodes.sort((a, b) => (a.series === b.series ? a.no - b.no : a.series < b.series ? -1 : 1));
  }

  const byId = (id) => episodes.find((e) => e.id === id) || null;
  const episodesOf = (seriesId) => episodes.filter((e) => e.series === seriesId);
  const seriesList = () => Object.values(series).sort((a, b) => (a.order || 0) - (b.order || 0));

  // 台本の {player} を、プレイヤーの名前(表示用)に置き換える
  const fill = (text, player) => String(text || '').replace(/\{player\}/g, (player && player.name) || 'あなた');

  GQ.Data = { series, episodes, LEVELS, addSeries, addEpisode, byId, episodesOf, seriesList, fill };
})(typeof globalThis !== 'undefined' ? globalThis : this);
