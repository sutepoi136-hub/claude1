/* 議事録クエスト — 保存(ブラウザの localStorage)と議事録テンプレート。
 * 保存先が使えない環境(プライベートウィンドウ等)でも、遊ぶこと自体はできるようにする。 */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});

  // ---- 議事録テンプレート ----
  const Templates = (function () {
    const BUILTIN = [
      {
        id: 'builtin-standard',
        name: '標準(基本情報+5項目)',
        body: '■会議名:\n■日時:\n■参加者:\n\n【決定事項】\n・\n\n【ToDo】(誰が・何を・いつまでに)\n・\n\n【保留・課題】\n・\n\n【共有事項】\n・\n\n【次回】\n・',
      },
      {
        id: 'builtin-simple',
        name: 'シンプル(決定/ToDo/保留/次回)',
        body: '■日時:\n■参加者:\n\n【決定】\n・\n\n【ToDo】\n・\n\n【保留】\n・\n\n【次回】\n・',
      },
      {
        id: 'builtin-client',
        name: '社外送付用(あいさつ文つき)',
        body: '関係者各位\n\nお疲れさまです。本日の会議の議事録を共有いたします。\nご確認のほど、よろしくお願いいたします。\n\n■会議名:\n■日時:\n■参加者(敬称略):\n\n【決定事項】\n1.\n\n【ToDo】(担当 / 内容 / 期限)\n・\n\n【保留・課題】\n・\n\n【共有事項】\n・\n\n【次回】\n・',
      },
      {
        id: 'builtin-maou',
        name: '軍議録(魔王軍編むけ)',
        body: '■軍議名:\n■日時:\n■出席:\n\n【決議事項】\n・\n\n【下命事項】(誰が・何を・いつまでに)\n・\n\n【保留事項】\n・\n\n【報告事項】\n・\n\n【次回軍議】\n・',
      },
    ];
    const empty = () => ({ items: [], defaultId: null });
    const newId = () => 'my-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const all = (data) => [...BUILTIN.map((t) => ({ ...t, builtin: true })), ...data.items];
    const find = (data, id) => all(data).find((t) => t.id === id) || null;

    // 追加または上書き。名前が空なら「マイテンプレート」、同名には連番を付ける
    function save(data, { id, name, body }) {
      const items = data.items.slice();
      const base = (name || '').trim().slice(0, 40) || 'マイテンプレート';
      const idx = id ? items.findIndex((t) => t.id === id) : -1;
      const taken = new Set(items.filter((t) => t.id !== id).map((t) => t.name).concat(BUILTIN.map((t) => t.name)));
      let finalName = base;
      let n = 2;
      while (taken.has(finalName)) finalName = `${base} (${n++})`;
      if (idx >= 0) {
        items[idx] = { ...items[idx], name: finalName, body, updatedAt: Date.now() };
        return { data: { ...data, items }, id };
      }
      const created = { id: newId(), name: finalName, body, updatedAt: Date.now() };
      items.push(created);
      return { data: { ...data, items }, id: created.id };
    }
    const remove = (data, id) => ({ items: data.items.filter((t) => t.id !== id), defaultId: data.defaultId === id ? null : data.defaultId });
    const setDefault = (data, id) => ({ ...data, defaultId: id || null });

    // カーソル位置に挿入する。空欄なら全体を置き換える
    function insertInto(text, body, caret) {
      if (!text.trim()) return { text: body, caret: body.length };
      const pos = Math.min(Math.max(caret == null ? text.length : caret, 0), text.length);
      const before = text.slice(0, pos);
      const after = text.slice(pos);
      const lead = before && !before.endsWith('\n') ? '\n\n' : '';
      const tail = after && !after.startsWith('\n') ? '\n\n' : '';
      return { text: before + lead + body + tail + after, caret: (before + lead + body).length };
    }
    return { BUILTIN, empty, all, find, save, remove, setDefault, insertInto };
  })();

  // ---- 保存 ----
  const K = {
    history: 'gq2-history',
    settings: 'gq2-settings',
    templates: 'gq2-templates',
    badges: 'gq2-badges',
    drafts: 'gq2-drafts',
    stories: 'gq2-stories-read',
    oldTemplates: 'pmo-minutes-templates-v1', // 旧版(議事録クエスト v1)のテンプレート
  };
  const DEFAULT_SETTINGS = { playerName: '皆川', playerReading: 'みながわ', rate: 1, sfx: true, unlockAll: false, welcomed: false };

  function make(storage) {
    const read = (key, fallback) => {
      try { const raw = storage.getItem(key); if (raw === null) return fallback; const v = JSON.parse(raw); return v == null ? fallback : v; } catch (e) { return fallback; }
    };
    const write = (key, value) => { try { storage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } };

    return {
      history: () => { const h = read(K.history, []); return Array.isArray(h) ? h : []; },
      saveHistory: (h) => write(K.history, h.slice(-300)),
      settings: () => ({ ...DEFAULT_SETTINGS, ...read(K.settings, {}) }),
      saveSettings: (s) => write(K.settings, s),
      // 旧版で作ったマイテンプレートがあれば、初回だけ引き継ぐ
      templates: () => {
        const d = read(K.templates, null);
        if (d && Array.isArray(d.items)) return { items: d.items, defaultId: d.defaultId || null };
        const old = read(K.oldTemplates, null);
        if (old && Array.isArray(old.items) && old.items.length) {
          const migrated = { items: old.items.map((t) => ({ id: t.id, name: t.name, body: t.body, updatedAt: t.updatedAt || Date.now() })), defaultId: null };
          write(K.templates, migrated);
          return migrated;
        }
        return Templates.empty();
      },
      saveTemplates: (d) => write(K.templates, d),
      badges: () => read(K.badges, null),
      saveBadges: (ids) => write(K.badges, ids),
      draft: (id) => (read(K.drafts, {})[id] || null),
      saveDraft: (id, d) => { const all = read(K.drafts, {}); if (d) all[id] = { ...d, at: Date.now() }; else delete all[id]; return write(K.drafts, all); },
      storiesRead: () => read(K.stories, []),
      markStoryRead: (id) => { const s = read(K.stories, []); if (!s.includes(id)) { s.push(id); write(K.stories, s); } },
      resetAll: () => { [K.history, K.badges, K.drafts, K.stories].forEach((k) => { try { storage.removeItem(k); } catch (e) { /* 無視 */ } }); },
    };
  }

  const memory = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  };
  let storage;
  try { storage = root.localStorage; storage.getItem('gq2-probe'); } catch (e) { storage = null; }

  GQ.Templates = Templates;
  GQ.Store = make(storage || memory());
  GQ.Store.make = make;
  GQ.Store.memory = memory;
  GQ.Store.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  GQ.Store.persistent = !!storage;
})(typeof globalThis !== 'undefined' ? globalThis : this);
