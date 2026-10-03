/* 議事録クエスト — 文字列の正規化と照合。
 * 採点(議事録)と台本チェック(テスト)の両方で、まったく同じ正規化を使う。
 * 「11月28日」「11/28」「十一月二十八日」や「15時」「午後3時」「15:00」を同じ形にそろえ、
 * 書き方の違いで要点を取りこぼさないようにする。 */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});

  const DIGIT = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const UNIT = { '十': 10, '百': 100, '千': 1000 };

  // 漢数字の並び(万未満)を算用数字にする。「二〇二六」のような位取りなしの並びにも対応
  function kanjiNum(s) {
    if (!/[十百千]/.test(s)) return s.replace(/./g, (c) => String(DIGIT[c]));
    let total = 0;
    let cur = 0;
    for (const c of s) {
      if (c in UNIT) { total += (cur || 1) * UNIT[c]; cur = 0; } else cur = cur * 10 + DIGIT[c];
    }
    return String(total + cur);
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  function norm(input) {
    let s = String(input == null ? '' : input).normalize('NFKC');
    s = s.replace(/(\d),(?=\d{3}(?!\d))/g, '$1'); // 1,200 → 1200
    // 算用数字+漢数字の位(2千5百 など)
    s = s.replace(/(\d+)百(\d{1,2}(?!\d))?/g, (m, a, b) => String(Number(a) * 100 + (b ? Number(b) : 0)));
    s = s.replace(/(\d+)千(\d{1,3}(?!\d))?/g, (m, a, b) => String(Number(a) * 1000 + (b ? Number(b) : 0)));
    s = s.replace(/[〇零一二三四五六七八九十百千]+/g, kanjiNum);
    s = s.replace(/(\d+(?:\.\d+)?)万(\d{1,4}(?!\d))?/g, (m, a, b) => String(Math.round(Number(a) * 10000) + (b ? Number(b) : 0)));
    s = s.replace(/(\d+)億(\d+)?/g, (m, a, b) => String(Number(a) * 100000000 + (b ? Number(b) : 0)));
    // 日付: 2026年10月6日 / 2026/10/06 → 2026年10/6、10月6日 → 10/6
    s = s.replace(/(\d{4})[/年.-](\d{1,2})[/月.-](\d{1,2})日?/g, (m, y, mo, d) => `${y}年${Number(mo)}/${Number(d)}`);
    s = s.replace(/(\d{1,2})月(\d{1,2})日(?=(\d)?)/g, (m, mo, d, nx) => `${Number(mo)}/${Number(d)}${nx ? ' ' : ''}`);
    s = s.replace(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g, (m, mo, d) => `${Number(mo)}/${Number(d)}`);
    // 時刻: 午後3時 / 15時 / 15時30分 / 15時半 → 15:00 形式(「1時間」「時点」はそのまま)
    s = s.replace(/午後(\d{1,2})時/g, (m, h) => `${Number(h) < 12 ? Number(h) + 12 : Number(h)}時`);
    s = s.replace(/午前(\d{1,2})時/g, '$1時');
    s = s.replace(/(\d{1,2})時半/g, (m, h) => `${Number(h)}:30`);
    s = s.replace(/(\d{1,2})時(\d{1,2})分/g, (m, h, mi) => `${Number(h)}:${pad2(mi)}`);
    s = s.replace(/(\d{1,2})時(?![間点期])/g, (m, h) => `${Number(h)}:00`);
    s = s.replace(/(?<![\d:])0(\d):(\d{2})/g, '$1:$2');
    s = s.replace(/(\d)\s*[ヶケカヵ箇か]月/g, '$1か月');
    s = s.replace(/パーセント/g, '%');
    // カタカナ → ひらがな、英字は小文字、空白は除く
    s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
    // 空白は除く。ただし数字どうしの間は1つ残す(「10/13 10:00」が「10/1310:00」にならないように)
    return s.toLowerCase().replace(/\s+/g, (m, off, str) => (isDigit(str[off - 1]) && isDigit(str[off + m.length]) ? ' ' : ''));
  }

  const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';

  // 数字で始まる/終わる語は、前後が数字でないときだけ一致とみなす(「8日」が「28日」に、「1/10」が「11/10」に一致しない)
  function has(text, word) {
    if (!word) return false;
    const headNum = isDigit(word[0]);
    const tailNum = isDigit(word[word.length - 1]);
    let from = 0;
    for (;;) {
      const i = text.indexOf(word, from);
      if (i < 0) return false;
      const okHead = !headNum || !(isDigit(text[i - 1]) || (text[i - 1] === '/' && isDigit(text[i - 2])));
      const okTail = !tailNum || !(isDigit(text[i + word.length]) || (text[i + word.length] === '/' && isDigit(text[i + word.length + 1])));
      if (okHead && okTail) return true;
      from = i + 1;
    }
  }

  const hasAny = (text, words) => words.some((w) => has(text, w));

  // 語のリストを正規化する(結果はキャッシュ)
  const cache = new Map();
  function words(list) {
    const key = list.join('\u0000');
    if (!cache.has(key)) cache.set(key, [...new Set(list.map(norm).filter(Boolean))]);
    return cache.get(key);
  }

  GQ.Text = { norm, has, hasAny, words, kanjiNum };
})(typeof globalThis !== 'undefined' ? globalThis : this);
