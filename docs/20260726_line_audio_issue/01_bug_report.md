# Bug Report

**作成日:** 2026-07-26
**Bug ID:** BUG-2026-0726-LINE-AUDIO
**ステータス:** Open (Fix yet to be planned)
**重大度:** Medium (ユーザーがコア機能を使えない)
**関連 Plan:** `00_implementation_plan.md`

---

## Reproduction (再現手順)

1. ArtFreeGuide (https://art-free-guide-trial.taira-sakakibara.workers.dev)
   にアクセス
2. LINE の messenger で URL をタップ
   - iOS / Android いずれも該当
3. 作品を選択
4. 最下部バーの ▶ (再生) をタップ
5. **音声が出ない** (ユーザー報告)

**Expected Behavior:**
- 解説音声が再生される
- 再生コントロールと進捗が同期

**Actual Behavior:**
- 何も聞こえない (アイコンは切り替わる)
- `isPlaying` state は true になっても音声が出ない

---

## Environment

| 項目 | 値 |
|------|----|
| プラットフォーム | LINE in-app browser (LIFF / LINE WebView) |
| iOS | WKWebView (Safari-based) |
| Android | Chrome Custom Tab (古いバージョンは独自 WebView) |
| 音声エンジン | `window.speechSynthesis` |
| Lang | `ja-JP` |
| ユーザ報告 | (本セッションで報告あり、原因の中身は未確定) |

---

## Hypothesis (原因仮説)

### 主因
**WebView 環境での Web Speech API 制限**

各 OS の WebView は `window.speechSynthesis` を次の通りに扱う：

| OS | WebView | 動作 |
|----|---------|------|
| iOS (現行) | WKWebView | 動作するも、 `getVoices()` から ja-JP ボイスを得られないことがある |
| Android | Chrome Custom Tab | 環境依存: 動かないケース多い |
| Android (LINE独自) | 独自WebView | 完全に speechSynthesis が無効 |

### 副因
**Autoplay 制限 (User activation policy)**

LINE WebView は autoplay policy が厳しい。
「ユーザーのクリック直後にすぐ `speak()` を呼ぶ」が、 1 拍遅れると
発火しない。

### Botany

`SpeechSynthesisUtterance.onstart` ハンドラが呼ばれるタイミングと
実際の発声タイミングがずれているように見えます。

---

## Severity

| 項目 | 評価 |
|------|--------|
| ユーザーに占める割合 | LINE から使うユーザーも多い (主動線) |
| 回避手段 | 外部ブラウザへコピー (利便性低) |
| 代替機能 | あり (テキスト表示) |
| コア機能への影響 | **コア機能 (=音声ガイド) が iphone で使えない** |

→ **Severity: Medium**（コア機能が無効、 回避策自体はあり）

---

## Resolution Strategy

| 短期 | 中期 | 長期 |
|------|------|------|
| LINE ラベルを検出し バナー表示 | Server-side TTS (Workers AI モデル) | 抽象化クラス化し両者サポート |

### 短期実装 (PoC)
```typescript
const isLine = /Line\//i.test(navigator.userAgent);

if (!('speechSynthesis' in window) || isLine) {
  // 「外部ブラウザで開いてください」バナーを表示
}
```

### 中期実装
```typescript
// /api/tts/route.ts (新規)
import { getLLMProvider } from '@/lib/llm';

export async function POST(req: Request) {
  const { text, voice = 'ja-JP' } = await req.json();
  // Workers AI TTS 呼び出し ...
  // mp3 バイナリを返す
}
```

---

## Tracking

このバグは docs の 1 リビジョンとして記録。 以下に今後の追跡を残します：

- `docs/20260726_line_audio_issue/00_implementation_plan.md` (本計画)
- `02_qa_evidence.md` (実装後の QA)
- `03_walkthrough.md` (最終報告)

這些は実装され次第更新。
