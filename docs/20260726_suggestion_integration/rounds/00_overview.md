# 全体ラウンド計画

**作成日:** 2026-07-26
**目的:** 破壊的改編を避け, 各roundで小さく検証しながら進める
**前提:** サブエージェント (Antigravity) が各roundを実行

---

## 背景

:`v3 実装計画` は大きな変更を含む:

1. mode toggle` の 完全削除
2. chat 入力欄の 位置変更
3. 旧UI` (スター評価 + フィードバック) の 削除
4. API::Response `standard` フィールド削除
5. `getActiveExplanation` 等のロジック修正

これらを **一気に** 依頼すると, 生成AIがよくない改変をされる
リスク がある (例: 関係ない変更、 不要なリネーム、 テストコード 削除)。

**よって, 各 round で小さく commit-sized の変更 に切り分ける。**

---

## 全体目次

| Round | タイトル | 主要変更 | 検証方法 |
|-------|---------|--------|---------|
| 1 | 旧UI削除 | `フィードバック・ご意見` 要素削除 | 表示確認 |
| 2 | mode toggle UI 削除 | `<div className="flex bg-slate-950...">` を削除 | 表示確認 |
| 3 | chat 位置変更 | chat 入力欄 を Highlight Box の後に移動 | スクロール確認 |
| 4 | getActiveExplanation 軽量化 | mode概念を削除, 1本に統合 | 音声再生テスト |
| 5 | API 簡素化 (任意) | `standard` フィールド削除 | curl テスト |
| 6 | 状態管理整理 | `explanationMode` state 削除 | 連続動作テスト |
| 7 | trial デプロイ | 問題なければデプロイ | wrangler deploy |

---

## 各 round の 共通制約

### サブエージェントが守るべきこと

1. **関連ファイルのみ変更**: 関係ない部分はコードに担当しない
2. **`git diff` 一回限定**: 1 round = 1 commit 相当
3. **失敗時は 前 round に戻る**: 進めないときは変更を捨てて報告
4. **完了後の報告は短文に**: 何を変えたかログは 1 round

### 想定当たり前のラインナップ

- **Round 1, 2 は影響範囲小**: UI 要素 を 削除のみ。 動作変化 するべきでない
- **Round 3, 4 は 影響中**: 位置変更 と ロジック。 テスト重要
- **Round 5, 6 は 影響中**: API 変更のため 追加

---

## round ファイル場所

```
docs/20260726_suggestion_integration/rounds/
├── 00_overview.md          ← このファイル (目次のみ)
├── round1_remove_old_feedback_ui.md
├── round2_remove_mode_toggle_ui.md
├── round3_relocate_chat_input.md
├── round4_simplify_get_active_explanation.md
├── round5_api_clean_standard.md    (任意)
├── round6_clean_explanation_mode_state.md
└── round7_trial_deploy.md
```

各 round ファイル = 各サブエージェント依頼の指示書。

---

## サブエージェントへの依頼の要点

- **ALL-OR-NOTHING**: 1 round 内の全ての変更を 必ず行う
- **VERIFY step**: 検証コマンド を 必ず実行する
- **NO UNRELATED CHANGES**: 関係ない部分の書き換えは禁止

---

NOTE: これらの round ファイルは v3 の詳細は不要, それぞれに必要上必要な
コード解説とサブエージェント指示を入れています。 各 round を ユーザーに
見てもらい、 進行を確認しながら進めたいときは round 2 ごとに 中間レポートを
要求してください。
