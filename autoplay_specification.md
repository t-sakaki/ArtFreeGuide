# 本番環境オートプレイ実装仕様書

## 1. 概要
本ドキュメントは、ArtFreeGuideにおける音声ガイドのオートプレイ実装メカニズムを解析した技術仕様書である。ブラウザのオートプレイ制限（Autoplay Policy）を回避しつつ、ユーザー体験を損なわずに連続再生ループを実現する実装パターンを定義する。

## 2. トリガーシーケンス（関数呼び出しフロー）

オートプレイは、ユーザーによる「生成ボタンのクリック」または「履歴からの選択」という**ユーザージェスチャー**を起点として開始される。

### フローチャート
`ユーザー操作 (onClick)` 
  $\rightarrow$ `generateGuide()` 
  $\rightarrow$ `AudioController.forceUnlock()` (エンジン有効化)
  $\rightarrow$ `(API通信完了後)` $\rightarrow$ `setActiveSegmentIndex(0)` $\rightarrow$ `setIsPlaying(true)`
  $\rightarrow$ `useEffect([activeSegmentIndex, isPlaying])` (トリガー)
  $\rightarrow$ `speakSegment(index)`
  $\rightarrow$ `AudioController.speak()` 
  $\rightarrow$ `window.speechSynthesis.speak()`

## 3. 状態管理のタイミング

状態更新の順序は、Reactのレンダリングサイクルと`useEffect`の依存関係を最適化するように設計されている。

| タイミング | 更新される状態 | 目的 |
| :--- | :--- | :--- |
| **生成開始時** | `setIsPlaying(false)` | 前回の再生状態をリセットし、重複再生を防止する。 |
| **API完了直後** | `setActiveSegmentIndex(0)` | 再生開始位置を先頭にセットする。 |
| **API完了直後** | `setIsPlaying(true)` | `useEffect`をトリガーし、音声合成プロセスを起動させる。 |
| **再生中** | `setActiveSegmentIndex(prev => prev + 1)` | `onEnd`コールバック内で次文へインデックスを進める。 |

## 4. ブラウザ制限回避の具体的ロジック

ブラウザの「ユーザー操作なしに音声を出せない」制限を以下の多層的なアプローチで回避している。

### ① Forced-Unlock メカニズム
`AudioController.forceUnlock()` および `AudioController.speak` 内で以下の処理を強制的に実行する。
```typescript
window.speechSynthesis.cancel();
window.speechSynthesis.resume();
```
これにより、サスペンド状態にある`AudioContext`をウェイクアップさせ、エンジンの「詰まり」を解消する。

### ② ユーザージェスチャーへの紐付け
`generateGuide`はボタンの`onClick`イベントハンドラから呼ばれるため、このコールスタック内で`AudioController`を操作することで、ブラウザに「ユーザーの意図的な操作である」と認識させる。

### ③ 遅延実行による同期
`AudioController.speak` 内で `setTimeout(..., 50)` を使用し、`speechSynthesis.cancel()` の処理がブラウザに完全に登録された後に `speak()` を呼ぶことで、命令の競合を防ぎ、確実に音声を出力させる。

## 5. 連続再生への移行メカニズム

オートプレイで開始された後、以下のループ構造によりスムーズな連続再生を実現している。

1. **コールバック連鎖**: `AudioController.speak` に `onEnd` コールバックを渡し、音声終了を検知。
2. **インデックス更新**: `onEnd` 内で `setActiveSegmentIndex(prev => prev + 1)` を実行。
3. **リアクティブトリガー**: `activeSegmentIndex` の変更が `useEffect` を再度発火させ、次の `speakSegment()` が呼ばれる。
4. **終了判定**: `activeSegmentIndex >= speakableSegments.length` に達した時点で `setIsPlaying(false)` とし、ループを停止する。

---
**解析完了日**: 2026-07-22
**解析担当**: Hermes Agent
