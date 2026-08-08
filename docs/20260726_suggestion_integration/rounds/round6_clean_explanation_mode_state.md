# Round 6: 不要 state と setter の 整理

**ランク:** 中リスク (ロジック整理)
**推定工数:** 30-50分
**成功基準:** `explanationMode` 概念 が 完全消える
**依存:** Round 4 (round 5 も 終わっていれば terbaik)

---

## 概要

`explanationMode` state と それを使う関数 を 完全に整理.

- `explanationMode` state を 削除
- `setExplanationMode` を 呼び出してる 条件を 特定し 削除
- `useEffect` 等 の dep array から `explanationMode` を 削除
- Round 2 で残った switch コード (UI の mode判別) を 削除

---

## サブエージェント (Antigravity) への依頼

### やること

1. `ArtFreeGuideClient.tsx` 開く
2. 次のキーワード を 検索して 使用箇所を 全リスト:
   - `explanationMode`
   - `setExplanationMode`
3. 以下の 状況ごとに 対応:
   - state 定義: 削除
   - `setExplanationMode(...)`: 削除 (呼び出し元 も)
   - `useEffect` の dependency: 削除
   - 関数内 `explanationMode === ...` 判定: 削除 (対応 ロジック も)
4. 最後に `count: 0` 確認:
   ```bash
   grep -n "explanationMode" src/app/ArtFreeGuideClient.tsx
   ```
   が、出力ゼロ になれば OK

### 検証コマンド

```bash
cd /home/taira/ArtFreeGuide
npx tsc --noEmit 2>&1 | head -40
pkill -9 -f next 2>/dev/null
rm -rf .next
npx next dev -p 3003 > /tmp/dev6.log 2>&1 &
sleep 8
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3003 --max-time 8
```

### 期待結果

- `grep -n "explanationMode"` の出力は **0件** (`setExplanationMode` も 同様)
- TypeScript エラーなし
- ブラウザ で 作品選択 し 解説が 表示 (1本) される
- 音声再生 可能
- サジェスト クリック で response あり (round 1でサジェスト 設置 出してれば)
- 別 作品を 選んで サジェスト が リセットされる

### 完了後

- `grep -n "explanationMode"` の 実行結果を 貼り付け
- 連続動作テスト の ログを 示す


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
