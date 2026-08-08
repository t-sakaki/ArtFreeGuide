# ArtFreeGuide: LINE ブラウザ音声問題

**作成日:** 2026-07-26
**更新:** 2026-07-27 → 保留→実装済 (Round 3 で混入した MeloTTS フォールバックを受容)
**ステータス:** 🟡 Partially Implemented (受容)

---

## ステータス更新の理由

ユーザー (ぺいくん) の 判断により、 Round 3 で混入した MeloTTS フォールバック
実装を **受容** する ことになりました.

- **保留中** → **受容 (一部実装済)** に 変更
- Round 1-3 テスト で 異常 #1 が 検出され、 Option B が 採用された

---

## ファイル一覧

| ファイル | 状態 |
|---------|------|
| `00_implementation_plan.md` | 旧計画 (参照用) |
| `01_bug_report.md` | 旧バグレポート (参照用) |
| `02_qa_evidence.md` | 空 (実装検証は Round 1-3 テスト で 実施済) |
| `03_walkthrough.md` | 旧完了報告 (参照用) |
| `README.md` | 本ファイル |

---

## 受容された実装

**`ArtFreeGuideClient.tsx` line 103-256 周辺** に 以下の実装が 追加済:

### 1. `AudioController.currentAudio` / `currentObjectUrl` static fields

```typescript
private static currentAudio: HTMLAudioElement | null = null;
private static currentObjectUrl: string | null = null;
```

### 2. `AudioController.isLineBrowser()` メソッド

```typescript
static isLineBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Line\//i.test(ua);
}
```

### 3. `AudioController.isWebSpeechSupported()` メソッド

```typescript
static isWebSpeechSupported(): boolean {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && !this.isLineBrowser();
}
```

### 4. `AudioController.speakFallback()` private static method

- `/api/tts` (Cloudflare Workers AI MeloTTS) を 呼び出す
- `URL.createObjectURL()` で audio タグに ロード
- `audio.onplay`, `audio.onended`, `audio.onerror` ハンドラ
- 20秒 タイムアウト (safety net)

### 5. `AudioController.speak()` の 改修

- LINE ブラウザで Web Speech を スキップ
- `speakFallback` を 直接呼び出し
- 通常ブラウザで Web Speech が error した 場合も fallback

---

## 受容後の 残課題

LINE 内ブラウザで 実際に **鳴るか** は 未確認:

- TypeScript エラー 0件 (通過)
- DEV サーバー 起動 OK (通過)
- **ブラウザ目視確認** は ユーザー側で 行う予定

---

## LINE 案件の 次アクション

保留中だった LINE 案件は、 **実装が混入した 結果 受容済** となったため、

- 案件の **終了条件** は ブラウザでの 動作確認 のみ
- ユーザー目視確認が 完了すれば、 案件クローズ

---

## 関連 (並行/優先)

- `../20260726_suggestion_integration/rounds/`: 進行中 (Round 1-3 テスト完了)
- Round 4-7 が 残
