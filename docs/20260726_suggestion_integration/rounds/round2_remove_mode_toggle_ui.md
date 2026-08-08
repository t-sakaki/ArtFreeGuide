# Round 2: mode toggle UI 削除

**ランク:** 低リスク (UI要素のみ)
**推定工数:** 10-25分
**成功基準:** モード toggle「概要 / 詳細」が見えなくなる
**依存:** Round 1 完了

---

## 概要

`<div className="flex bg-slate-950 border border-slate-900 p-1 rounded-xl ...">`
即ち mode toggle タブ を削除する. 

この段階では **UI (見た目)** のみ削除. ロジック (`explanationMode` state、
関数の `mode === 'standard'` 判定等) はそのまま.  後続ラウンドでゆっくり整理.

---

## サブエージェント への依頼

### やること

1. `ArtFreeGuideClient.tsx` を開く
2. 次の キーワード を 探して 該当場所を特定:
   - `(['short', 'standard', 'deep']` 
   - `mode === 'short' ? '概要'`
   - `explanationMode === mode`
3. UI タブ 部分だけ 削除:
   - `<div className="flex bg-slate-950 border border-slate-900 p-1 rounded-xl ...">`
     から対応 `</div>` までを削除
4. **削除しないもの**:
   - `explanationMode` state (Round 6 で 削除予定)
   - `setExplanationMode` を呼ぶ関数 (今 round では UI だけ消す)
5. ここでは `explanationMode` の defaultが `'short'` のままで、 表示される
   解説は 何も選択できない=常に 概要表示, という不安定な状態になるが、 それで OK

### 検証コマンド

```bash
cd /home/taira/ArtFreeGuide

# 1. TypeScript コンパイルチェック
npx tsc --noEmit 2>&1 | head -40

# 2. DEV 確認
npx next dev -p 3003 > /tmp/dev2.log 2>&1 &
sleep 8
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3003 --max-time 8
```

### 期待結果

- `tsc --noEmit`: エラー **残ってる可能性あり** (state 使ってるコード が
  不要な state を呼ぶ場合). **軽く 1-3 個程度なら 無視**. 5個以上は 停止
- `curl`: 200 OK
- ブラウザ: mode toggle が **消えて** いること

### 完了後

- 削除した 行数 を 報告
- 不要 import があれば 追加で削除 (例: 使ってない React hook があれば)


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
