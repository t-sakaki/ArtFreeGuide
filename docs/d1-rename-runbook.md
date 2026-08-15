# D1 データベース改名（`artfreeguide_db_trial` → `artfreeguide_db`）手順書

発表後に実施する前提の手順です。**デモ期間中は実行しないでください。**

## 前提

- D1 に「改名」機能はありません（`wrangler d1` は create / list / delete / execute / export / time-travel のみ、ダッシュボードにも改名UIなし）。名前を変えるには新しいデータベースを作り、中身を移し替えます。
- 本番の binding は `wrangler.jsonc` の `d1_databases[0]`（binding `DB`、`GUIDE_STORE: "d1"`）。
- Wrangler は Node.js 22 以上が必要（`source ~/.nvm/nvm.sh && nvm use 22`）。
- `CLOUDFLARE_API_TOKEN` に `Account / D1 / Edit` 権限が必要。

## 移すもの・移さないもの

現行 DB（2026-08-15 時点、3.1MB / 18テーブル）の内訳:

| テーブル | 件数 | 移行 |
| --- | --- | --- |
| `artwork_guides` | 436 | 必須（解説キャッシュ） |
| `guide_feedback` | 10 | 必須（♡・フィードバック） |
| `d1_migrations` | - | 必須（マイグレーション状態） |
| `artworks` / `artwork_images` | 188 / 176 | 不要（現行はカタログを Supabase で持つ） |
| `playlists` / `playlist_items` | 7 / 30 | 不要（ツアーは `src/lib/playlists.ts`） |
| `hrg_*`（9テーブル） | 約150行 | 不要（別プロダクトの残骸） |

必要な2テーブルだけ移すと、名前の整理とゴミ掃除が同時に終わります。

## 手順

```bash
cd ~/repos/ArtFreeGuide
source ~/.nvm/nvm.sh && nvm use 22
export CLOUDFLARE_API_TOKEN=...   # Account / D1 / Edit
```

1. 新しいデータベースを作る（返ってくる `database_id` を控える）

   ```bash
   npx wrangler d1 create artfreeguide_db
   ```

2. スキーマをマイグレーションで作る（`d1/migrations` が正）

   ```bash
   # wrangler.jsonc の database_name/database_id を新DBに書き換えてから
   npx wrangler d1 migrations apply artfreeguide_db --remote
   ```

3. 旧DBから必要テーブルのデータだけ書き出す

   ```bash
   npx wrangler d1 export artfreeguide_db_trial --remote \
     --table artwork_guides --table guide_feedback \
     --no-schema --output /tmp/afg-data.sql
   ```

4. 新DBへ流し込む

   ```bash
   npx wrangler d1 execute artfreeguide_db --remote --file=/tmp/afg-data.sql
   ```

5. 件数を突き合わせる（旧と一致すること）

   ```bash
   npx wrangler d1 execute artfreeguide_db --remote \
     --command "SELECT (SELECT COUNT(*) FROM artwork_guides) guides, (SELECT COUNT(*) FROM guide_feedback) feedback"
   ```

6. `wrangler.jsonc` を新DBに向けて PR → `main` にマージ（自動デプロイ）

   ```jsonc
   "d1_databases": [
     {
       "binding": "DB",
       "database_name": "artfreeguide_db",
       "database_id": "<手順1のUUID>",
       "migrations_dir": "d1/migrations"
     }
   ]
   ```

7. 本番で読み書きを確認

   ```bash
   curl -s -X POST https://art-free-guide.taira-sakakibara.workers.dev/api/chat \
     -H 'Content-Type: application/json' \
     -d '{"title":"睡蓮","artist":"クロード・モネ","locale":"ja"}' | head -c 200
   # {"cached":true,...,"store":"d1"} が返ること
   ```

8. 1週間ほど旧DBを残して問題がなければ削除

   ```bash
   npx wrangler d1 delete artfreeguide_db_trial
   ```

## 注意

- 手順3〜6の間に本番で生成された解説・♡は旧DBに入り、移行後は引き継がれません（キャッシュなので実害は再生成のみ、♡は数件が失われる可能性）。アクセスの少ない時間帯に実施してください。
- 切り戻しは `wrangler.jsonc` を旧DBに戻して再デプロイするだけです（旧DBを消すまでは常に安全に戻せます）。
- `AGENTS.md` の D1 名の記述も合わせて更新してください。
