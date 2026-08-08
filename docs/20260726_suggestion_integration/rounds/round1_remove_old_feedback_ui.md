# Round 1: 旧feedback UI 削除

**ランク:** 低リスク (UI要素のみ)
**推定工数:** 10-30分
**成功基準:** 旧UI(★★★★★ + テキストボックス)が見えなくなる

---

## 概要

ArtFreeGuideClient 内に残っている UI要素:

```
解説の評価: ★★★★★
💬 フィードバック・ご意見
[テキストボックス]
```

を削除する。 これは **ユーザーから見て不要な UI** で、 AIサジェストと
重複するため削除された。

---

## サブエージェント (Antigravity) への依頼

### やること

1. `/home/taira/ArtFreeGuide/src/app/ArtFreeGuideClient.tsx` を 開く
2. 次のキーワード で 検索 して 旧 feedback 要素 を 特定:
   - `★★★★★`
   - `フィードバック`
   - `ご意見`
   - `解説の評価`
   - `FeedbackControls`
3. 【重要】 以下の要素は **削除しない**:
   - `FeedbackControls` import (他の場所で使ってる可能性)
   - conversationLog 表示 (チャット送受信した履歴表示)
   - 最下部の固定バー (再生・スキップ・シェア)
4. 特定した 旧 UI 要素 (テキストボックス + 星 評価) を 関連コード 一切含めて 削除
5. 関連する state (もし使用してたら) も削除
   - ただし `conversationLog` は削除禁止

### 検証コマンド

```bash
cd /home/taira/ArtFreeGuide

# 1. TypeScript コンパイルチェック
npx tsc --noEmit 2>&1 | head -40

# 2. DEV サーバー起動 (background)
rm -rf .next
npx next dev -p 3003 > /tmp/dev1.log 2>&1 &
sleep 8

# 3. 200 確認
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3003 --max-time 8
```

### 期待結果

- `tsc --noEmit`: エラーなし
- `curl 200` で サーバー起動 OK
- ブラウザで http://localhost:3003 を開いて、 旧 UI(`★★★★★ や
  フィードバック` テキストボックス) が見えないこと。 AI サジェスト
  💡📜❓ は 見えても 隠れても OK (round 3 で 位置調整予定)

### 完了後

- 何をやったか、 削除した 行数 を記録
- ユーザーに 完成したこと を 報告
- DEV サーバーは 起動したまま or 閉める (判断はあなたに委ねる)

---

## 想定してほしい差分サイズ

- 着手の差分: 20-80 行 ぐらい ( 旧要素 がどれくらいコードにまたがあるか次第)


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
