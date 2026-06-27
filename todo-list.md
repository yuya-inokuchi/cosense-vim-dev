# Cosense Vim TODO

Cosenseの行編集，自動保存，公開UserScript APIを尊重しながら，Vimの編集文法を再現する．Vimそのものをブラウザ上に複製するのではなく，Cosenseで有用な操作をVimらしい組み合わせで提供する．

## 仕様資料

実装判断は`references/vim-help/`に固定したVim公式ヘルプを基準にする．

- `index.txt`：各モードの全コマンド
- `motion.txt`：motion，operator，text object
- `change.txt`：変更，削除，yank，put，register
- `undo.txt`：UndoとRedo
- `visual.txt`：Visual mode
- `insert.txt`：Insert mode
- `SOURCE.md`：取得元commit

## 開発サイクル

各項目は次の順で進める．

1. 一つの小さな機能を実装する
2. ビルドと手動動作確認を行う
3. コードレビューを行う
4. 実機フィードバックと追加リクエストを反映する
5. 完了条件を満たしたらチェックを付ける
6. 次の機能へ進む

## 現在の実機フィードバック

- [x] 項目があると`k`の上移動が引っ掛かる問題を直す
- [x] codeブロック内の`j`／`k`でリンクを新規ウィンドウ展開しないようにする
- [ ] `:e`で編集開始時にページエリアへfocusを戻す
- [x] `:s`，`:%s`系を実装する
- [x] `/`で検索項目をhighlightする
- [ ] IME controlの必要範囲と実装方法を整理する

## 実装原則

- Cosenseの公開APIを最優先する
- 公開APIがない操作はCosense標準キー処理へ委譲する
- DOMはカーソル表示や文字位置の取得など，表示層に限定して使う
- Cosenseとは別のページ状態やUndo履歴を持たない
- commandを個別ショートカットとして増やさず，`operator + motion/text object`として組み立てる
- IME入力中はVim側でキーを処理しない
- Vim modeをOFFにしたらCosense標準操作へ完全に戻す

## 実装可能性

### A．Cosense標準処理へ安全に委譲できる

- カーソル移動
- 選択範囲の更新
- UndoとRedo
- Insert modeの通常入力
- Backspace，Delete，Enterなどの基本編集

### B．Cosense公開APIで実装できる

- `cosense.Page.lines`による行内容の取得
- `cosense.Page.insertLine()`による行挿入
- `cosense.Page.updateLine()`による行更新
- `cosense.Page.cursor`と`cosense.Page.selection`による状態取得
- `cosense.Page.waitForSave()`による保存待機
- `cosense.Page.show()`によるページ移動

### C．Vim側で範囲計算と状態管理が必要

- word motion
- text object
- operator
- register
- count
- `.`による変更の反復
- `f`，`t`系の検索状態

### D．Cosenseのモデルに対応物がない

- file，buffer，window，tab pageの管理
- shell commandと外部filter
- Vimのswap file，write file，quit window
- tag stack，quickfix，compiler，make

これらは原則として実装対象外にする．

---

## Phase 0．現在の試作を整理する

- [x] `:`コマンドラインを無効化し，UIとCSSを削除する
- [x] `script.ts`を起動とcleanupに限定する
- [x] `scripts/vim/`を作成する
- [x] `types.ts`へ共通型を分離する
- [x] `cosense.ts`へAPI，DOM，標準キー処理への接続を分離する
- [x] `controller.ts`へモードと入力状態を分離する
- [x] `view.ts`へモード表示とblock cursorを分離する
- [x] ホットリロード時のcleanupを維持する
- [x] Vim modeメニューのON／OFFを維持する

### 完了条件

- 既存の`h`，`j`，`k`，`l`，`0`，`$`，`i`，`a`，`v`が従来どおり動く
- Vim modeをOFFにするとCosense標準操作へ戻る
- `script.ts`に個別commandの詳細がない
- ビルドが成功する

## Phase 1．入力パーサー

### 入力文法

```text
[register] [count] command
[register] [count] operator [count] motion
[register] [count] operator text-object
```

### 実装

- [x] parserを純粋関数として作る
- [x] 入力途中の状態を型で表現する
- [x] `1-9`から始まるcountを解析する
- [x] `0`をcountではなくmotionとして判定できるようにする
- [x] operator待機状態を実装する
- [x] 複数キーcommand待機状態を実装する
- [x] text object待機状態を実装する
- [x] `"`に続くregister指定を解析する
- [x] `Escape`で入力途中の状態を解除する
- [x] 未対応入力を安全に破棄する
- [x] 現在の入力途中状態を表示できるようにする

### 完了条件

- `2j`
- `dd`
- `3dd`
- `d2w`
- `2dw`
- `2d3w`
- `diw`
- `"ayy`
- `"_dd`

上記を曖昧なく解析できる．

## Phase 2．位置，範囲，文字分類

operatorを先に増やさず，すべての編集で共有する土台を作る．

- [x] `Position`を定義する
- [x] `Range`を定義する
- [x] characterwise，linewiseを区別する
- [x] inclusive，exclusive motionを区別する
- [x] positionの比較と正規化を実装する
- [x] 行をまたぐrangeの文字列取得を実装する
- [x] Cosense行配列とpositionの境界処理を実装する
- [x] Unicode code pointとDOMの`data-char-index`の差を確認する
- [x] ASCII wordとWORDの分類を定義する
- [x] 日本語文字列でのword境界方針を決める
- [x] Cosense記法の括弧を通常テキストとして扱うか検証する

### 方針

- `word`はVimのkeyword文字と記号の連続を区別する
- `WORD`は空白で区切る
- 絵文字，サロゲートペア，結合文字を途中で分割しない
- 行末の改行はlinewise rangeとして表現する

### 確認結果

- Cosense本体も`splitGraphemes`を使い，DOMの`data-char-index`をgrapheme単位で進めている
- 日本語の文字は`word`のkeyword文字として扱う
- Cosense記法の`[`，`]`などは通常のpunctuationとして扱う

## Phase 3．基本motion

### 最優先

- [x] `h`，`j`，`k`，`l`
- [x] `0`：行の先頭
- [x] `^`：最初の非空白文字
- [x] `$`：行末
- [x] `|`：指定column
- [x] `w`，`b`，`e`
- [x] `W`，`B`，`E`
- [x] `ge`，`gE`
- [x] `gg`：ページ先頭
- [x] `G`：ページ末尾またはcount指定行
- [x] count付きmotion

### 次点

- [x] `f{char}`，`F{char}`
- [x] `t{char}`，`T{char}`
- [x] `;`，`,`による反復
- [x] `%`：対応する`()`，`[]`，`{}`
- [x] `{`，`}`：空行で区切られたCosense上の段落移動

### 保留

- [ ] `(`，`)`：sentence motion

### 対象外

- `H`，`M`，`L`：画面内位置への移動
- `Ctrl-d`，`Ctrl-u`，`Ctrl-f`，`Ctrl-b`：スクロールとカーソル移動

Cosenseではbrowserのスクロール操作で十分なため，Vim固有の画面位置・スクロールcommandは実装しない．

### 完了条件

- Normal，operator-pending，Visualで同じmotion定義を使う
- 空行，タイトル行，最終行で範囲外へ出ない
- 日本語，ASCII，記号，絵文字を含む行で確認する

## Phase 4．register

### データモデル

```ts
type RegisterValue = {
    text: string;
    kind: "character" | "line";
};
```

### Core

- [x] unnamed register `"`
- [x] yank register `0`
- [x] numbered delete registers `1-9`
- [x] small delete register `-`
- [x] named registers `a-z`
- [x] uppercase named registers `A-Z`による追記
- [x] black hole register `_`
- [x] system clipboard register `+`
- [x] register指定なしの既定更新規則

### Compatibility

- [x] `*`を`+`と同じclipboardとして扱う
- [x] linewise値をclipboardへ書く際は末尾改行を付ける
- [x] clipboard権限エラーを呼び出し元へ返し，registerを変更しない

### 対象外

- `:`：最後のEx command
- `.`：最後に挿入した文字列
- `%`：現在のファイル名
- `#`：alternate file
- `=`：expression register
- `/`：最後の検索文字列
- `~`：drag and drop register

対象外registerはCosenseに対応物がないか，関連機能の導入後に再検討する．

## Phase 5．基本operatorと編集command

### Operator

- [x] `d{motion}`
- [x] `y{motion}`
- [x] `c{motion}`
- [x] operatorを2回押したlinewise操作
- [ ] `v`でcharacterwiseを強制
- [ ] `V`でlinewiseを強制

### 単独command

- [x] `x`，`X`
- [x] `dd`
- [x] `yy`と`Y`
- [x] `cc`と`S`
- [x] `D`
- [x] `C`
- [x] `s`
- [x] `r{char}`
- [x] `~`

### Put

- [x] `p`
- [x] `P`
- [x] characterwise put
- [x] linewise put
- [x] count付きput
- [x] register指定付きput

### Cosense固有の注意

- [x] 公開APIに行削除はないため，行削除には標準選択＋Deleteを使い，文字編集には`updateLine()`を使う
- タイトル行のlinewise deleteはページタイトル変更になるため，専用テストを行う
- 最終行を削除した場合のCosenseの空ページ表現を確認する
- linewise putには`cosense.Page.insertLine()`を優先する

### 完了条件

- 変更がCosenseの同期対象として認識される
- register更新規則がVim公式ヘルプと一致する
- 編集後のcursorがVimとして自然な位置にある

## Phase 6．text object

### Core

- [x] `iw`，`aw`
- [x] `iW`，`aW`
- [x] `i"`，`a"`
- [x] `i'`，`a'`
- [x] ``i` ``，``a` ``
- [x] `i(`，`a(`，`ib`，`ab`
- [x] `i[`，`a[`
- [x] `i{`，`a{`，`iB`，`aB`
- [x] `ip`，`ap`をCosenseの空行区切りとして実装する

### 保留または対象外

- `is`，`as`：sentence境界の品質を確保できるまで保留
- `it`，`at`：HTML tag objectはCosense本文では価値が低いため対象外
- `i<`，`a<`：比較記号との曖昧さが大きいため後回し

### 完了条件

- `d`，`y`，`c`，Visual modeで共通利用できる
- 入れ子の括弧で最内側を選択できる
- 対応括弧がない場合は編集しない

## Phase 7．operatorとmotionの統合

- [x] `dw`，`db`，`de`
- [x] `dW`，`dB`，`dE`
- [x] `yw`，`yb`，`ye`
- [x] `cw`，`cb`，`ce`
- [x] `d0`，`d^`，`d$`
- [x] `y0`，`y^`，`y$`
- [x] `c0`，`c^`，`c$`
- [x] `df{char}`，`dt{char}`
- [x] text objectとの組み合わせ
- [x] operator前後のcount乗算
- [x] motionのinclusive／exclusive規則
- [x] exclusive motionが次行column 0へ到達した場合のVim特例

### 完了条件

- range計算と編集処理が分離されている
- operatorごとにmotionロジックを重複させない
- `cw`と`dw`のVim固有の差を再現する

## Phase 8．Insert開始command

Insert mode内の文字編集はCosense標準処理に任せる．Vim側は開始位置と終了だけを管理する．

- [x] `i`
- [x] `a`
- [x] `I`
- [x] `A`
- [x] `o`
- [x] `O`
- [x] `s`
- [x] `S`
- [x] `c{motion}`
- [x] Insert mode終了時のcursor補正
- [x] IME composition中の`Escape`はCosenseへ渡し，通常時のみVim modeを切り替える
- [ ] Insert modeの`Ctrl-r {register}`を後から検討する

## Phase 9．Visual mode

### Characterwise

- [x] `v`で開始と終了
- [x] motionとtext objectで選択範囲を更新する
- [x] `o`で選択端を交換する
- [x] `d`，`x`
- [x] `y`
- [x] `c`，`s`
- [x] `p`，`P`
- [x] `~`

### Linewise

- [x] `V`で開始と終了
- [x] `d`
- [x] `y`
- [x] `c`
- [x] `p`
- [x] `<`，`>`

### 対象外

- blockwise Visual mode `Ctrl-v`

Cosenseは行ごとに独立したモデルを持つため，矩形選択と複数行同時挿入は複雑さに対して価値が低い．

### 完了条件

- Cosense標準の選択表示を使う
- 独自の選択背景CSSを持たない
- Normal modeと同じoperator実装を使う
- `Escape`で選択を安全に解除する

## Phase 10．Undo，Redo，変更反復

### Undo／Redo

- [x] `u`をCosense標準Undoへ委譲する
- [x] `Ctrl-r`をCosense標準Redoへ委譲する
- [x] count付きUndo／Redoを実装する
- [x] Vim側で独自Undo履歴を作らない

### Repeat

- [x] 最後の非Insert変更を構造化して保存する
- [x] `.`で削除，置換，putを反復する
- [x] countを置き換えて反復する
- [x] 明示registerは保持し，register未指定時は実行時のunnamed registerを使う
- [x] Insert modeの入力取得を検証し，IMEとUndo境界を守るため現段階ではrepeat対象外とする

### 現在のrepeat対象

- `x`，`X`
- `p`，`P`
- `D`
- `J`
- `>>`，`<<`
- `>{motion}`，`<{motion}`
- `g~{motion}`，`g~~`
- `gu{motion}`，`guu`
- `gU{motion}`，`gUU`
- `r{char}`
- `~`
- `d{motion}`，`dd`，`d{text-object}`

### 保留

- `c`，`C`，`s`，`S`
- `i`，`a`，`I`，`A`，`o`，`O`

これらの`.`反復は，Insert入力を安全に記録できるようになるまで保留する．IME compositionとCosenseのUndo境界を壊さない記録方法が決まった段階で再検討する．

### 対象外

- `U`：行単位の特殊Undo
- undo tree，`:earlier`，`:later`

CosenseのUndo履歴と競合する独自履歴は作らない．

## Phase 11．行編集と整形

- [x] `J`：行結合
- [x] `>>`：indentを一段増やす
- [x] `<<`：indentを一段減らす
- [x] `>{motion}`
- [x] `<{motion}`
- [x] `g~{motion}`：大文字小文字反転
- [x] `gu{motion}`：小文字化
- [x] `gU{motion}`：大文字化
- [x] `g~~`，`guu`，`gUU`：行単位のcase変換

### 対象外

- `={motion}`：Vimのindent engineに相当するものがない
- `!{motion}`：外部filterを実行しない
- `gq`：Vimのtextwidthによる整形はCosenseの表示モデルと合わない

## Phase 12．検索と移動履歴

編集Coreの完成後に検討する．

- [x] `/`，`?`をVim専用コマンド欄で入力する
- [x] `n`，`N`
- [x] count付き検索反復
- [x] ページ末尾／先頭で検索を折り返す
- [x] 検索確定後に本文focusを戻して一致位置へcursorを移動する
- [x] `*`，`#`：cursor下の語を検索
- [x] `/`検索結果をhighlightする
- [x] Vim側のoverlayで検索highlightを表示する
- [ ] `:nohlsearch`や`:set hlsearch`相当は必要になった段階で検討する
- [x] `m{a-z}`：ページ内mark
- [x] `` `{mark} ``と`'{mark}`
- [x] Cosense行IDで行挿入・削除後もmarkを追従する
- [x] 同一行の文字編集ではgrapheme差分でmark columnを補正する
- [x] markを含む行が削除された場合はmarkを消す
- [ ] `Ctrl-o`，`Ctrl-i`相当のjump履歴は検索・ページ遷移の実装時まで保留する

### 方針

- browser検索を単純に開くだけの実装にはしない
- Cosense標準の`InPageSearch`フォームはfocusを奪い，`n`／`N`の連打を吸収するため利用しない
- `/`，`?`，`n`，`N`はVim専用コマンド欄と独自cursor移動を使う
- `*`，`#`は同じ検索Coreへ接続する
- 検索文字列はVimのコマンド欄へ表示する
- Cosenseのページ遷移履歴とVim jump listを混同しない
- 現段階ではjump対象が少ないため独自jump listを作らない
- local markはpage title，Cosense行ID，columnを組にして保持し，別ページでは使用しない

## Phase 13．追加command

- [x] `.`：Phase 10で実装
- [ ] `R`：Replace modeの需要と実現性を検討する
- [x] `Ctrl-a`，`Ctrl-x`：符号付き10進数の増減
- [x] count付き数値増減
- [x] 先頭ゼロの桁数を可能な範囲で維持する
- [x] BigIntで大きな整数を扱う
- 2進数，8進数，16進数，英字の増減は対象外とする
- [ ] `ZZ`：保存完了後に戻る操作として再解釈する
- [ ] `ZQ`：自動保存のため「保存せず閉じる」は実装しない

### 低優先度

- [ ] `g;`，`g,`：change list
- [ ] `` `[ ``，`` `] ``：最後の変更範囲
- [ ] `` `< ``，`` `> ``：最後のVisual範囲

## Phase 14．Ex command

検索と置換でも再利用できるVim専用コマンド欄を使う．

- [x] `:`コマンドラインを再有効化する
- [x] `:w`：`cosense.Page.waitForSave()`
- [x] `:q`：前ページへ戻る
- [x] `:wq`，`:x`：保存完了後に戻る
- [x] `:qa`，`:home`：プロジェクトHomeへ移動する
- [x] `:e ページ名`：`cosense.Page.show()`
- [x] `:e`後はタイトル行先頭でInsert modeへ入る
- [ ] `:e`で編集開始時にページエリアへfocusを戻す
- [x] `:s`，`:%s`：検索Coreと編集APIを使った置換
- [ ] Project Homeからページへ戻った際の本文focus復元は未解決
- [x] 日本語ページ名をIMEで入力できる
- [x] `Escape`と空欄Backspaceでコマンド欄を閉じる

Vim本来のbufferやwindowを前提とするEx commandは追加しない．

## Phase 15．品質と保守

### 自動テスト

- [ ] parser
- [ ] count
- [ ] positionとrange
- [ ] Unicode文字境界
- [ ] word／WORD境界
- [ ] motion
- [ ] text object
- [ ] register更新規則
- [ ] operatorとmotionの組み合わせ
- [x] repeat descriptor
- [ ] Cosense adapter

### 手動回帰テスト

- [ ] 日本語IME
- [ ] Hot reload
- [ ] Vim mode ON／OFF
- [ ] タイトル行
- [ ] 空行
- [ ] 最終行
- [ ] 長い行
- [ ] code block
- [ ] table
- [ ] link，icon，画像を含む行
- [ ] mobile／touch環境を対象にするか決定する
- [ ] Normal modeでマウス移動した際のblock cursor追従

### ドキュメント

- [ ] READMEに操作一覧を追加する
- [ ] 対応済みcommand表を作る
- [ ] 未対応commandと理由を記載する
- [ ] Cosense APIとfallback経路を記載する

---

## 明確に実装しないもの

次のVim機能はCosenseのモデルに対応せず，本プロジェクトの目的から外れるため実装しない．

- buffer切替とalternate file
- window分割とwindow移動
- tab page
- file write，write as，reload file
- shell，filter，`:make`
- quickfix，location list
- tag jump
- diff mode
- fold command
- spell checking
- Vim script，mapping，abbreviation
- plugin機構
- terminal mode
- blockwise Visual mode
- macro recordingと`@`実行

macroはVimらしい機能だが，ブラウザUIイベント，非同期保存，ページ遷移を安全に再生する設計が必要になる．編集Core完成後に別プロジェクト級の機能として再検討する．

## 次に着手する項目

`:e`後focusは保留し，IME controlは置換入力やInsert modeとの干渉範囲を見て設計する．必要なら`:nohlsearch`と`:set hlsearch`相当も後続で検討する．
