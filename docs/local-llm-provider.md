# ローカルでの LLM プロバイダ指定

`next dev` は `.env.local` を `process.env` に読み込みます。
`/api/chat` → `getLLMProvider('guide')` は次の順で設定を解決します。

1. `LLM_GUIDE_PROVIDER`
2. `LLM_PROVIDER`
3. `workers-ai`（未設定時の既定値）

NVIDIA NIM を使用する例（実際のキーはコミットしない）：

```dotenv
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=your_nvidia_nim_api_key
```

変更後は開発サーバーを再起動してください。`LLM_GUIDE_PROVIDER` が設定されている場合は、
その値が優先されます。NVIDIA 経路に Cloudflare の AI binding は不要です。
`wrangler.jsonc` の vars は Worker 用設定で、`.env.local` の代わりではありません。

Issue #42 の `Unsupported LLM provider: nvidia` は NVIDIA 未対応の古い実装で発生したものです。
現行 main は NVIDIA と `nim` エイリアスに対応済みです（追加コミット `3d0249a`）。
このエラーが出る場合は実行中の checkout とサーバーを確認してください。
API が 401/403 を返す場合は別の認証・利用権限の問題なので、Workers AI への変更では解消しません。

`npm test` の `src/lib/llm/index.test.ts` では、外部 API をモックして NVIDIA の選択、
`/api/chat` からの呼び出し、タスク別優先順位、キー欠落時の診断を確認します。
