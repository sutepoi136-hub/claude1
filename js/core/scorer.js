/* 議事録クエスト — 採点(AIなし・毎回同じ結果)。
 *
 * 100点 = 網羅40 + 分類15 + ToDo15 + 正確性20 + 構成10
 *  - 網羅   : 会議の要点(points)を書けたか。1項目(1行/箇条書き1つ)の中に、要点の語がそろっていれば「書けた」
 *  - 分類   : 決定事項・ToDo・保留を、正しい見出しの下(または正しい言い方)で書けたか
 *  - ToDo   : 各ToDoに「誰が」「いつまでに」が同じ項目に書かれているか
 *  - 正確性 : 引っかけ(訂正前の数字、保留を決定と書く、撤回された案 など)に乗っていないか
 *  - 構成   : 見出し・基本情報(日時/参加者)・箇条書き・長さ
 *
 * 要点(point)の書式:
 *   { id, type: 'decision'|'todo'|'pending'|'info'|'next', label,
 *     must: [[語, 語...], [語...]],  // グループごとに1語以上が、同じ項目に含まれること
 *     owner: ['岡田'] / ['@player'], due: ['10/21', '21日'],   // ToDoのみ
 *     list: true,        // 箇条書き数行にまたがってもよい要点(「対象は3つ」など)
 *     weight: 2,         // 重要度(既定1)
 *     trap: '…',         // 保留の要点: 決定のように書いたら引っかけ(自動で作る)
 *     trapUnless: [...], why: '解説' }
 * 引っかけ(trap)の書式:
 *   { id, label, why, when: [[語...], ...], unless: [語...], scope: 'decision' }  // scope指定時は「決定扱いの書き方」だけを見る */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});

  const WEIGHT = { coverage: 40, classify: 15, todo: 15, accuracy: 20, structure: 10 };
  const AXES = [
    { id: 'coverage', name: '網羅', desc: '会議の要点を書けたか' },
    { id: 'classify', name: '分類', desc: '決定・ToDo・保留を正しく分けたか' },
    { id: 'todo', name: 'ToDo', desc: '「誰が」「いつまでに」を書けたか' },
    { id: 'accuracy', name: '正確性', desc: '引っかけに乗らなかったか' },
    { id: 'structure', name: '構成', desc: '見出し・基本情報・箇条書き・長さ' },
  ];
  const TRAP_PENALTY = 7;
  const RANKS = [['S', 90], ['A', 75], ['B', 60], ['C', 40], ['D', 0]];
  const CLEAR = 60;
  const TYPE = {
    decision: { name: '決定事項', icon: '✅' },
    todo: { name: 'ToDo', icon: '📌' },
    pending: { name: '保留・未決', icon: '⏸' },
    info: { name: '共有事項', icon: '💬' },
    next: { name: '次回予定', icon: '📅' },
  };

  // 「まだ決まっていない」ことを表す語 / 「決まった」ことを表す語
  const HOLD = ['保留', '未定', '未決', '未確定', '未承認', '持ち越', '持越', '継続', '検討', '確認', '相談', '次回', '後日', '見送', '判断', '待ち', '待つ',
    'ペンディング', 'pending', 'tbd', '再交渉', '次第', 'まだ', '決めない', '決まっていない', '決まらず', '決定せず', '可否', 'かどうか', '是非',
    '見てから', '見て決', '結論は', '様子を見', '先送り', '棚上げ', '保留中', '決まっておらず', 'しない方向'];
  const DECIDED = ['決定', '決ま', '確定', '合意', '承認', '了承', '採用', '決議', '決め', '可決', '認め', '承諾', '決着'];

  const rankOf = (total) => RANKS.find(([, min]) => total >= min)[0];

  function playerAliases(ctx) {
    const p = (ctx && ctx.player) || {};
    return [p.name, p.reading, '自分', '私', 'わたし', 'pmo', '議事録担当', '記録係', '書記', 'あなた'].filter(Boolean);
  }
  const expand = (list, ctx) => (list || []).flatMap((w) => (w === '@player' ? playerAliases(ctx) : [w]));

  function inDecisionVoice(it, T) {
    return it.section === 'decision' || (it.section !== 'pending' && T.hasAny(it.norm, T.words(DECIDED)));
  }

  function classifyOk(p, it, ownerOk, dueOk, T) {
    switch (p.type) {
      case 'decision':
        return it.section === 'decision' || ((it.section === null || it.section === 'info') && T.hasAny(it.norm, T.words(DECIDED)));
      case 'todo':
        return it.section === 'todo' || (it.section === null && ownerOk && dueOk);
      case 'pending':
        return it.section === 'pending' || (it.section !== 'decision' && T.hasAny(it.norm, T.words(HOLD)));
      default:
        return true;
    }
  }

  function judgePoint(p, items, ctx) {
    const T = GQ.Text;
    const must = p.must.map((g) => T.words(g));
    const owner = T.words(expand(p.owner, ctx));
    const due = T.words(p.due || []);
    const hold = T.words(HOLD);
    const rate = (it, text, section) => {
      const view = { ...it, norm: text, section };
      const statusOk = p.type !== 'pending' || section === 'pending' || T.hasAny(text, hold);
      const ownerOk = p.type === 'todo' && T.hasAny(text, owner);
      const dueOk = p.type === 'todo' && T.hasAny(text, due);
      const cls = classifyOk(p, view, ownerOk, dueOk, T);
      return { item: it, statusOk, ownerOk, dueOk, classifyOk: cls, score: statusOk * 8 + cls * 4 + ownerOk * 2 + dueOk * 2 };
    };
    let best = null;
    const consider = (r) => { if (!best || r.score > best.score) best = r; };
    items.forEach((it) => { if (must.every((g) => T.hasAny(it.norm, g))) consider(rate(it, it.norm, it.section)); });
    if (!best && p.list) {
      // 「対象は次の3つ」のように数行に分けて書いた場合: 同じ見出し内の連続する4項目までをまとめて見る
      for (let i = 0; i < items.length && !best; i++) {
        for (let n = 2; n <= 4 && i + n <= items.length; n++) {
          const win = items.slice(i, i + n);
          if (win.some((w) => w.section !== items[i].section)) break;
          const joined = win.map((w) => w.norm).join('|');
          if (must.every((g) => T.hasAny(joined, g))) { consider(rate(items[i], joined, items[i].section)); break; }
        }
      }
    }
    const found = !!best && best.statusOk;
    const hints = [];
    let partial = null;
    if (!best && must.length > 1) {
      let max = 0;
      items.forEach((it) => {
        const n = must.filter((g) => T.hasAny(it.norm, g)).length;
        if (n > max) { max = n; partial = it; }
      });
      if (partial) hints.push('関係する記述はありますが、要点がそろっていません(足りない語があります)');
    }
    if (!best && !partial) hints.push('書かれていません');
    if (best && !best.statusOk) hints.push('「保留」「未定」など、まだ決まっていないことが分かる書き方になっていません');
    if (found && !best.classifyOk) {
      hints.push({
        decision: '決定事項です。【決定事項】の見出しの下に書くか、「〜に決定」と分かるように書きましょう',
        todo: 'ToDoです。【ToDo】の見出しの下に書きましょう',
        pending: 'まだ決まっていない事項です。【保留・課題】の見出しの下に書きましょう',
      }[p.type]);
    }
    if (found && p.type === 'todo') {
      if (!best.ownerOk) hints.push('担当者(誰が)が、同じ行に書かれていません');
      if (!best.dueOk) hints.push('期限(いつまでに)が、同じ行に書かれていません');
    }
    return {
      id: p.id, type: p.type, label: p.label, weight: p.weight || 1, why: p.why || '',
      found, item: best ? best.item : partial, partial: !best && !!partial,
      classifyOk: found ? best.classifyOk : false,
      ownerOk: found && best.ownerOk, dueOk: found && best.dueOk,
      perfect: found && best.classifyOk && (p.type !== 'todo' || (best.ownerOk && best.dueOk)),
      hints,
    };
  }

  function trapsOf(ep) {
    const list = (ep.traps || []).map((t) => ({ ...t }));
    ep.points.filter((p) => p.type === 'pending' && p.trap).forEach((p) => {
      list.push({ id: 'premature-' + p.id, label: p.trap, why: p.trapWhy || p.why || '', when: p.must, unless: p.trapUnless || [], scope: 'decision', exceptHold: true, auto: true });
    });
    return list;
  }

  function judgeTraps(ep, items) {
    const T = GQ.Text;
    const hold = T.words(HOLD);
    return trapsOf(ep).map((t) => {
      const when = t.when.map((g) => T.words(g));
      const unless = T.words(t.unless || []);
      const hit = items.find((it) =>
        (t.scope !== 'decision' || inDecisionVoice(it, T)) &&
        when.every((g) => T.hasAny(it.norm, g)) &&
        !T.hasAny(it.norm, unless) &&
        !(t.exceptHold && T.hasAny(it.norm, hold)));
      return hit ? { id: t.id, label: t.label, why: t.why || '', item: hit } : null;
    }).filter(Boolean);
  }

  function namesOf(ep, ctx) {
    const series = GQ.Data && GQ.Data.series[ep.series];
    const cast = series ? Object.keys(series.cast) : [];
    return [...new Set([...cast, ...(ep.cast || []), ctx && ctx.player && ctx.player.name, '書記官', 'PMO'].filter(Boolean))];
  }

  function evaluate(ep, text, ctx) {
    const parsed = GQ.Parser.parse(text, { names: namesOf(ep, ctx) });
    const items = parsed.items.filter((it) => it.section !== 'meta');
    const points = ep.points.map((p) => judgePoint(p, items, ctx));
    const traps = judgeTraps(ep, items);

    const totalW = points.reduce((s, p) => s + p.weight, 0);
    const foundW = points.reduce((s, p) => s + (p.found ? p.weight : 0), 0);
    const ratio = totalW ? foundW / totalW : 0;
    const considered = points.filter((p) => p.found && ['decision', 'todo', 'pending'].includes(p.type));
    const todos = points.filter((p) => p.type === 'todo');

    const coverage = Math.round(WEIGHT.coverage * ratio);
    const classify = considered.length ? Math.round((WEIGHT.classify * considered.filter((p) => p.classifyOk).length) / considered.length) : 0;
    const todo = todos.length
      ? Math.round((WEIGHT.todo * todos.reduce((s, p) => s + (p.ownerOk ? 0.5 : 0) + (p.dueOk ? 0.5 : 0), 0)) / todos.length)
      : Math.round(WEIGHT.todo * ratio);
    const accuracy = Math.round(Math.max(0, WEIGHT.accuracy - TRAP_PENALTY * traps.length) * Math.min(1, ratio / 0.5));

    const notes = [];
    const secName = { decision: '【決定事項】', todo: '【ToDo】', pending: '【保留・課題】', next: '【次回】' };
    const secs = ['decision', 'todo', 'pending', 'next'].filter((s) => parsed.sections[s] > 0);
    ['decision', 'todo', 'pending', 'next'].filter((s) => !secs.includes(s)).forEach((s) => notes.push(`${secName[s]} の見出し(と中身)がありません`));
    const meta = parsed.sections.meta > 0;
    if (!meta) notes.push('会議の基本情報(日時・参加者)がありません');
    if (parsed.bullets < 3) notes.push('箇条書きを使うと読みやすくなります');
    const modelLen = (ep.model || '').length || 600;
    const limit = Math.max(modelLen * 2, modelLen + 600);
    const concise = parsed.chars <= limit;
    if (!concise) notes.push(`長すぎます(${parsed.chars}字)。要点に絞りましょう(目安 ${limit}字以内)`);
    const structureRaw = (5 * secs.length) / 4 + (meta ? 1 : 0) + (parsed.bullets >= 3 ? 2 : 0) + (concise ? 2 : 0);
    const structure = Math.round(structureRaw * Math.min(1, ratio / 0.3));

    const axes = { coverage, classify, todo, accuracy, structure };
    const total = Math.min(100, coverage + classify + todo + accuracy + structure);
    return { total, rank: rankOf(total), axes, points, traps, notes, ratio, parsed, chars: parsed.chars };
  }

  GQ.Scorer = { evaluate, rankOf, trapsOf, namesOf, playerAliases, WEIGHT, AXES, RANKS, CLEAR, TYPE, HOLD, DECIDED, TRAP_PENALTY };
})(typeof globalThis !== 'undefined' ? globalThis : this);
