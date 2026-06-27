# Vim help source

このディレクトリには，Cosense Vimの仕様確認とテスト設計に使うVim公式ヘルプを保存する．

- Repository: https://github.com/vim/vim
- Commit: `d22ff1c955ff87e8273210eae125aab0e85b6c30`
- Source directory: `runtime/doc`
- Downloaded: 2026-06-26

## Included files

- `index.txt`：各モードのコマンド一覧
- `motion.txt`：motionとtext object
- `change.txt`：変更，削除，yank，register
- `undo.txt`：UndoとRedo
- `visual.txt`：Visual mode
- `insert.txt`：Insert mode

## Update policy

実装中は上記commitを仕様の基準とする．資料を更新するときはcommitを変更し，Cosense Vimの挙動とテストへの影響をレビューする．
