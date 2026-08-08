# 実装計画書 (v3)

**作成日:** 2026-07-26
**改訂:** v3 (ユーザー指摘により全面再設計)

---

## ユーザー指摘 (レビュー取り込み)

> そもそも音声ガイドには概要、標準、詳細などありますか？
> 一般的な音声ガイドには3種類ありません。

→ **mode toggle は不要**。1作品1ガイドが自然。

---

## 新コンセプト

### 旧: 3 mode toggle
```
[mode toggle: 概要 / 標準 / 詳細]
```

### 新: mode toggle 完全削除
```
無し — ひとつの解説テキストだけ
```

---

## 最終形 UI

```
[mode toggle: 無し]                ← v3 で完全削除

[作品画像]

[解説文 (1本のテキスト)]
  冒頭: 💬 キュレーターとの対話 (conversationLog)
  その後: 解説テキスト (詳細レベルをすべて含む)

[AI chat 入力欄]                   ← v2 で位置変更 (解説の後に)
  textarea + ▶ 送信
  サジェスト 💡📜❓                ← v1 で実装済み

[最下部固定バー: ⏮ ▶ ⏭ 🔊]
```

---

## 変更タスク

### Task 1: mode toggle を完全削除
- **ファイル:** `src/app/ArtFreeGuideClient.tsx`
- **検索:** `explanationMode`, `(['short', 'standard', 'deep']`
- **削除:** mode toggle UI (`<div className="flex bg-slate-950...">` の mode tab UI)
- **削除:** 関連する state `explanationMode`

### Task 2: 「標準」概念の全削除
- `getActiveExplanation()` 関数の `'standard'` モード削除
- 仕様として **常に詳細レベルのテキスト**を返すようにするか、
  または **short を メインにしてチャットサジェストで深掘り**
- 提案: **short のみ返す**。「もっと知りたい」はAIサジェストへ。
  ```typescript
  const getActiveExplanation = () => {
    return responseShort || responseStandard || responseDeep || '';
  };
  ```
- 予備案: テキストが長ければ short、なければ short + standard を連結。

### Task 3: API から standard の排除
- **ファイル:** `src/app/api/guide/route.ts`
- 出力形式を **2 フィールド: `short` のみ + `chat_seed`** に
- もしくは **1 フィールド: `guide` のみ** （短一音声ガイド） に。
  - ユーザー要求は **1本** なので後者推奨

```typescript
// 出力例 (1フィールド案)
{
  "guide": "100〜150文字の概要テキスト（音声用）",
  "chat_seed": "キュレーターが質問対応するための背景知識",
  ...
}
```

### Task 4: chat 入力欄を解説の後ろへ
- **ファイル:** `src/app/ArtFreeGuideClient.tsx`
- v2 で変更済みのはず。おそらく mode toggle 削除と同時に再配置が必要。

### Task 5: 古いUI完全削除 (再唱)
- 「解説の評価 ★★★★★」「フィードバック・ご意見」テキストボックス
- リビジョン後のモードトグル削除とセットで実施

### Task 6: サジェスト動作安定化
- モード概念を削除するので、segment の fetch トリガーが
  安定することを期待
- `artwork` 変更時の `setImprovementSuggestions([])` 維持

### Task 7: console.log 整理 (製品化)
- デバッグログは製品では削除

---

## 設計メモ

### なぜ mode toggle が不要か

トリガーとしては **「深掘りしたい部分はサジェストが提示 + 質問したい人はチャット」** で代替できる。
ユーザーは「一覧性」を求めているのではなく、「作品を知りたい」だけ。
Prominence hierarchy (重み付け) を UI に持たせるべきではない。

### 解説テキストの構成 (trade-off)

| 案 | メリット | デメリット |
|----|----------|------------|
| short のみ (100〜150字) | 超シンプル、近い、一貫 | 情報不足 |
| standard のみ | 中庸、長すぎず | 「概要」の意味が無くなる |
| deep のみ | 詳細、音声で30秒以上 | 聞くのが大変 |
| **chat_seed を持たせ、short を音声、deep を chat用に** | 音声は軽く、興味ある人だけ深掘り | API複雑化 |

→ **本実装では short (100-150字) のみ音声に。deep は chat が応答する形に**。

backend API スキーマ案:
```typescript
{
  "short": "音声ガイドに使う簡潔な解説",
  "deep_context": "キュレーターが chat で深掘りするための内部知識",
  "search_query": "...",
  "recommendations": [...]
}
```

---

## 確認手順

1. ローカルDEV でリロード (Ctrl+Shift+R)
2. 作品選択
3. 表示確認:
   - [ ] mode toggle がない
   - [ ] 解説文は1本のみ
   - [ ] chat 入力欄は解説の後にある
   - [ ] 旧 UI（星評価、フィードバックテキストボックス）の残骸がない
   - [ ] サジェスト 💡📜❓ が表示される
   - [ ] サジェスト click で conversationLog に追加

---

## 注意事項

- 既存ユーザーの慣れ: mode toggle で深さを指定していた動作はなくなるが、
  AIサジェストとchat の help でカバー
- 1作品1ガイドは一般的な音声ガイドの実態
- 依然として conversationLog 表示は解説（Highlights Segment Box）の先頭に保持
