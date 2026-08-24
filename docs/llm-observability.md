# LLM  observability — Workers Logs での呼出追跡（要点）

## 1. 目的
- LLM_GUIDE_PROVIDER が workers-ai / nvidia / gemini のいずれかであっても、実際にどの provider・どの model で成功/失敗したか、所要時間、キャッシュ hit/miss/generating、試行回数を追えるようにする。
- Workers AI の日次枠消費、Gemini の枠使用、NVIDIA側のフォールバック挙動も確認できるようにする。

## 2. 現状の問題
- 現在は各 LLM プロバイダー（nvidia.ts, workers-ai.ts, gemini.ts）で「失敗したとき」のみ `console.warn`/`console.error` にモデル名・試行回数が出る。
- 成功したときのモデル名・provider・所要時間はログに残っていない。
- /api/chat 側でもキャッシュ hit/miss/generating の区分がログに出ておらず、実際に LLM を呼んだのか、キャッシュを返したのかも追いにくい。

## 3. 方法の妥当性（調べた要点）
- モデル名・成功/失敗・latency・provider・fallback/retry の成否を記録するのは、LLM を使うアプリの observability で一般的なプラクティス。structured JSON で文脈付きログを出すのが推奨されている。
- Cloudflare Workers 環境では、Workers Logs（structured JSON）が手軽な第一候補。ダッシュボードでクエリ・フィルタできる。導入コストが低い。
- Workers Analytics Engine はカウンター・ヒストグラムなど時系列メトリクス向き。ログだけよりも「回数・分布」を集計したいときに意味がある。
- Logpush は R2/S3/外部ログプラットフォームへ大量ログを流す用途。いまの規模ではまだ不要。
- DataDog／Helicone／Portkey／Arize 等の LLM 専用ツールは、多プロバイダ・ルーティング・トレーシング・コスト集約を本格的にやりたいときの選択肢。いまはオーバー。
- D1/Supabase に構造化して残す方法もあるが、ログ専用の手段ではなく、まずは Workers Logs で出すほうが手数が少ない。

結論：Workers Logs（structured JSON）で出すところから始めるのが、規模・意図に対してバランスがいい。

## 4. 採用方針（このプロジェクト）
- 第一候補：Workers Logs（structured JSON）を使う。
- 粒度：
  - LLM 呼出単位で 成功/失敗・model name・provider 種別・所要時間・ミリ秒・試行回数を出す。
  - /api/chat 単位で キャッシュ hit/miss/generating・LLM 呼出回数・総所要時間を出す。
- ログは `console.info`/`console.warn`/`console.error` で出すが、文字列ではなく構造化オブジェクト（なるべく単一の JSON に近い形）で出す。Workers Logs がフィールドとして拾いやすくなる。
- 今回はクライアント表示用ではなく、サーバー側の運用把握用。クライアント UI に出すかは別途判断。

## 5. 実装予定
### 5.1 LLM 層の共通ロギング
- `src/lib/llm/` に「この呼び出しの結果」を出す共通ヘルパーを用意する（または provider 基底／util に寄せる）。
- 各 provider（nvidia, workers-ai, gemini）の `generateResponse` で、成功時・失敗時ともに モデル名・provider 種別・所要時間・ミリ秒・試行回数・成否を出す。
- いまの「失敗時だけ warn/error」をそのまま消さず、成功時にも info 

### 5.2 /api/chat の呼出区分
- cache hit / cache miss→generating / cache miss→error の区分をログに足す。
- そのガイド生成で LLM を何度試行したか、総所要時間も残す。
- 成功した model/provider が分かるように、llm 層のログと絡がる形にする。

## 6. 調査出典（要点）
- Cloudflare Docs: Workers Observability / Workers Logs / Real-time logs / Tail Workers / Logpush
- Cloudflare Blog: Introducing Workers Observability（logs, metrics, queries）
- Cloudflare Docs: Rate Limiting + Analytics Engine による rate limit イベント観測
- 第三者 LLM observability 比較記事群（Datadog, Helicone, Portkey, Arize, Braintrust, Confident AI, LangWatch, Patronus など）：structured logging / model latency / fallbacks / retries / cost tracking が一般的な observability 項目として挙げられている

## 7. 今後の拡張方向
- 回数・分布を集計したいようになったら Workers Analytics Engine のカスタムメトリクスを追加検討。
- ログ容量・保持期間・外部分析が必要になったら Logpush（R2/S3/外部プラットフォーム）を検討。
- その時点で「実際に何回 Gemini を叩いたか」「Workers AI を何回使ったか」を集計ダッシュボードにするかは、必要性を見て判断。
