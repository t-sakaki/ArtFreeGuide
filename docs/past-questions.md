# 作品ごとの過去質問メモリ

## 対象と接続範囲

`/api/ask` の通常質問に回答できた場合だけ、`recordPastQuestion` が
Supabase の `artwork_questions` へ記録する。自動の `deep_dive`、空の回答、
失敗した生成は記録しない。`suggestedQuestions` の提案文を履歴として登録しない。
提案チップを来訪者が実際に質問として送信した場合は通常の投稿と同じ扱い。

`loadPastQuestions` は日本語の正規作品名・作家名で厳密に絞り、直近30日から
新しい順に最大5件を取得する。名前の正規化は `src/lib/names.ts` を使う。
同じ作品・作家・質問の再投稿は最終投稿日時だけを更新する。
`loadVisitorContext` の `pastQuestions` まで接続済み。
`/api/chat` の生成プロンプトや共有ガイドキャッシュへの接続はまだ行わない。

## 保存内容とアクセス

保存するのは作品名、作家名、質問文、最終投稿日時と内部UUIDだけ。
来訪者ID、IP、回答、解説本文は保存しない。
質問は空白をまとめ、500 UTF-16コード単位を超えたものは保存しない。
メールアドレス、URL、電話番号らしい数字列を含む質問も保存しない。
これは単純な除外であり、氏名・住所等を含む自由文の完全な匿名化ではない。

テーブルはRLSを有効化し、anon/authenticatedの権限を明示的に取り消す。
サーバーのservice_roleだけが読み書きする。公開の質問一覧APIは作らない。
保存・取得エラーで質問文やエラーの生データをログに出さない。保存失敗時はDBエラーコードのみを記録する。
保存の失敗や未設定は通常回答を妨げず、質問の取得失敗は空配列に戻す。
匿名/ログイン済みの区別に関係なく、実際に送信された通常質問が保存対象になる。

## 保存期間

取得は最終投稿から30日以内のみ。書き込み時のSQLトリガーが、全作品の
30日超の行を削除する。投稿が全くない期間は、期限切れの行は検索対象外だが
物理的には次回投稿まで残る。厳密な30日後の物理削除が必要な場合は、管理者が
次のSQLを日次スケジュール等で実行する必要がある（今回スケジューラは追加しない）。

```sql
delete from public.artwork_questions
where last_asked_at < now() - interval '30 days';
```

## サーバーの接続設定

質問APIはサーバーの NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を使う。
Workersの各環境で、URLとサービスキーが同じSupabaseプロジェクトに対応している必要がある。
stagingの設定変更はproductionへ自動では引き継がれない。サービスキーをビルド成果物・ブラウザー・ログへ出さない。

## 適用と確認

1. 接続先を確認し、Supabase管理者がSQL Editor等から
   `supabase/migrations/009_artwork_questions.sql` を適用する。
   service_role RESTキーにはDDL実行権限がないため、アプリから適用しない。
2. Supabaseで `artwork_questions` が存在し、RLSと権限が上記どおりであることを確認する。
3. stagingの `/api/ask` に既知の作品と通常質問をPOSTし、回答が200で返ることを確認する。
4. 同じSupabaseに対してservice_roleで `loadPastQuestions` を呼び、投稿した質問を取得できること、
   別作品・別作家を指定すると混入しないことを確認する。`loadVisitorContext` はuserIdも必要。
5. 合成の検証投稿は作品・作家・質問文を完全一致指定して削除する。

未適用でも通常回答は継続し、過去質問は空配列になる。保存が不要なら
`/api/ask` のrecordPastQuestion呼び出しを外しても、回答の形式は変わらない。

## 検証

- `npm test`: ストア、質問API、文脈への連携と既存テスト。
- `npx tsc --noEmit` と `npm run build`。
- SQL検証は本番ではなく、破棄可能なPostgreSQLで実行する。
  先にSupabase互換のanon/authenticated/service_role（BYPASSRLS）を用意し、
  マイグレーションを適用後、`psql -v ON_ERROR_STOP=1 -f scripts/test_artwork_questions.sql`。
  検証データはトランザクションの最後にROLLBACKする。

## 次の生成プロンプトへの接続時

他人の質問は信頼できない引用データとして扱い、質問内の命令に従わせない。
個人の鑑賞履歴・好みを入れた生成結果を既存の作品・言語単位の共有キャッシュに
保存しない設計にする。今回の変更では共有キャッシュ・UI・`/api/chat`は変更しない。
