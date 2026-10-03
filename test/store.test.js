const test = require('node:test');
const assert = require('node:assert/strict');
const { GQ } = require('./load.js');
const { Store, Templates } = GQ;

test('テンプレート: 追加・同名の連番・上書き・削除・既定', () => {
  let d = Templates.empty();
  let r = Templates.save(d, { name: '定例', body: 'A' });
  d = r.data;
  const id1 = r.id;
  r = Templates.save(d, { name: '定例', body: 'B' });
  d = r.data;
  assert.equal(d.items[1].name, '定例 (2)');
  d = Templates.save(d, { id: id1, name: '定例', body: 'C' }).data;
  assert.equal(d.items[0].body, 'C');
  d = Templates.setDefault(d, id1);
  d = Templates.remove(d, id1);
  assert.equal(d.defaultId, null);
  assert.equal(d.items.length, 1);
});

test('テンプレート: カーソル位置に挿入、空なら置き換え', () => {
  assert.deepEqual(Templates.insertInto('', 'X', 0), { text: 'X', caret: 1 });
  assert.equal(Templates.insertInto('ab', 'X', 1).text, 'a\n\nX\n\nb');
});

test('保存: 設定の既定値、下書き、記録のリセット', () => {
  const s = Store.make(Store.memory());
  assert.equal(s.settings().rate, 1);
  s.saveSettings({ ...s.settings(), playerName: '佐々木' });
  assert.equal(s.settings().playerName, '佐々木');
  s.saveDraft('work-01', { minutes: 'x', memo: '' });
  assert.equal(s.draft('work-01').minutes, 'x');
  s.saveHistory([{ total: 1 }]);
  s.resetAll();
  assert.deepEqual(s.history(), []);
  assert.equal(s.draft('work-01'), null);
  assert.equal(s.settings().playerName, '佐々木');
});

test('保存: 旧版(v1)のマイテンプレートを引き継ぐ', () => {
  const mem = Store.memory();
  mem.setItem('pmo-minutes-templates-v1', JSON.stringify({ items: [{ id: 'my-1', name: '旧テンプレ', body: '【決定】' }], defaultId: 'my-1' }));
  const s = Store.make(mem);
  assert.equal(s.templates().items[0].name, '旧テンプレ');
  assert.ok(mem.getItem('gq2-templates'));
});

test('保存: 壊れたデータでも落ちない', () => {
  const mem = Store.memory();
  mem.setItem('gq2-history', '{壊れた');
  assert.deepEqual(Store.make(mem).history(), []);
});
