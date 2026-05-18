# 公開方法

このプロジェクトはビルド不要の静的サイトです。無料公開は GitHub Pages が最短です。

## GitHub Pages

1. 変更を commit して GitHub に push する
2. GitHub のリポジトリ `zumi1729/magnetGo` を開く
3. `Settings` -> `Pages` を開く
4. `Build and deployment` の `Source` を `Deploy from a branch` にする
5. `Branch` を `main`、フォルダを `/ (root)` にして `Save`

公開 URL:

```text
https://zumi1729.github.io/magnetGo/
```

編集画面を開く場合:

```text
https://zumi1729.github.io/magnetGo/index.html?mode=edit
```

## 更新方法

ファイルを編集したら、commit して push します。GitHub Pages は push 後に自動で更新されます。

```bash
git add .
git commit -m "Update magnetGO"
git push origin main
```
