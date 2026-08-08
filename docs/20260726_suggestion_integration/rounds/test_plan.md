# Round 1〜3 テスト計画

**作成日:** 2026-07-27
**目的:** Round 1〜3 の現状動作検証, Round 3 の怪しい挙動の特定

---

## 検証項目

### 1. TypeScript レベル

- [ ] `npx tsc --noEmit` でエラー 0件 (理想)
- [ ] 既存無関連エラーは許容 (最大 3-5 件)
- [ ] Round 1〜3 起因のエラーは **0件 必須**

### 2. ファイル構造

- [ ] `FeedbackControls` の import が削除されている (Round 1 結果)
- [ ] `FeedbackControls` のコンポーネント使用がない
- [ ] mode toggle UI タブの JSX (`<div className="flex bg-slate-950 border border-slate-900 p-1 rounded-xl ...">`) が削除されている (Round 2)
- [ ] `<textarea>` + `<button>` (chat 入力欄) が `Highlights Segment Box` の **後** に配置されている (Round 3)
- [ ] AI サジェスト `<div>` も chat 入力欄と一緒に移動している
- [ ] `explanationMode` state は **そのまま 残っている** (Round 6 まで)

### 3. DEV サーバー

- [ ] `http://localhost:3003` で HTTP 200 OK
- [ ] 起動時の console に React error がない
- [ ] `curl http://localhost:3003` の response が HTML である

### 4. UI 表示 (Round 3 怪しい挙動の重点検証)

- [ ] 旧 UI (`★★★★★`, フィードバック文本ボックス) が見えない (Round 1)
- [ ] mode toggle (概要 / 標準 / 詳細) が見えない (Round 2)
- [ ] chat 入力欄 (textarea + ▶ 送信) が **画面スクロール到達可能**
- [ ] chat 入力欄 が 解説文の **後** にある
- [ ] AI サジェスト (💡📜❓) が 動作する (表示・クリック・送信)
- [ ] 最下部固定バー (⏮▶⏭🔊) が 表示される
- [ ] スクロールが chat 入力欄と固定バーで 衝突しない
- [ ] キーボード フォーカス が textarea 移動できる

### 5. 機能動作

- [ ] 音声再生ボタン (▶) を押して音声が鳴る (Web Speech or MeloTTS)
- [ ] chat 入力欄にメッセージを入力し送信 → AI 応答が conversationLog に表示
- [ ] サジェストクリックで入力欄が埋まり送信も動く
- [ ] 画像 URL が問題なく表示 (Round 1 で `FeedbackControls` が画像無効化を担っていた可能性)

### 6. 状態管理

- [ ] 作品切替で解説が更新される
- [ ] 作品切替でサジェストがリセット (または適切に更新)
- [ ] 連続動作: 音声再生→停止 がスムーズ
- [ ] 連続動作: chat 送信→次の chat 送信 が独立

---

## 検証手順

### Step 1: TypeScript チェック

```bash
cd /home/taira/ArtFreeGuide
npx tsc --noEmit 2>&1 | head -40
```

### Step 2: ファイル構造確認

```bash
# Round 1 確認
grep -n "FeedbackControls" src/app/ArtFreeGuideClient.tsx

# Round 2 確認
grep -n "explanationMode === mode" src/app/ArtFreeGuideClient.tsx
grep -n "\['short', 'standard', 'deep'\]" src/app/ArtFreeGuideClient.tsx

# Round 3 確認 (chat 入力欄が Highlights Segment Box の後にあること)
grep -n "AI Chat Input Area" src/app/ArtFreeGuideClient.tsx
grep -n "Highlights Segment Box" src/app/ArtFreeGuideClient.tsx
```

期待:
- Round 1: `FeedbackControls` の **使用** がない (import は残る可能性)
- Round 2: mode toggle UI は 0件、 `explanationMode` state は 1件以上 残存
- Round 3: `AI Chat Input Area` の 行番号 > `Highlights Segment Box` の 行番号

### Step 3: DEV サーバー起動 + curl

```bash
cd /home/taira/ArtFreeGuide
pkill -9 -f "next dev" 2>/dev/null || true
rm -rf .next
npx next dev -p 3003 > /tmp/dev3t.log 2>&1 &
sleep 10
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3003 --max-time 8
```

### Step 4: 起動ログ確認

```bash
tail -50 /tmp/dev3t.log
```

「Ready in」「Compiled」「Failed to compile」「Error」 等のキーワード確認.

### Step 5: 静的解析

```bash
# Round 1 削除確認
grep -c "FeedbackControls\b" src/app/ArtFreeGuideClient.tsx

# Round 2 mode toggle UI 削除確認
grep -c "flex bg-slate-950 border border-slate-900 p-1 rounded-xl" src/app/ArtFreeGuideClient.tsx
```

期待値:
- Round 1: 1 件 (import 行のみ)
- Round 2: 0 件

### Step 6: スクリーンショット (任意)

ユーザー側で `http://localhost:3003` をブラウザで開いて目視確認:
- mode toggle が見えない
- chat 入力欄が解説の後
- サジェストが見える
- 音声再生・chat 送信 が動作

---

## Round 3 怪しい挙動の候補

### 仮説 1: chat 入力欄が 固定バーと重なる

JSX 並び替えで、 `chat 入力欄` が `固定バー` (再生コントロール) の **前** に
移動した結果、 スクロール時に 視覚的に 重なる可能性.

### 仮説 2: state / handler が chat 入力欄と一緒に動いていない

JSX を 切り取って 貼り付けた だけなら OK だが、 もし `improvementSuggestions`
や `fetchImprovementSuggestions` の state が 同じスコープ内に あれば 問題ない、
外スコープに 移動したら state がリセットされる可能性.

### 仮説 3: 331 行 の大幅な 差分

`git diff` で Round 3 起因の **331 行変更** (insert 280 / delete 51) は
JSX の 切り取り貼り付け だけでは 説明できない 規模.

→ AudioController 全体への 改造 (MeloTTS フォールバック) が 同時期に
混在している可能性. これは Round 3 の タスク範囲外なので **回帰**.

### 仮説 4: conversationLog が 複数回 表示

chat 入力欄を移動した結果、 conversationLog も 複数個所に 表示される.

---

## 成果物

| ファイル | 役割 |
|---------|------|
| `test_report.md` | 検証実行結果 |
| `test_anomalies.md` | 検出された異常 |

これらは **テスト実行後** に 作成する.
