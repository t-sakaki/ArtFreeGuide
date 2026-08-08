# GIT 操作ポリシー

**作成日:** 2026-07-26
**対象:** 全 Antigravity / サブエージェントタスク

---

## ルール

1. **git commit / push / merge / rebase / checkout は絶対に実行しない**
2. **`git status` / `git diff` / `git log` の 読み取り は OK**
3. **branch 作成 / 削除 は禁止**
4. **tag 作成 / 削除 は禁止**

これらは **ユーザー専用操作** (ぺいくん自身のみ実行可)。

---

## サブエージェントが 守ること

| 操作 | 可否 |
|------|------|
| ファイル読み取り (read_file) | ✅ |
| `git status` | ✅ (把握のみ) |
| `git diff` | ✅ (把握のみ、 patch の資料 に利用可) |
| `git log --oneline -n 5` | ✅ |
| `git add` | ❌ |
| `git commit` | ❌ |
| `git push` | ❌ |
| `git checkout` / `git switch` | ❌ |
| `git reset` / `git revert` | ❌ |
| `git branch` (作成/削除) | ❌ |
| `git tag` | ❌ |
| `npm install` | ❌ (要相談) |
| `rm -rf .next` | ✅ (キャッシュ削除のみ) |
| `wrangler deploy` | ✅ (trial デプロイ時のみ、 round 7 で許可) |

---

## なぜ?

- ユーザー (ぺいくん) は 「記録したことは原則削除しないでください」 との
  ガイドラインを持つ
- ユーザーは 自分の タイミングで commit / push / rollback する
- サブエージェントが 無意味に commit すると git log が 汚れる

---

## 例外

`wrangler deploy` のみ Round 7 で 明示的に許可。 それ以外は禁止。

---

## このポリシーは 全round の MD に 必ず記載
