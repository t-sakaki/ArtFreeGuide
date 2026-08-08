# Round 3: chat 入力欄の 位置変更

**ランク:** 中リスク (UI配置ロジック)
**推定工数:** 15-35分
**成功基準:** chat 入力欄 が 解説文の **後に** 移動
**依存:** Round 2 完了

---

## 概要

チャット入力と送信ボタンを mode toggle の **後** から、 解説文
(Highlights Segment Box) の **後** に移動する.

---

## サブエージェント (Antigravity) への依頼

### やること

1. `ArtFreeGuideClient.tsx` 開く
2. 次の JSX ブロック を見つける:
   ```tsx
   {/* AI Chat Input Area - キュレーターに質問 */}
   <div className="w-full max-w-sm mx-auto mt-3 space-y-2">
     ...
     <textarea ... />
     <button>...</button>
     <div>
       {improvementSuggestions.length > 0 && ...}
     </div>
   </div>
   ```
3. この ブロック を **まるごと** `{/* Highlights Segment Box */}` ... `</div>`
   (=解説文の 終わり) の **後** に 移動
4. 「AI Chat Input Area - キュレーターに質問」 この JSX コメント も 一緒に移動

### 検証コマンド

```bash
cd /home/taira/ArtFreeGuide

# 1. TypeScript チェック
npx tsc --noEmit 2>&1 | head -40

# 2. DEV + curl
pkill -9 -f next 2>/dev/null
rm -rf .next
npx next dev -p 3003 > /tmp/dev3.log 2>&1 &
sleep 8
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3003 --max-time 8
```

### 期待結果

- ブラウザで ハードリロード すると、
  ```
  [画像]
  [解説: 💬... + テキスト]
  ------------ ↓ スクロール↓
  [chat入力 + 送信 + サジェスト]
  [固定バー]
  ```
  になっていること
- サジェスト (round 1 で 表示されていれば) もchat入力と一体で動いていること

### 完了後

- 移動した 行/位置 を記録
- スクロールによる chat入力欄への 到達を テストしたか を 報告


---

## ⚠️ GIT 操作禁止

この round で git commit / push / checkout / reset / branch 作成などは
**絶対に実行しないでください**。 これらはユーザー専用操作。

サブエージェントが許される操作:
- ファイル読み書き (本タスク対象のみ)
- `tsc --noEmit`, `curl`, `grep` 等の 検証
- `rm -rf .next` (キャッシュ削除)
- DEV サーバー起動/停止 (ポート3003)

詳細は `GIT_POLICY.md` を参照。
