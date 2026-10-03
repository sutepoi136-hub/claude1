const test = require('node:test');
const assert = require('node:assert/strict');
const { GQ } = require('./load.js');
const { norm, has } = GQ.Text;

test('正規化: 日付・時刻・漢数字・全角・単位をそろえる', () => {
  const cases = {
    '10月13日(火)': '10/13(火)',
    '十一月二十八日': '11/28',
    '2026/10/06': '2026年10/6',
    '10月13日10時': '10/13 10:00',
    '午後3時半': '15:30',
    '15時30分': '15:30',
    '09:00': '9:00',
    '六十万円': '600000円',
    '1,200万円': '12000000円',
    '2千5百枚': '2500枚',
    '3ヶ月': '3か月',
    'ＡＣＷ３０％': 'acw30%',
    '30パーセント': '30%',
    'カタカナ': 'かたかな',
    'B 案': 'b案',
  };
  for (const [src, want] of Object.entries(cases)) assert.equal(norm(src), want, src);
});

test('正規化: 「1時間」「時点」は時刻にしない', () => {
  assert.equal(norm('1時間おき'), '1時間おき');
  assert.equal(norm('10時点'), '10時点');
});

test('照合: 数字の語は、前後に数字が続くときは一致しない', () => {
  assert.ok(!has(norm('11/10'), norm('1/10')));
  assert.ok(has(norm('2027/1/10'), norm('1/10')));
  assert.ok(!has(norm('28日'), norm('8日')));
  assert.ok(has(norm('期限は8日'), norm('8日')));
  assert.ok(!has(norm('19:00'), norm('9:00')));
  assert.ok(!has(norm('130%'), norm('30%')));
  assert.ok(has(norm('〆切 10/13 10:00'), norm('10/13')));
});
