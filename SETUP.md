# 家族ポータル - セットアップガイド（修正版 v2.0）

## 概要
夫婦2人で情報を共有するためのシンプルなポータルWebアプリです。
すべてのデータはGoogleスプレッドシートに保存され、全端末で同期されます。

---

## クイックスタート

### 1. Googleスプレッドシートの準備

1. [Google スプレッドシート](https://sheets.google.com)を新規作成
2. 任意の名前をつける（例：「家族ポータルデータ」）
3. **URLからスプレッドシートIDをコピー**
   ```
   https://docs.google.com/spreadsheets/d/【このIDをコピー】/edit
   ```
1-sl5xav52aE0fnesv9_zSPSBx0b_6l__9ZGXnUkI5qY

### 2. Google Apps Scriptの設定

1. スプレッドシートで **拡張機能 → Apps Script** を開く
2. デフォルトのコードを削除
3. `gas/Code.gs` の内容をすべて貼り付け
4. **★重要★** 15行目の `SPREADSHEET_ID` を設定：
   ```javascript
   const SPREADSHEET_ID = 'あなたのスプレッドシートID';
   ```
5. **Ctrl+S** で保存

### 3. シートの初期化

1. 関数選択で `setupSheets` を選択
2. **▶ 実行** をクリック
3. 初回は権限承認が必要：
   - 「権限を確認」→ アカウント選択
   - 「詳細」→「（プロジェクト名）に移動」
   - 「許可」をクリック
4. スプレッドシートに3つのシート（Memos, Wishes, Shopping）が作成される

### 4. Webアプリとしてデプロイ

1. **デプロイ → 新しいデプロイ** をクリック
2. 歯車アイコン → **ウェブアプリ** を選択
3. 設定：
   - **説明**: 任意
   - **次のユーザーとして実行**: 自分
   - **アクセスできるユーザー**: 「全員」
4. **デプロイ** をクリック
5. **ウェブアプリのURL** をコピー（`https://script.google.com/.../exec` の形式）

https://script.google.com/macros/s/AKfycbwc-2TwLmlRoKXsh-be3TYuKJsXgekOv4dyyKM9guuOWW2M2AgG2WNX1p4jpu_thuQa/exec

### 5. Webアプリのホスティング

以下のいずれかでHTMLファイルを公開：

**GitHub Pages（推奨・無料）**
1. GitHubでリポジトリ作成
2. ファイルをプッシュ
3. Settings → Pages で有効化

**Netlify（無料）**
1. [netlify.com](https://www.netlify.com/)にサインアップ
2. フォルダをドラッグ&ドロップ

### 6. アプリの設定

1. 公開したURLにアクセス
2. **設定** 画面を開く
3. Apps ScriptのURLを貼り付け
4. **保存** → **接続テスト** で確認

### 7. iPhoneでホーム画面に追加

1. iPhoneのSafariでアプリURLを開く
2. 共有ボタン（□↑）をタップ
3. 「ホーム画面に追加」を選択
4. 「追加」をタップ

---

## スプレッドシート構成

### Memos シート
| 列 | 内容 |
|---|---|
| id | 一意のID |
| content | メモ内容 |
| pinned | ピン留めフラグ (true/false) |
| deleted | 削除フラグ (true/false) |
| createdAt | 作成日時 (ISO8601) |
| updatedAt | 更新日時 (ISO8601) |

### Wishes シート
| 列 | 内容 |
|---|---|
| id | 一意のID |
| title | やりたいこと |
| year | 年 (2024, 2025, ...) |
| status | ステータス (not_started/in_progress/completed) |
| comment | コメント |
| deleted | 削除フラグ |
| createdAt | 作成日時 |
| updatedAt | 更新日時 |

### Shopping シート
| 列 | 内容 |
|---|---|
| id | 一意のID |
| name | 商品名 |
| completed | 購入済みフラグ |
| deleted | 削除フラグ |
| createdAt | 作成日時 |
| updatedAt | 更新日時 |

---

## トラブルシューティング

### 「通信エラー」が表示される

1. **API URLが正しいか確認**
   - `https://script.google.com/macros/s/.../exec` の形式
   - `/dev` ではなく `/exec` で終わること

2. **GASのデプロイ設定を確認**
   - 「アクセスできるユーザー」が「全員」になっているか
   - 新しいデプロイを作成し直す

3. **SPREADSHEET_IDが正しいか確認**
   - GASエディタで `testAPI()` を実行してログを確認

### データが同期されない

- 更新ボタンをタップして再読み込み
- 設定画面で接続テストを実行

### ホーム画面から開くと404エラー

- manifest.jsonのパスがすべて相対パス（`./`）になっているか確認
- キャッシュをクリアしてホーム画面に再追加

---

## 技術的な修正点（v2.0）

| 問題 | 原因 | 修正 |
|------|------|------|
| 通信エラー | POST+JSONでCORSプリフライト失敗 | GETリクエストに変更 |
| データ未共有 | ローカルストレージにフォールバック | フォールバック削除、API必須に |
| スプレッドシート空白 | SPREADSHEET_ID未設定 | 必須設定として明記 |
| 404エラー | manifest.jsonの絶対パス | 相対パスに修正 |

---

## ファイル構成

```
okazaki_portal/
├── index.html          # メインHTML（SPA）
├── manifest.json       # PWAマニフェスト
├── css/
│   └── styles.css      # スタイル
├── js/
│   └── app.js          # メインJS（統合版）
├── gas/
│   └── Code.gs         # GAS API
└── icons/
    ├── icon-192.png    # アイコン
    └── icon-512.png
```

---

## GAS更新時の重要な注意事項

### URLを変えずにコードを更新する方法

GASのコードを修正した際は、**必ず以下の手順**で更新してください：

```
1. GASエディタでコードを編集・保存
2. 「デプロイ」→「デプロイを管理」
3. 既存デプロイの「鉛筆アイコン」（編集）をクリック
4. バージョン: 「新バージョン」を選択
5. 「デプロイ」をクリック
```

### やってはいけないこと

| 操作 | 結果 |
|------|------|
| 「新しいデプロイ」を作成 | URLが変わる → 全端末で再設定が必要 |
| 既存デプロイを削除 | URLが無効化 → アプリが動作しなくなる |

### なぜURLを変えてはいけないか

- iPhoneのホーム画面に追加済みのPWAに影響
- 設定画面でAPI URLを再入力する必要がある
- 家族全員の端末で再設定が必要になる

---

## ライセンス

MIT License
