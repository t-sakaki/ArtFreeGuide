# Round 5: API `standard` フィールド (任意)

**ランク:** 中リスク (API 変更)
**推定工数:** 30-50分
**成功基準:** chat/guide API の 標準フィールド呼び出しが 减った
**依存:** Round 4 完了

---

## 概要

**任意**: round 5 では API の backend 要素を リファクタラする.

- `/api/guide/route.ts`: prompt から `standard` フィールド を **削除** し、
  必ず `short + deep` だけに リライト
- `/api/chat/route.ts`: `standard` を 期待してた コード が ないかも.

---

## サブエージェント (Antigravity) への依頼

### やること

1. `src/app/api/guide/route.ts` を開く
2. 出力プロンプトから `standard:` フィールドを 削除, `GuideOutput` インターフェース
   から も削除
3. default パラメータ から も `explanationMode === 'standard'` を参照する
   ロジックがあれば削除

### 検証コマンド

```bash
cd /home/taira/ArtFreeGuide

# 1. API テスト
curl -sS -X POST http://localhost:3003/api/guide \
  -H "Content-Type: application/json" \
  -d '{"message":"ひまわり"}' \
  --max-time 30 | head -c 600
```

### 期待結果

- `{"short":"...", "deep":"...", ...}` が返る
- `standard` キーがない (deep に 統合されていれば OK)

### 完了後

- API の レスポンス例 を 記録
- database 保存に 影響するか しらを チェック (接続バインディング等)

### スキップ条件

- API 標準 ledger に データが入っているなら 影響確認,
  影響が大きければ **round 5 を スキップ** して round 6 で 任せ,
 後でゆっくりと API を 移動.


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
