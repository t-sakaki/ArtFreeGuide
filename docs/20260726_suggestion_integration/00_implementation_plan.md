# 実装計画書: 旧フィードバックUIをAI生成サジェストに置換

**作成日:** 2026-07-26
**最終更新:** 2026-07-26
**担当:** Hermes Agent (Antigravity へ実装依頼)
**ステータス:** Phase 1 実装完了 → Phase 2 着手
**対象環境:** local DEV → trial

---

## 背景

古いUI（星5つの評価＋テキストエリア「解説の評価 ★★★★★ 💬 フィードバック・ご意見」）が
残っている。これを新しいAIサジェストボタンに置き換える。

2026-07-26時点でサジェストボタンは表示されるようになったが、古いUIを消し忘れて
重複表示状態になっている。

---

## 現状（問題）

```html
[チャット入力欄]
   💡 時代背景について詳しく知りたい     ← NEW: AIサジェスト
   📜 技法の具体例を知りたい          ← NEW: AIサジェスト
   ❓ 作者の意図を知りたい            ← NEW: AIサジェスト
                   [▶ 送信]

[解説エリア]
  解説本文...

  ★★★★★              ← 古いUI: 星評価
  💬 フィードバック・ご意見:         ← 古いUI: テキストエリア
  [テキストボックス]
```

**古いUIは削除する。** 新しいサジェストが新機能の本体。

---

## ゴール

1. 古いUI（星評価 + フィードバックテキストボックス）を完全に削除
2. AIサジェスト 💡📜❓ はチャット入力エリア内に配置維持
3. サジェスト発火条件の安定化（モーダル開閉・作品切り替えで消えない）
4. ローカルDEV → trial デプロイ

---

## タスク一覧

### Task 1: 古いUIの削除
- **ファイル:** `src/app/ArtFreeGuideClient.tsx`
- **削除対象:**
  - 星5つ評価UI（`<div>★★★★★</div>` 等）
  - 「解説の評価」テキスト
  - 「フィードバック・ご意见」テキスト
  - 関連テキストエリア（feedback用、conversationLog用とは別）
- **検索キーワード案:**
  - `★★★★★`
  - `フィードバック・ご意見`
  - `解説の評価`
  - `FeedbackControls`
  - `StarsRating`
- **注意点:** チャット入力欄のconversationLog表示は残す（ユーザーが希望）

### Task 2: サジェスト状態管理のリセットタイミング修正
- **ファイル:** `src/app/ArtFreeGuideClient.tsx`
- **問題:** 作品切替・モーダル開閉・モード切替でサジェストが消える／残るが不安定
- **対応:**
  - `artwork` 変更時に `setImprovementSuggestions([])`
  - 作品 fetch 完了後、新 segments が入ったら再 fetch
  - ピン留め不要（`'short' | 'standard' | 'deep'` 切替時も fetch 不要）
- **実装:**
  ```typescript
  // artwork 変更検知
  useEffect(() => {
    setImprovementSuggestions([]);
  }, [artwork, artist]);
  ```

### Task 3: console.logの削除
- **ファイル:** `src/app/ArtFreeGuideClient.tsx`
- **debug ログ** を製品版では削除:
  - `console.log('[SuggestEffect]...')`
  - `console.log('[fetchImprovementSuggestions]...')`
- **保持:** console.error（エラー時のみ）

### Task 4: ローカルDEV動作確認
- 手順:
  1. `pkill -9 -f next` で前のサーバー終了
  2. `rm -rf .next` でキャッシュ削除
  3. `npx next dev -p 3003` で起動
  4. ハードリロード (Ctrl+Shift+R)
  5. 作品選択 → 💡📜❓ ボタン表示確認
  6. 古いUI（星評価+テキストボックス）がないこと確認
  7. ボタンクリック → conversationLog に message 入る
  8. AI返答が「解説エリア」冒頭の💬に表示
- **観察項目:**
  - 古いUIが完全に消えたか
  - サジェストは最大3件表示か
  - アイコン💡📜❓は正しく描画されているか

### Task 5: trialデプロイ
- `npm run build:cf && wrangler deploy -e trial`
- URL: https://art-free-guide-trial.taira-sakakibara.workers.dev

---

## 成果物

- ローカルDEV環境で:
  - 古いUIが完全削除されている
  - 新しいAIサジェスト💡📜❓が正常動作
  - 作品切替時にもサジェストがリセットされる
- trialデプロイが成功

---

## 注意事項

- `FeedbackControls` コンポーネントは chat タブ用で残す可能性あり（画像右下の
  フィードバック機能）。削除するのは**作品詳細画面内**の星評価UIだけ
- `conversationLog` 表示は chat 入力欄の上に保持（ユーザー指示）
- 最下部固定再生バー（⏮▶⏭🔊）は触らない

