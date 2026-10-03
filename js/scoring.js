// 議事録の採点(MVP: キーワード判定)。
// 将来LLM採点に差し替える場合は、同じ形の戻り値を返す evaluate() を用意すればUI側は変更不要。
const TYPE_LABELS = { decision: '決定事項', todo: 'ToDo', issue: '課題・懸念', next: '次回予定' };

function normalize(text) {
  // 全角英数を半角にし、大文字小文字を無視して比較する
  return text
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

function hit(point, text) {
  return point.all.every((group) => group.some((kw) => text.includes(normalize(kw))));
}

function rankOf(total) {
  return total >= 90 ? 'S' : total >= 75 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D';
}

function evaluate(scenario, minutes) {
  const text = normalize(minutes);

  // 1) 網羅性(70点)
  const results = scenario.keyPoints.map((p) => ({ ...p, found: hit(p, text) }));
  const foundCount = results.filter((r) => r.found).length;
  const coverage = Math.round((foundCount / results.length) * 70);

  // 2) 構造化(15点): 見出し/箇条書きの使用と、主要カテゴリの分類
  const lines = minutes.split('\n').filter((l) => l.trim());
  const bullets = lines.filter((l) => /^\s*([-・●*■□◆▶▼]|\d+[.)．]|【.+】)/.test(l)).length;
  const sections = ['決定', 'todo|タスク|アクション', '課題|懸念|リスク|未決', '次回'].filter((p) =>
    new RegExp(p, 'i').test(text)
  ).length;
  const structure = Math.min(15, Math.round(Math.min(bullets, 6) * 1 + sections * 2.25));

  // 3) 正確性(15点): 引っかけに乗ると減点
  const triggered = scenario.traps.filter((t) => t.test(minutes));
  const accuracy = foundCount === 0 ? 0 : Math.max(0, 15 - triggered.length * 8);

  // 簡潔さ: 台本の分量に対して長すぎる場合の注意(得点には含めない)
  const verbose = minutes.length > 1500;

  const total = coverage + structure + accuracy;
  return {
    total,
    rank: rankOf(total),
    breakdown: { coverage, structure, accuracy },
    results,
    triggered,
    verbose,
    foundCount,
  };
}

if (typeof module !== 'undefined') module.exports = { evaluate, rankOf, TYPE_LABELS };
