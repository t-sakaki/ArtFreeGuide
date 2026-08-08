# ArtFreeGuide: AIサジェスト + 1作品1ガイド化

**作成日:** 2026-07-26
**最終更新:** 2026-07-26 (rounds 化完了)
**ステータス:** Phase 段階的実施 移行

## ファイル一覧

| ファイル | 状態 | 目的 |
|---------|------|-----|
| `README.md` | このファイル (旧) | 古いインデックス |
| `00_implementation_plan.md` | 履歴 | v1 (Phase 1) |
| `00_implementation_plan_v2.md` | 履歴 | v2 (mode 2 つに) |
| `00_implementation_plan_v3.md` | 履歴 | v3 (mode 完全削除) |
| `01_conversation_log.md` | 有効 | 全交換ログ |
| `rounds/00_overview.md` | **メイン** | 段階的実施の目次 |
| `rounds/round1_*.md` | 有効 | 旧UI削除 |
| `rounds/round2_*.md` | 有効 | mode toggle UI 削除 |
| `rounds/round3_*.md` | 有効 | chat 位置変更 |
| `rounds/round4_*.md` | 有効 | getActiveExplanation 簡素化 |
| `rounds/round5_*.md` | 有効 (任意) | API `standard` 削除 |
| `rounds/round6_*.md` | 有効 | state 整理 |
| `rounds/round7_*.md` | 有効 | trial デプロイ |

## サブエージェントへの指示の渡し方

`rounds/00_overview.md` からスタートし、 アクティブな round を 1 つずつ
サブエージェントに渡してください. **複数 round を 並列依頼しない** (破壊
的改編を避けるため)。

何か検証フェーズで 問題に 出会った場合:

- round `*` を キャンセル.
- 該当 round を Revisit、 再設計.
- 良い解決 を 得るまで 次へ進まない.

## 関連 (同時保留/並行)

- `../20260726_line_audio_issue/`: 保留 (他タスク優先)
