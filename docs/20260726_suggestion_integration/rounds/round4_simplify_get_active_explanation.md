# Round 4: getActiveExplanation を 「詳細版 完全表示」 に修正

**ランク:** 中リスク (ロジック)
**推定工数:** 20-40分
**成功基準:** 解説が responseShort + responseStandard + responseDeep の
**連結 1 本** として 表示・再生される
**依存:** Round 3 完了

---

## 概要

ArtFreeGuideClient 内の `getActiveExplanation()` 関数を mode 概念なしで
**詳細版 完全版** 1 本に統合する.

**背景**: Round 2 で mode toggle UI を削除した結果、 関数は
`explanationMode === 'short'` で **概要のみ** を返していた.
しかし 音声ガイドなんだから、 詳細まで含めた完全版を表示するのが当然.

**現状 (mode 概念あり)**:

```typescript
const getActiveExplanation = () => {
  if (!responseShort) return '';
  if (explanationMode === 'short') return responseShort;
  if (explanationMode === 'standard') return `${responseShort}\n\n${responseStandard}`;
  return `${responseShort}\n\n${responseStandard}\n\n${responseDeep}`;
};
```

**新 (詳細版 完全版)**:

```typescript
const getActiveExplanation = () => {
  if (!responseShort && !responseStandard && !responseDeep) return '';
  const parts = [];
  if (responseShort) parts.push(responseShort);
  if (responseStandard) parts.push(responseStandard);
  if (responseDeep) parts.push(responseDeep);
  return parts.join('\n\n');
};
```

- responseShort + responseStandard + responseDeep を **全部** 連結
- mode 概念を **完全撤廃** (state は Round 6 で削除)
- 音声が 段落途中で 飛ばないことが 期待される (連結による自然さ)

---

## サブエージェント (Antigravity) への依頼

### やること

1. `getActiveExplanation` を 上記 新ロジックに 変更
2. 関連する `useEffect` ( 例: `setSegments` ) が `activeText` を dep にし
   ている場合, それはそのまま OK (`activeText` 出力を使うだけ、 mode 参照
   がない)
3. **削除禁止:** `explanationMode` state, `setExplanationMode` 等.
   それらの 整理は Round 6.

---

## 検証コマンド

```bash
cd /home/taira/ArtFreeGuide
npx tsc --noEmit 2>&1 | head -40
pkill -9 -f next 2>/dev/null
rm -rf .next
npx next dev -p 3003 > /tmp/dev4.log 2>&1 &
sleep 8
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3003 --max-time 8
```

### 静的確認

```bash
grep -n "explanationMode === 'short'\|explanationMode === 'standard'\|explanationMode === 'deep'" src/app/ArtFreeGuideClient.tsx
```

期待: 上記 0件 (mode 判定が消えている)

### 期待結果

- TypeScript エラーなし (もしくは 既存無関連のみ)
- ブラウザ で 作品選択し 音声再生
- 長い 1 本 (responseShort + responseStandard + responseDeep) が 鳴る
- 段落の途中で 飛ばない
- 解説エリアに 詳細版 が 表示される

### 完了後

- 変更コード を diff (シンプル)
- 音声 が 確かに 1 本鳴る ことを 報告
- ユーザー目視確認を お願いします と 明示

---

## ⚠️ GIT 操作禁止

この round で git commit / push / checkout / reset / branch 作成などは
**絶対に実行しないでください**。 これらはユーザー専用操作。

サブエージェントが許される操作:
- ファイル読み書き (本タスク対象のみ)
- `tsc --noEmit`, `curl`, `grep` 等の 検証
- `rm -rf .next` (キャッシュ削除)
- DEV サーバー起動/停止 (ポート3003)

詳細は `GIT_POLICY.md` を参照。

