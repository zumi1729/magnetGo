# magnetGO

`magnetGO` は、かわいい二頭身ロボが頭を外して置き、頭から発生する引力と斥力で金属ギミックを動かして進む 2D パズル試作です。

このリポジトリでは、ゲーム本体とブラウザ上の簡易ステージエディタを同居させています。

## 企画の狙い

- 見た目はかわいいが、ルールはしっかりしたパズルにする
- 能力の発生源を `主人公本体` ではなく `置いた頭` にする
- `頭を置く位置` と `本体の位置` を分離して考えさせる
- 物理ゲームに寄せすぎず、パズルとして読みやすい挙動にする
- ステージを増やしやすいデータ構造と制作導線を作る

## コアコンセプト

- 主人公は二頭身ロボ
- 頭を外してその場に置ける
- 引力 / 斥力は頭の位置からだけ発生する
- 金属箱や将来の金属ギミックを動かして道を作る
- USB メモリを本体で回収し、頭に挿したうえで出口へ入る

## 現在のビジュアル方針

- テーマは `廃墟の研究所`
- くすんだ青緑、灰、錆色を基調にする
- 雰囲気は `寂しいけどかわいい`
- アセットは `64x64 前提のピクセルアート` で統一する

## 現在のプレイ仕様

### ステージ構造

- 1画面固定
- グリッド制
- 標準ステージサイズは `20x20`
- ステージは `width`, `height`, `grid` で管理

### プレイヤー

- 移動は 1 マス単位
- `Space` で頭を置く / 回収する
- 頭を装着している時は、頭の位置は本体と同じ
- 頭を外すと、磁力の発生源は置いた頭になる

### 磁力

- `Q` で引力
- `E` で斥力
- ボタンを押している間だけ有効
- 内部判定は `0.5秒ごと`
- 磁力の届く範囲は頭の周囲 3 マス相当

### 金属箱

- 現在は `軽い金属箱` のみ実装
- 引力 / 斥力で 1 回につき 1 マス動く
- 頭の隣接マスまで来た箱は、引力中は吸着状態になる

### 重い鉄箱

- `Heavy Box` として配置可能
- 箱自体は動かない
- 足場や頭の近くで磁力を使うと、箱ではなくロボ側が動く

### 重力

- プレイヤー
- 外した頭
- 軽い金属箱

この 3 つには重力がかかるようにしてあります。

- 内部判定は約 `0.18秒ごと`
- 足場のないマスでは下に 1 マス落ちる

### クリア条件

- USB を本体で拾う
- 頭に近づいて USB を挿す
- 頭を装着した状態で出口に入る

## 今後の拡張前提

まだ未実装ですが、設計上は今後これを足す前提です。

- 重い金属壁
- 磁性切替装置
- 極性スイッチ
- 追加ステージ
- ステージメタ情報の編集 UI

## 起動方法

最も簡単なのは [`index.html`](/root/magnetGO/index.html) を直接ブラウザで開く方法です。

ローカルサーバーを使う場合:

```bash
cd /root/magnetGO
python3 -m http.server 8000
```

ブラウザで開く:

- `http://localhost:8000`

## 操作

### プレイ中

- 移動: `Arrow Keys` / `WASD`
- 頭を置く / 回収: `Space`
- 引力: `Q`
- 斥力: `E`
- プレイ状態のリセット: `Reset`

### エディタ中

- 配置: 左クリック
- 連続配置: ドラッグ
- 消去: 右クリック
- モード切替: `Edit` / `Play`

## ステージエディタ

ブラウザ上で `Edit` モードにすると、パレットからギミックを選んで直接配置できます。

### できること

- パレット選択
- キャンバス上への視覚的な配置
- 右クリックで消去
- `Map Size` から幅と高さを変更
- そのまま `Play` に切り替えてテスト
- `Refresh Export` でステージコードを書き出し

### いま置けるもの

- `Empty`
- `Wall`
- `Player`
- `Head`
- `Box`
- `USB`
- `Goal`
- `Red Button`
- `Red Shutter`
- `Cyan Button`
- `Cyan Shutter`

### 制約

- `Player`
- `Head`
- `USB`
- `Goal`

この4つは 1 ステージに 1 個だけです。置き直すと前のものは消えて移動扱いになります。

### Play に入る条件

以下が揃っていないと `Play` には入れません。

- `Player` が1個
- `USB` が1個
- `Goal` が1個

## 保存の考え方

今は保存方法が2段階あります。

### 1. ブラウザ保存

`Edit` でいじった内容は `localStorage` に自動保存されます。

- ページ再読み込み後も残る
- ステージごとに別保存される
- 作業途中の試行錯誤を残す用途

### 2. 実ファイル保存

正式にプロジェクト内へ残したい場合は、`stages/` 配下のファイルを編集します。

対象:

- [stage-1.js](/root/magnetGO/stages/stage-1.js)
- [stage-2.js](/root/magnetGO/stages/stage-2.js)
- [index.js](/root/magnetGO/stages/index.js)

注意:

- ブラウザ保存の内容があると、通常はそちらが優先表示されます
- ただし `stages/` 側の元データが変わった場合は、保存済み編集を自動で無効化して元ファイルを優先します
- 手動で元ファイル状態に戻したい時は `Restore Base` を押してください

## `Reset` と `Restore Base` の違い

### `Reset`

- `Play` 中: そのステージのプレイ状態をリセットする
- `Edit` 中: 編集内容は保持したまま、テスト用状態だけ作り直す

### `Restore Base`

- ブラウザ保存を削除する
- `stages/` 配下の元ファイル状態に戻す

## ステージファイル構成

ステージは `stages/` フォルダに 1 ファイル 1 ステージで置きます。

一覧管理:

- [stages/index.js](/root/magnetGO/stages/index.js)

各ステージ:

- [stages/stage-1.js](/root/magnetGO/stages/stage-1.js)
- [stages/stage-2.js](/root/magnetGO/stages/stage-2.js)
- [stages/stage-3.js](/root/magnetGO/stages/stage-3.js)
- [stages/stage-4.js](/root/magnetGO/stages/stage-4.js)
- [stages/stage-5.js](/root/magnetGO/stages/stage-5.js)

各ステージファイルでは、`width` と `height` を明示し、そのサイズに合わせて `grid` を記述します。

本体側は以下から読み込みます。

- [src/main.js](/root/magnetGO/src/main.js)

## アセット構成

見た目のクオリティを上げるため、現在は `assets/` 配下の `ピクセルアートSVG` を Canvas に読み込んで描画しています。

主な配置先:

- [assets](/root/magnetGO/assets)

主なアセット:

- `robot-head.svg`
- `robot-head-detached.svg`
- `robot-body.svg`
- `robot-body-magnetic.svg`
- `box-light.svg`
- `box-light-attached.svg`
- `usb.svg`
- `usb-plug.svg`
- `goal.svg`
- `wall-fill.svg`
- `wall-edge-*.svg`
- `wall-corner-*.svg`
- `scene-left.svg`
- `scene-right.svg`

今後さらに見た目を上げる場合は、基本的にこの `assets/` 配下を差し替える方針です。

## ステージ記号

- `#`: 壁
- `.`: 空きマス
- `P`: プレイヤー開始位置
- `O`: 外した頭の開始位置
- `B`: 軽い金属箱
- `U`: USB メモリ
- `G`: 出口

## ステージ追加方法

1. `stages/stage-3.js` のような新規ファイルを作る
2. ステージオブジェクトを export する
3. [stages/index.js](/root/magnetGO/stages/index.js) に import して配列へ追加する

## 現在の技術方針

- 依存なしの静的ブラウザ実装
- `HTML / CSS / JavaScript` のみ
- まずは試作速度優先
- Unity ではなくブラウザで素早く回す前提
- 派手な物理演算より、制御しやすいルールベースを優先

## 今の運用で一番実用的な作り方

1. ブラウザで `Edit` しながら面を作る
2. `Play` で触って調整する
3. 良くなったら `Refresh Export` の内容をステージファイルへ反映する

`stage-3` 以降には、編集の叩き台として使えるプレイ可能な空ステージも入っています。
4. 必要なら `Restore Base` でブラウザ保存との差分を消す
