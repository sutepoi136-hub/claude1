/* 議事録クエスト — 議事録テキストの解析。
 * 見出し(【決定事項】■ToDo ## 次回 など)で区切り、1行(または箇条書き1項目)を「項目」として取り出す。
 * どの見出しの下に書いたか(section)も覚えておき、採点で「保留を決定事項に書いていないか」等を判定する。 */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});

  // 見出しの種類。上から順に判定する(「未決定事項」は保留、「次回までのToDo」はToDo)
  const SECTION_RULES = [
    ['todo', /todo|to-do|to do|タスク|アクション|action|宿題|対応事項|やること|担当事項|下命|任務|指令/i],
    ['pending', /保留|未決|未定|未確定|課題|懸念|リスク|検討事項|論点|持ち越し|持越し|ペンディング|pending|継続審議|継続検討|要確認|確認待ち|open|オープン/i],
    ['decision', /決定|決まった|決議|合意|結論|承認事項|確定事項/i],
    ['next', /次回|次の会議|次の軍議/i],
    ['info', /共有|報告|状況|現状|背景|概要|事実|サマリー?|summary|進捗|情報|経緯|議論|議事|内容|トピック|メモ|備考|その他|確認事項|連絡事項|結果/i],
    ['meta', /会議名|軍議名|件名|日時|日付|開催|場所|会場|参加者|参加|出席者|出席|欠席者|欠席|議題|アジェンダ|agenda|記録者|作成者|作成日|書記/i],
  ];
  // 見出しに添えられる汎用語(これらと記号だけなら、その行は見出しとみなす)
  const GENERIC = /事項|項目|内容|一覧|リスト|まとめ|予定|日程|日時|について|など|等|こと|会議|定例|打ち合わせ|打合せ|mtg|ミーティング|軍議|及び|および|と|の|は|・|、|,|\/|&|＆/gi;
  const DECOR_L = /^[\s#＃■□◆◇●○▼▽▶▷★☆◎【\[［<＜〈《(（*＊_=＝\-－‐−—─━]+/;
  const DECOR_R = /[\s】\]］>＞〉》)）*＊_=＝:：\-－‐−—─━]+$/;
  const NUM_PREFIX = /^\s*(?:\d{1,2}|[①-⑳]|[一二三四五六七八九十]{1,2})[.)．）、]\s*/;
  const BULLET = /^(?:[・\-‐−–—*＊•●○◦■□◆◇▶▷►▸→⇒✓✔☐☑☆★〇]|\d{1,2}[.)．）、]|[(（]\d{1,2}[)）]|[①-⑳])\s*/;
  // 見出しの飾りにも使われる記号(■◆●▼など)を除いた「本文の箇条書き」記号
  const SOFT_BULLET = /^(?:[・\-‐−–—*＊•○◦→⇒✓✔☐☑〇]|\d{1,2}[.)．）、]|[(（]\d{1,2}[)）]|[①-⑳])\s*/;
  const CONT = /^[→⇒↳└┗※]/;
  const HONOR = '(?:さん|様|さま|殿|どの|氏|将軍|部長|課長|センター長|本部長|社長|殿下|陛下)?';

  const stripDecor = (s) => s.replace(DECOR_L, '').replace(DECOR_R, '').trim();
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function indentOf(raw) {
    const m = raw.match(/^[ \t　]*/)[0];
    return m.replace(/\t/g, '    ').replace(/　/g, '  ').length;
  }

  function headingType(core) {
    const s = core.replace(/[(（][^)）]*[)）]/g, '').trim();
    if (!s || s.length > 20) return null;
    for (const [type, re] of SECTION_RULES) {
      if (!re.test(s)) continue;
      const rest = s.replace(new RegExp(re.source, 'gi'), '').replace(GENERIC, '').replace(/[\s:：。]/g, '');
      if (!rest) return type;
    }
    return null;
  }

  // 見出し行なら { type, rest(同じ行に続く内容) } を返す。次の書き方に対応する:
  //   【決定事項】 / ■決定事項 / ## 決定事項 / 決定事項: B案 / 【次回】10/13 10:00 / ■次回 10/27 / 次回 10/27
  // 「・目的: 〜」のような箇条書きの中のラベルは見出しにしない(本文として扱う)
  function heading(line) {
    if (SOFT_BULLET.test(line)) {
      const core = stripDecor(line.replace(NUM_PREFIX, '').replace(BULLET, ''));
      const ty = core && headingType(core);
      return ty ? { type: ty, rest: '' } : null;
    }
    const s = line.replace(NUM_PREFIX, '');
    const decor = /^[\s#＃■□◆◇●○▼▽▶▷★☆◎]/.test(s);
    const tries = [
      [s.match(/^(.{1,20}?)[:：]\s*(.+)$/), null],
      [s.match(/^[\s#＃■□◆◇●○▼▽▶▷★☆◎]*[【\[［<＜〈《]([^】\]］>＞〉》]{1,20})[】\]］>＞〉》]\s*[:：]?\s*(.+)$/), null],
      // 「■次回 10/27」(飾りつき)、または「次回 10/27」(強い見出し語のみ)
      [s.match(/^[\s#＃■□◆◇●○▼▽▶▷★☆◎]*(\S{1,12})[\s\u3000]+(.+)$/), decor ? null : ['decision', 'todo', 'pending', 'next']],
    ];
    for (const [m, allow] of tries) {
      if (!m) continue;
      const ty = headingType(stripDecor(m[1]));
      if (ty && (!allow || allow.includes(ty))) return { type: ty, rest: m[2].trim() };
    }
    const core = stripDecor(s.replace(BULLET, ''));
    const ty = core && headingType(core);
    return ty ? { type: ty, rest: '' } : null;
  }

  function parse(text, opts) {
    const T = GQ.Text;
    const names = ((opts && opts.names) || []).filter(Boolean);
    const nameRe = names.length
      ? new RegExp(`^(?:${names.map(escRe).join('|')})${HONOR}(?:の?(?:todo|タスク|担当|分|宿題))?[:：]?$`, 'i')
      : null;
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const items = [];
    const sections = { decision: 0, todo: 0, pending: 0, info: 0, next: 0, meta: 0 };
    let section = null;
    let label = null;
    let last = null;

    const push = (body, idx, indent, bullet) => {
      const t = body.trim();
      if (!t) return;
      // 長い文章(箇条書きでない段落)は、文ごとに分けて扱う
      const parts = !bullet && t.length > 30 && /。./.test(t) ? t.split(/(?<=。)/).map((x) => x.trim()).filter(Boolean) : [t];
      parts.forEach((p) => {
        last = { section, label, text: p, line: idx, lineEnd: idx, indent, bullet };
        items.push(last);
      });
    };

    lines.forEach((raw, idx) => {
      const t = raw.trim();
      if (!t) return;
      const indent = indentOf(raw);
      const h = heading(t);
      if (h) {
        section = h.type;
        label = null;
        last = null;
        if (h.rest) push(h.rest, idx, indent, false);
        return;
      }
      // 字下げされた行や「→」「※」で始まる行は、直前の項目の続き
      if (last && (indent > last.indent || CONT.test(t))) {
        last.text += ' ' + t.replace(BULLET, '');
        last.lineEnd = idx;
        return;
      }
      const bullet = BULLET.test(t);
      const core = stripDecor(t.replace(BULLET, ''));
      // 「■岡田さん」「【渓谷の防衛】」「担当者別:」のような小見出しは、続く項目のラベルにする
      const decorated = /^[【\[［<＜〈《]/.test(t) && /[】\]］>＞〉》][:：]?$/.test(t);
      if (core && core.length <= 20 && ((nameRe && nameRe.test(core)) || decorated || (!bullet && /[:：]$/.test(t)))) {
        label = core.replace(/[:：]$/, '');
        last = null;
        return;
      }
      push(bullet ? t.replace(BULLET, '') : t, idx, indent, bullet);
    });

    let bullets = 0;
    items.forEach((it) => {
      it.norm = T.norm((it.label ? it.label + ' ' : '') + it.text);
      const content = it.text.replace(/[\s・:：、。,.\-()（）]/g, '');
      if (content.length >= 2 && it.section) sections[it.section]++;
      if (it.bullet && content.length >= 4) bullets++;
    });
    return { items, sections, bullets, chars: String(text || '').trim().length, lines };
  }

  GQ.Parser = { parse, heading, headingType };
})(typeof globalThis !== 'undefined' ? globalThis : this);
