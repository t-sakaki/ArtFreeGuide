# TTS実装比較および503エラー解消に向けた技術分析報告書

## 1. FastingCoach の TTS 実装解析
FastingCoach では、Cloudflare Workers の単一エントリポイント (`src/index.ts`) 内で TTS 処理を実装している。

### 実装の特徴
- **AI Binding の利用**: `env.AI.run('@cf/myshell-ai/melotts', { ... })` を直接呼び出している。
- **API 認証**: Workers AI Binding を使用しているため、コード内での API トークン管理や REST API への HTTP リクエストは行わず、プラットフォームのバインディング機能に依存している。
- **ローカル環境での動作**: 
  - `env.AI` が存在しない場合、`500 Internal Server Error` (JSON形式) を返す設計となっている（行 813-819）。
  - ただし、本質的に Cloudflare Workers 環境で動作することを前提としており、複雑なフォールバックは実装されていない。
- **レスポンス形式**: `ReadableStream`, `ArrayBuffer`, `Uint8Array` または base64 文字列 (`aiRes.audio`) を判定し、適切に `Response` オブジェクトに変換して返している。

---

## 2. ArtFreeGuide との比較分析
ArtFreeGuide (`src/app/api/tts/route.ts`) と FastingCoach の実装を比較した結果、以下の差異が判明した。

### 比較表
| 項目 | FastingCoach | ArtFreeGuide | 差異と影響 |
| :--- | :--- | :--- | :--- |
| **AI Binding 呼び出し** | `env.AI.run` を直接使用 | `getCloudflareContext()` 経由で `env.AI` を取得し呼び出し | ArtFreeGuide は Next.js (OpenNext) 経由でコンテキストを取得するレイヤーがある。 |
| **REST API フォールバック** | なし | あり (`CLOUDFLARE_ACCOUNT_ID` / `TOKEN` を使用) | ArtFreeGuide はバインディングが失敗した際の救済策を持っている。 |
| **Mock レスポンス** | なし (500エラー) | あり (`createMockWavBuffer`) | ArtFreeGuide は環境未整備時でも「音は鳴る（無音/ノイズ）」状態を作る設計。 |
| **エラーレスポンス** | `500` (JSON) | `200` (Mock WAV) または `500` (Mock WAV) | ArtFreeGuide は catch 節でも Mock WAV を返そうとする。 |

### 503 エラーの発生箇所の特定
ArtFreeGuide のコード自体には `return new Response(..., { status: 503 })` という記述は存在しない。
しかし、以下のフローで **インフラ層またはミドルウェア層での 503** が発生している可能性が高い。

1. **AI Binding の失敗**: `env.AI.run` が呼ばれた際、ローカル開発環境 (Wrangler 等) で AI バインディングが正しく設定されていない場合、ランタイムが `503 Service Unavailable` を返すことがある。
2. **REST API の失敗**: REST API フォールバック時、`fetch` 先の Cloudflare API が 503 を返した場合、それをそのまま透過的に返しているわけではないが、ネットワークエラーとして `catch` に飛び、最終的に Mock WAV が返るはずである。
3. **OpenNext/Cloudflare Adapter の挙動**: `getCloudflareContext()` を使用しているため、Next.js の API Route が Workers AI にアクセスしようとした際、バインディングの不整合によりランタイム側で 503 が発生している。

---

## 3. 原因の断定
**結論：AI Binding の呼び出し方と、ローカル環境におけるバインディングの未定義が原因である。**

FastingCoach が動作し、ArtFreeGuide が 503 になる決定的な理由は、**「AI Binding へのアクセス経路の複雑さと、ランタイムによるエラーハンドリングの差」** にある。

- **FastingCoach**: シンプルな Worker 実装であり、`env.AI` がなければ即座に `if (!env.AI)` でチェックし、ユーザー定義の 500 エラーを返して終了する。
- **ArtFreeGuide**: Next.js の API Route 上で動作しており、`getCloudflareContext()` を介してバインディングにアクセスしている。この際、`env.AI` が `undefined` である状態で `env.AI.run` を呼び出そうとするか、あるいは `getCloudflareContext` 内部またはその後の `run` 呼び出し時に Cloudflare のランタイムが「バインディングが未設定である」として **プラットフォームレベルの 503 エラー** を出力している。

特に、ArtFreeGuide の `src/app/api/tts/route.ts` の 49-54行目付近で `env.AI` の存在チェックはしているが、`getCloudflareContext()` が返す `env` の構造がローカル環境で期待通りでない場合、あるいは `run` メソッドがプロキシされており、その内部で 503 が発生していると考えられる。

---

## 4. 移植プラン (Action Plan)

FastingCoach の「勝ちパターン（シンプルで確実なチェック）」を ArtFreeGuide に適用し、503 を回避して Mock または REST API へ確実にフォールバックさせるための修正案を提示する。

### 修正案 1: AI Binding チェックの厳格化
`getCloudflareContext()` の戻り値に対する依存度を下げ、`env.AI` の存在確認をより堅牢に行う。

- **現状**: `if (env && env.AI)`
- **改善**: `env.AI` が関数として正常に動作するか、あるいは `typeof env.AI.run === 'function'` であることを確認してから呼び出す。

### 修正案 2: try-catch 範囲の最適化
AI Binding の呼び出し部分を完全に独立した try-catch で囲み、いかなるランタイムエラー（503 含む）が発生しても、即座に REST API フォールバックへ移行するようにする。

### 修正案 3: ローカル環境での明示的なスキップ
`process.env.NODE_ENV === 'development'` の場合、AI Binding へのアクセスを試行せずに直接 REST API または Mock へ飛ばすルートを追加する。これにより、不安定なローカルバインディングによる 503 を物理的に回避できる。

### 具体的な適用順序
1. `getCloudflareContext()` 取得直後に `env.AI` のメソッド存在チェックを追加。
2. `env.AI.run` 呼び出し時に発生する未キャッチの例外（ランタイム 503）を捕捉できるよう、エラーハンドリングを強化。
3. 開発環境においてバインディングがない場合に `console.warn` を出し、静かに Mock WAV へ遷移させる。
