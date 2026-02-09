# Codex 作業指示書: ヘッダー・コンテンツ重なり修正

> この指示書は Claude が調査・設計した結果に基づく実装タスクです。
> 作業前に AI_WORK_CONTEXT.md を必ず読んでください。

---

## 背景

ヘッダー（`position: fixed`）とメインコンテンツの間に 4px の重なりが発生している。原因はメインコンテンツの `padding-top` にハードコードされた `60px` が、実際のヘッダー高さ `64px` と一致していないこと。

また、幅広画面（iPad等）でヘッダーがコンテンツ領域の外まで広がる副次的な問題もある。

## 根本原因

```
ヘッダー実際の高さ:
  padding-top(12px) + コンテンツ(40px) + padding-bottom(12px) = 64px + safe-top

メインコンテンツの padding-top:
  60px + safe-top

→ 4px 不足 → コンテンツ先頭がヘッダーの裏に隠れる
```

---

## タスク一覧

### タスク1: CSS変数の追加

**ファイル**: `css/styles.css`
**場所**: `:root` ブロック内（48行目付近、`--safe-right` の後）

以下の変数を追加:

```css
/* ヘッダー高さ（padding-top 12px + コンテンツ 40px + padding-bottom 12px） */
--header-height: 64px;
```

### タスク2: #main-content の padding-top 修正

**ファイル**: `css/styles.css`
**場所**: 143行目

変更前:
```css
padding-top: calc(60px + var(--safe-top));
```

変更後:
```css
padding-top: calc(var(--header-height) + var(--safe-top));
```

### タスク3: #header の幅制限追加（幅広画面対応）

**ファイル**: `css/styles.css`
**場所**: `#header` ブロック（90-107行目）

以下の2行を追加:

```css
max-width: 600px;
margin: 0 auto;
```

`left: 0; right: 0;` はそのまま維持する（`max-width` + `margin: auto` で中央配置される）。

### タスク4: バージョン番号の更新

**ファイル**: `index.html`

以下の2箇所で `v=2.2.3` → `v=2.2.4` に更新:

- 24行目: `<link rel="stylesheet" href="./css/styles.css?v=2.2.4">`
- 284行目: `<script src="./js/app.js?v=2.2.4"></script>`

---

## 確認観点

| 確認項目 | 期待結果 |
|---------|---------|
| ポータル画面でトップ画像の上端がヘッダーに隠れないこと | コンテンツ全体が見える |
| 各サブページ（メモ・やりたいこと・買い物・設定）で入力欄の上端が隠れないこと | コンテンツ全体が見える |
| 幅600px以上のブラウザでヘッダーがコンテンツ幅と揃うこと | ヘッダーがはみ出さない |
| iPhone Safari（PWAモード）でセーフエリアが正しく機能すること | ノッチ領域にコンテンツが被らない |

## 変更しないこと

- `position: fixed` を `sticky` に変える等のレイアウト構造変更
- ヘッダーの HTML 構造
- JavaScript のロジック
- セーフエリア変数（`--safe-top` 等）の定義

## 変更ファイルまとめ

| ファイル | 変更内容 |
|---------|---------|
| `css/styles.css` | CSS変数追加、padding-top修正、ヘッダー幅制限追加 |
| `index.html` | バージョン番号更新（2箇所） |

---

> 作成: Claude Code（2026-02-09）
> 作業完了後は CURRENT_STATUS.md を更新すること。
