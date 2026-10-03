// APIキー無しで画面を確認するための偽クライアント(PMO_MOCK_AI=1 で有効)。
// 本物のAIではなく、固定の返答を返すだけ。テストでも使う。
function mockClient() {
  return {
    messages: {
      async parse(params) {
        const user = params.messages[0].content;
        const isModel = params.system.includes('手本になる議事録');
        const parsed = isModel
          ? { minutes: '【決定事項】\n・(モック)模範解答のサンプルです\n\n【ToDo】\n・(モック)\n\n【課題・懸念】\n・(モック)\n\n【次回予定】\n・(モック)' }
          : {
              rescued_point_ids: [],
              fabrication_errors: [],
              readability: 1,
              readability_reason: '(モック)箇条書きで読みやすい。',
              actionability: 0,
              actionability_reason: '(モック)期限が一部欠けている。',
              advice: ['(モック)ToDoは「誰が・何を・いつまでに」を揃えましょう。'],
              red_pen: [{ quote: (user.match(/<minutes>\n([^\n]+)/) || [])[1] || null, kind: 'improve', comment: '(モック)ここを具体的に', suggestion: '(モック)担当と期限を足す' }],
            };
        return { stop_reason: 'end_turn', parsed_output: parsed };
      },
    },
  };
}
module.exports = { mockClient };
