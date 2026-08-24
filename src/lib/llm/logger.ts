// LLM 呼出の成否・モデル名・provider 種別・所要時間・ミリ秒・試行回数を
// Workers Logs で拾いやすい構造化オブジェクトとして出す。
// 成功は console.info、失敗（attempt_failure / model_exhausted）は console.warn。

export type LlmProviderType = 'workers-ai' | 'nvidia' | 'gemini';

export type LlmCallKind = 'success' | 'attempt_failure' | 'model_exhausted';

export interface LlmCallLog {
  provider: LlmProviderType;
  modelName: string;
  attempt: number;
  totalAttemptsInModel: number;
  success: boolean;
  durationMs: number;
  kind: LlmCallKind;
  error?: string;
  errorCode?: number;
}

/**
 * モデル単位の試行結果を出す。Workers Logs が文字列として扱えるよう
 * JSON.stringify して渡す（structured log として拾いやすくするため）。
 */
export function logLlmCall(result: LlmCallLog): void {
  const payload = JSON.stringify(result);
  switch (result.kind) {
    case 'success':
      console.info(payload);
      break;
    case 'attempt_failure':
    case 'model_exhausted':
      console.warn(payload);
      break;
  }
}

/**
 * /api/chat 単位の呼出結果：
 * キャッシュ hit / miss-generating / miss-error、
 * llm 試行回数・llm 所要時間・総所要時間・成否を出す。
 */
export interface ChatRequestLog {
  title?: string;
  artist?: string;
  locale?: string;
  cacheStatus: 'hit' | 'miss-generating' | 'miss-error';
  llmAttempts: number;
  llmDurationMs: number;
  totalDurationMs: number;
  success: boolean;
  error?: string;
}

export function logChatRequest(result: ChatRequestLog): void {
  const payload = JSON.stringify(result);
  if (result.success) {
    console.info(payload);
  } else {
    console.warn(payload);
  }
}
