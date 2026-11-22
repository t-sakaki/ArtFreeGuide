# Issue 棚卸しと Gemini TTS 設定（2026-11-22）

Refs #175。調査基準は origin/main `677f911`。未完了 Issue は28件、未完了 PR は #117 / #120 の2件（同じ LINE 復元ブランチ）。

Issue 本文・コメントとソースを照合した整理案。GitHub 上のクローズ、作業ツリー削除、PR マージ、本番音源の更新は行っていない。

## 推奨する順序

1. #126：クレジット残量・期限を確認して運用リスクを把握する。
2. #183 + #175：解説文を整え、課金されない Gemini プロジェクトを確認してから音源を生成する。
3. #182 + #102：staging の版を揃え、ツアーと LINE の受け入れ検証を行う。
4. 下記の実装済み旧マイルストーンを根拠付きで整理し、統合検証は #34 に残す。
5. #163 は継続的な親トラッカーとして維持。#178 の編集レビュー、ストア／ドメイン、worktree 保守を別々に進める。

## Issue ごとの整理案

### [#186 ローカルに残存している古い worktree・ブランチの棚卸しと整理](https://github.com/t-sakaki/ArtFreeGuide/issues/186)

**継続・保守。** 調査時点で既存 worktree は19件（今回の作業用を追加後は20件）。各作業ツリーの未コミット変更と PR マージ状況を確認してから整理する。今回は削除していない。

### [#183 [Enhancement] D1アーカイブ済み解説の挨拶残存・プロンプト見出し漏れの一括ブラッシュアップ](https://github.com/t-sakaki/ArtFreeGuide/issues/183)

**継続・解説品質。** PR #184 で防御層は修正済み。保存済み解説の洗い出しと修正、contentHash に対応する音源の再生成は残る。TTS の大量生成より先に解説を整える。

### [#182 [Bug] ツアー中の「次へ」と操作パネル「⏭️ 次作品」ボタンが一致しない / 有効化されない事象が継続](https://github.com/t-sakaki/ArtFreeGuide/issues/182)

**継続・staging 再検証。** PR #181 は main にマージ済み。Issue には古い staging と正常な本番例が記録されている。staging を揃え、動的ツアー・自動遷移・言語切替を検証してから閉じる。

### [#178 [Weekly Art Scout] 2026-11-19 今週のアート話題・コンテンツ候補](https://github.com/t-sakaki/ArtFreeGuide/issues/178)

**継続・編集レビュー待ち。** #163 配下の週次収集結果。公開済みツアーとの重複、作品と出典の妥当性を確認する。収集完了と掲載承認は分ける。

### [#175 音声ガイド: ElevenLabs Creator終了後のTTS運用方針（案A: Gemini Flash TTS移行・無料枠運用）](https://github.com/t-sakaki/ArtFreeGuide/issues/175)

**対応中・本作業。** 運用文書更新と DEFAULT_DEADLINE の解除は main に反映済み。ローカルには通常キーのみあり、無料用キーは未設定。本ブランチで無料モードの暗黙の通常キー利用を止める。生成・試聴・本番への反映は未実施。

### [#163 コンテンツ拡充: アートニュース・展覧会連動の作品探索エージェント導入](https://github.com/t-sakaki/ArtFreeGuide/issues/163)

**継続・親トラッカー。** Phase 1〜3 は完了し PR #185 もマージ済み。最新コメントで週次 Scout の親として継続すると明記されているため、チェック完了だけを理由に閉じない。

### [#129 [Google Play] 申請フローと進捗追跡](https://github.com/t-sakaki/ArtFreeGuide/issues/129)

**継続・外部操作待ち。** Play Console、テスター募集、TWA 署名、実機検証、ストア申請の状態確認が必要。ソースコードだけでは完了判定できない。

### [#126 Supabase クレジット切れ影響調査と R2/自己ホスティングへの移行](https://github.com/t-sakaki/ArtFreeGuide/issues/126)

**継続・優先確認。** クレジット残量と期限は未確認。wrangler.jsonc の R2 バインディングは既にあり、その項目は古い。依存除去は別途継続。今回 DB 移行や課金画面の確認は行っていない。

### [#125 音声ガイド: Keita 等の高品質声を R2 に事前生成し LINE で再生](https://github.com/t-sakaki/ArtFreeGuide/issues/125)

**整理候補・#175 と役割を統合。** R2 AUDIO、pregenerate_narration.mjs、/api/narration、useNarrationAudio は実装済み。Keita/MP3 固定のチェックリストを現行方式に更新し、LINE 実機での再生確認は #102 として残す。

### [#122 [Hackathon] MiniMax Week対応: 作品テーマソング生成 + Speech 2.8読み上げ (feat/artwork-theme-song)](https://github.com/t-sakaki/ArtFreeGuide/issues/122)

**実装済み部分と残作業を分離。** テーマソングAPI、ThemeSongButton、R2 は存在し、コメントにも実装報告がある。Speech 2.8 置換、キャンペーン提出、本番キー設定は別項目として根拠を確認する。

### [#119 [TWA] 独自ドメイン artfreeguide.app を Porkbun で取得し本番サイトへ設定する](https://github.com/t-sakaki/ArtFreeGuide/issues/119)

**継続・外部確認待ち。** ドメイン所有、DNS、TWA に使うドメインを確認する。Issue の価格・取得可否は過去の記録で、現時点の確認結果ではない。

### [#102 [Bug][Regression] LINE連携機能の喪失および音声配信の不具合](https://github.com/t-sakaki/ArtFreeGuide/issues/102)

**継続・LINE 実機検証。** src/app/api/line/webhook/route.ts は存在するため「コード全消失」は古い。/api/tts は Cloudflare と無音モックを含む。Web の R2 再生だけで LINE 音声配信の解決とは判定しない。

### [#101 [UX] AIチャット入力欄と不具合報告入力欄の統合](https://github.com/t-sakaki/ArtFreeGuide/issues/101)

**継続・完了条件の確認。** 操作領域は統合されているが、reportReason/reportComment と明示的な報告操作は残る。本文の「入力内容から質問か報告か自動判別」が実装済みとは確認できない。

### [#43 [Bug][AIAU] pnpm-lock.yaml 混在で Turbopack が workspace root を誤認識](https://github.com/t-sakaki/ArtFreeGuide/issues/43)

**継続・環境依存の再現確認。** next.config.js に turbopack.root の明示設定はない。親ディレクトリの lockfile による警告が今も再現するか確認する。プロジェクト外のファイルは削除しない。

### [#41 [Bug][AIAU] .next 生成済み型が壊れて tsc --noEmit が通らない](https://github.com/t-sakaki/ArtFreeGuide/issues/41)

**クローズ候補・既存の検証記録あり。** 2026-11-15 のコメントにクリーンな main で型チェック成功・クローズ提案がある。古い .next が残る環境の問題とは分けて整理する。

### [#36 [共同][WAVE3] デモ動画撮影 + スライド作成](https://github.com/t-sakaki/ArtFreeGuide/issues/36)

**成果物確認待ち。** docs/slides に資料があるが、動画の納品先・完了条件は Issue にない。最終動画とスライドの場所を確認して閉じる。

### [#35 [共同][WAVE3] 本番デプロイ + 環境変数設定](https://github.com/t-sakaki/ArtFreeGuide/issues/35)

**クローズ候補・過去の公開マイルストーン。** main の自動デプロイと #163 の本番API確認記録がある。現在の管理者キー設定などの残作業とは分ける。

### [#34 [共同][WAVE3] 動作確認: 推薦→パーソナライズ→再推薦の流れ](https://github.com/t-sakaki/ArtFreeGuide/issues/34)

**継続・一連の動作確認。** 推薦・履歴のコードはあるが、この Issue は嗜好更新後の再推薦を含む検証を求めている。テストユーザーを用いた一連の実動作を確認する。

### [#33 [HERMES][WAVE2] デモページ: /demo 国立西洋美術館シナリオ](https://github.com/t-sakaki/ArtFreeGuide/issues/33)

**継続または廃止判断。** 現行 main に src/app/demo はない。旧デモページの必要性を判断し、実装済み扱いにはしない。

### [#32 [HERMES][WAVE2] UI磨き: Noto Serif JP + アニメーション](https://github.com/t-sakaki/ArtFreeGuide/issues/32)

**クローズ候補・デザイン確認。** globals.css に Noto Serif JP を含むシステムフォント指定とアニメーションがある。詳細な完了条件はないため現行UIで満たすか確認する。

### [#31 [Devin][WAVE2] F-2: TTS完了時に視聴履歴・趣向更新](https://github.com/t-sakaki/ArtFreeGuide/issues/31)

**クローズ候補・実装あり。** HomeClient が視聴履歴を送信し、/api/history が保存と listenedSeconds を使う updatePreference を行う。実動作の受け入れ確認は #34 に残す。

### [#30 [Devin][WAVE2] E-4: page.tsxにVector推薦統合](https://github.com/t-sakaki/ArtFreeGuide/issues/30)

**クローズ候補・実装あり。** HomeClient.tsx は useRecommendations を呼び出す。page.tsx は HomeClient のマウント役になっており、旧 Issue の対象ファイルから責務が移った。

### [#29 [手動][WAVE1] SQL Editorで 002_update_vector_1024.sql 実行](https://github.com/t-sakaki/ArtFreeGuide/issues/29)

**旧計画として整理・DB 確認は別。** 旧 1024 次元移行は現在の NVIDIA embedding_nv / match_artworks_nv ルールと異なる。チェックを埋めるために旧 SQL を実行しない。

### [#28 [HERMES][WAVE1] F-1: preference.ts（趣向ベクトル学習）](https://github.com/t-sakaki/ArtFreeGuide/issues/28)

**クローズ候補・実装あり。** src/lib/preference.ts に updatePreference があり /api/history から呼ばれる。DB の実動作確認まで完了したという判定ではない。

### [#27 [HERMES][WAVE1] E-3: artwork.ts（作品名検索）](https://github.com/t-sakaki/ArtFreeGuide/issues/27)

**クローズ候補・実装あり。** src/lib/artworks.ts に findArtwork と searchArtworks がある。旧 artwork.ts の責務を実装している。

### [#26 [HERMES][WAVE1] E-2: user.ts（匿名ユーザー管理）](https://github.com/t-sakaki/ArtFreeGuide/issues/26)

**クローズ候補・実装あり。** src/lib/user.ts に ensureAnonymousUser、/api/users による登録、ID の保存がある。

### [#25 [HERMES][WAVE1] E-1: useRecommendations hook作成](https://github.com/t-sakaki/ArtFreeGuide/issues/25)

**クローズ候補・実装あり。** src/hooks/useRecommendations.ts が存在し HomeClient に接続されている。

### [#24 [HERMES][WAVE1] D: /api/recommendations Vector検索API実装](https://github.com/t-sakaki/ArtFreeGuide/issues/24)

**クローズ候補・実装あり。** /api/recommendations が存在し、embeddings.ts は NVIDIA 用関数を選択する。実装の存在と外部サービスの稼働確認は分ける。

## Gemini 設定と検証

- 既存 ElevenLabs 音源を保持し、Gemini は既存のオフライン生成→R2配信経路を使う。Worker の TTS secret 追加やUIの再レイアウトは不要。
- 課金状態が不明なため、音声生成リクエストは0件。通常キーを無料用キーにコピーして回避しない。
- 通常キーによるモデル一覧取得は HTTP 200。既定の gemini-2.5-flash-preview-tts と generateContent が公開されていることを確認。これは音声生成の利用可否・無料枠・品質を保証する確認ではない。
- 実際のローカル設定で無料モードの preflight がキー不足で停止し、通常キーを使わないことを確認。
- dry-run は staging D1 の596行を読み、ja/en standard の候補423件から1件を選択して成功（神奈川沖浪裏、702文字）。R2 の既存音源を調べていないため、423件を未生成件数として扱わない。
- staging の /api/featured-tours は200、未知の contentHash による /api/narration は200・status=none、contentHash 不足は400。既存APIの疎通確認であり Gemini 音源の再生確認ではない。
- 無料用キーの変数名や1実行10リクエスト制限だけでは課金ゼロを保証しない。AI Studio でプロジェクトの課金無効・実際のモデルとクォータを確認して設定する。
- #117 と #120 は同一ブランチ。両方をマージせず、差分と残課題を確認してどちらかへ整理する。

- ローカル検証：npm ci 成功、npx tsc --noEmit 成功、全29ファイル・186テスト成功（新規のキー分離テスト6件を含む）。
- npm run build：OpenNext の Worker バンドルまで成功。オフライン生成スクリプトの変更のため Worker の再デプロイは行っていない。
