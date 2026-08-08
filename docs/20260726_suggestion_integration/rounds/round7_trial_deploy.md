# Round 7: trial デプロイ

**ランク:** 高品質チェック
**推定工数:** 15-25分
**成功基準:** https://art-free-guide-trial.taira-sakakibara.workers.dev
 で 期待 UI/動作
**依存:** Round 1-6 完了

---

## 概要

ローカルDEVで うまく動作したことを受けて trial デプロイ.

---

## サブエージェント (Antigravity) への依頼

### やること

1. ローカルDEV で 試して結果 が OK なら、 次のコマンド で デプロイ:
   ```bash
   cd /home/taira/ArtFreeGuide
   npm run build:cf && wrangler deploy -e trial 2>&1 | tail -40
   ```
2. ビルドが通らない場合は **絶対に無理押ししない**. エラー を 読んで、
   該当 round を 差し戻し.

### 想定確認

- URL 生成: `https://art-free-guide-trial.taira-sakakibara.workers.dev`.
- モバイルエミュレート or 実機 で 入れる:
  - 作品選択
  - mode toggle なし
  - chat 入力欄 が 解説の 後
  - サジェスト (💡📜❓) 表示
  - 送信 → AI 応答 が conversationLog に

### 完了後

- 生成された URL を 報告
- スキップすると 安全そう示したタイミングで


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
