# 001: サブスクリスト機能の追加

## 概要

夫婦で利用しているサブスクリプションサービスを管理する「サブスクリスト」機能を新規追加する。
合わせて、設定画面へのアクセスをポータルのグリッドカードからヘッダーアイコンに移動し、空いたグリッド枠にサブスクリストカードを配置する。

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `index.html` | ヘッダーに設定アイコン追加、ポータルのグリッド変更、サブスクリスト画面セクション追加、追加/編集モーダル追加、バージョン番号更新 |
| `js/app.js` | state/cache拡張、サブスクリストCRUD、レンダリング、設定アイコンのナビゲーション、イベントリスナー追加、バージョン番号更新 |
| `css/styles.css` | サブスクリスト用スタイル、ヘッダー設定アイコン用スタイル追加 |
| `gas/Code.gs` | Subscriptionsシート作成、ルーティング追加、CRUD関数追加 |
| `AI_WORK_CONTEXT.md` | バージョン番号更新 |

## バージョン番号

`v2.3.2` → `v2.4.0` に更新すること。更新箇所は以下の4つ:

1. `index.html` 内の `app.js?v=X.X.X`
2. `index.html` 内の `styles.css?v=X.X.X`
3. `index.html` 内のユーザー向けバージョン表記（`.version-footer` と `.app-version`）
4. `AI_WORK_CONTEXT.md` 内の「現在のバージョン」

---

## 変更1: 設定アイコンをヘッダーに移動

### 要件

- ポータル画面（`page-portal`）のときのみ、ヘッダー右側に設定の歯車アイコンを表示する
- 配置は更新ボタンの **左** に置く
- タップで設定画面に遷移する（既存の設定カードと同じ `navigateTo('settings')` の動作）
- ポータル以外の画面では非表示にする（`hidden` クラス）

### ヘッダーの構成（変更後）

```
[← 戻る(hidden)]  [家族ポータル]  [⚙ 設定] [🔄 更新]
```

- 設定ボタンは既存の `header-btn` クラスを使用する
- 歯車SVGアイコン: `<circle cx="12" cy="12" r="3"/>` + 歯車外周のpath（既存の設定カードのSVGを流用）

### ポータルのグリッドから設定カードを削除

- `data-page="settings"` のカードを削除する
- 代わりにサブスクリストカードを配置する（後述）
- グリッドは 2列×2行 のまま維持

---

## 変更2: サブスクリスト画面の追加

### データ構造

```javascript
{
    id: string,           // generateId() で生成
    name: string,         // サービス名（必須）
    price: number,        // 金額・税込（必須）
    billingCycle: string,  // "monthly" | "yearly"
    account: string,      // 引き落とし口座（任意、自由入力テキスト）
    status: string,       // "active" | "cancelled"
    deleted: boolean,     // 論理削除フラグ
    createdAt: string,    // ISO 8601
    updatedAt: string     // ISO 8601
}
```

### ポータル画面のカード

設定カードがあった場所（グリッド4番目）にサブスクリストカードを配置する。

- `data-page="subscriptions"`
- アイコン: リピート/サイクル系のSVG（例: 循環矢印）
- ラベル: `サブスクリスト`
- アイコンの背景色: 既存のカラーパターンに合わせて新しい色を割り当てる（CSS変数 `--subscription-color` を定義）

### 画面レイアウト

上から順に以下を配置する:

#### (A) 合計表示エリア

- 利用中（`status === 'active'` かつ `deleted !== true`）のサブスクのみ集計
- 表示内容:
  - **月額合計**: Σ(月額サブスクの price) + Σ(年額サブスクの price ÷ 12)  ← 小数点以下は切り捨て
  - **年額合計**: 月額合計 × 12
- カード形式（`.card-bg` 背景、shadow付き）
- 金額は `toLocaleString()` で3桁カンマ区切り、先頭に `¥` を付ける

#### (B) 追加ボタン

- テキスト: `＋ サブスクを追加`
- タップでモーダルを開く（後述）
- 既存の `primary-btn` スタイルを参考にしたフルワイドボタン

#### (C) フィルタータブ

- 既存の `.filter-tabs` パターンを使用
- タブ2つ: `利用中`（data-filter="active"）/ `解約済み`（data-filter="cancelled"）
- デフォルトは `利用中`

#### (D) リスト

- コンテナ: `<div id="subscription-list" class="item-list">`
- 各アイテムはカード形式で表示

**カードの構成**:

```
┌──────────────────────────────────┐
│ Netflix                  ¥1,980 │  ← サービス名（左）、金額（右）
│ 月額 ・ 楽天カード                │  ← 課金周期 ・ 口座名（口座未設定時は周期のみ）
│                       [編集] [×] │  ← アクションボタン（右寄せ）
└──────────────────────────────────┘
```

- 解約済みタブでは追加のアクションボタンとして `[再開]` を表示する
- 利用中タブでは `[解約]` ボタンも表示する
- 金額表示は `¥` + `toLocaleString()` で3桁カンマ区切り
- 課金周期は `billingCycle === 'monthly'` なら `月額`、`yearly` なら `年額` と表示

### 追加・編集モーダル

既存のモーダルパターン（もしあれば）に合わせる。なければオーバーレイ + 中央カード形式で新規作成。

**フィールド構成**:

| フィールド | 入力方式 | 必須 | 備考 |
|---|---|---|---|
| サービス名 | `<input type="text">` | はい | placeholder: `例: Netflix` |
| 金額（税込） | `<input type="number">` | はい | placeholder: `例: 1980`、`inputmode="numeric"` |
| 課金周期 | `<select>` | はい | 選択肢: `月額` / `年額`。デフォルト: `月額` |
| 引き落とし口座 | `<input type="text">` | いいえ | placeholder: `例: 楽天カード` |

**ボタン**:
- 追加時: `[キャンセル]` `[追加]`
- 編集時: `[キャンセル]` `[保存]`

**編集モード**: 編集ボタンタップ時、同じモーダルにデータを事前入力して開く。モーダルのタイトルを `サブスクを編集` に変える。

### CRUD操作の実装パターン

既存の買い物リスト（Shopping）と同じパターンで実装する。具体的には:

- **キャッシュキー**: `CONFIG.CACHE_KEY_SUBSCRIPTIONS = 'portal_cache_subscriptions'`
- **state**: `state.subscriptions = []`, `state.subscriptionFilter = 'active'`
- **楽観的UI更新**: 追加・更新・削除はすべてローカルのstateとcacheを即座に更新してからUIを再描画し、バックグラウンドでAPIを呼ぶ。失敗時はロールバック
- **論理削除**: `deleted: true` による論理削除。物理削除しない

#### 関数一覧（js/app.js に追加）

| 関数名 | 動作 |
|---|---|
| `loadSubscriptions()` | キャッシュ → API の順で読み込み。`renderSubscriptions()` を呼ぶ |
| `renderSubscriptions()` | フィルター適用、合計計算、カードHTML生成 |
| `openSubscriptionModal(id?)` | モーダルを開く。id指定時は編集モード |
| `closeSubscriptionModal()` | モーダルを閉じる |
| `saveSubscription()` | モーダルのフォームからデータを取得して追加 or 更新 |
| `toggleSubscriptionStatus(id)` | active ↔ cancelled を切り替え |
| `deleteSubscription(id)` | 論理削除 |

#### loadPageData への追加

```javascript
case 'subscriptions':
    await loadSubscriptions();
    break;
```

#### setupEventListeners への追加

- フィルタータブのクリックイベント
- 追加ボタンのクリックイベント
- モーダルのキャンセル/保存ボタン

---

## 変更3: GAS（gas/Code.gs）

### シート作成

`setupSheets()` に以下を追加:

- シート名: `Subscriptions`
- ヘッダー行: `id`, `name`, `price`, `billingCycle`, `account`, `status`, `deleted`, `createdAt`, `updatedAt`

### ルーティング追加

`handleRequest` のswitch文に3つのcaseを追加:

| action | メソッド | 呼び出す関数 |
|---|---|---|
| `getSubscriptions` | GET | `getSubscriptions()` |
| `addSubscription` | POST | `addSubscription(data)` |
| `updateSubscription` | POST | `updateSubscription(data)` |

### CRUD関数

既存の `getShopping` / `addShopping` / `updateShopping` と同じパターンで実装する。

- `getSubscriptions()`: Subscriptionsシートから全件取得。`price` は数値に変換する。`deleted` はboolean変換する
- `addSubscription(data)`: バリデーション（`id` と `name` が必須）→ `buildRowFromHeaders()` で行を構築 → appendRow
- `updateSubscription(data)`: IDで行を検索 → `buildRowFromHeaders()` で行を更新

`buildRowFromHeaders()` 内のboolean変換対象に `deleted` は既に含まれているが、`price` の数値変換は `buildRowFromHeaders` 内で対応が必要。既存の `year` の数値変換パターンを参考に、`price` も同様に `Number()` 変換を追加する。

---

## 変更4: CSS（css/styles.css）

### 追加するスタイル

- `--subscription-color`: サブスクリスト用のテーマカラー（CSS変数に追加）
- `.subscription-icon`: アイコン背景色
- `.subscription-summary`: 合計表示エリアのスタイル
- `.subscription-item`: カードスタイル（`.shopping-item` を参考に、flex-direction: column にする）
- `.subscription-header`: サービス名と金額の行（flex, space-between）
- `.subscription-meta`: 課金周期・口座名の行
- `.subscription-actions`: アクションボタンの行（右寄せ）
- `.subscription-item.cancelled`: 解約済みの見た目（opacity等）
- `.subscription-modal`: モーダルのオーバーレイ + カード
- `.subscription-modal` 内のフォームスタイル（label, input, select, ボタン）
- `.subscription-add-btn`: フルワイドの追加ボタン

### ヘッダー設定アイコン用

- ヘッダー右側に2つのボタンが並ぶ場合のスタイル調整（gap等）

### レスポンシブ対応

- 既存のメディアクエリ（`max-width: 390px` 等）内にサブスクリスト用の調整を追加

---

## 既存機能への影響

- 設定画面自体の機能は一切変更しない（アクセス経路がカード→ヘッダーアイコンに変わるのみ）
- 他の機能（メモ、ウィッシュリスト、買い物リスト）への影響なし
- GASの既存関数への変更なし（新規関数の追加のみ）

## テスト確認項目

- [ ] ポータル画面が1画面に収まること（iPhone実機確認）
- [ ] ヘッダーの設定アイコンから設定画面に遷移できること
- [ ] 設定アイコンはポータル画面でのみ表示されること
- [ ] サブスクの追加（モーダル入力 → リスト表示）
- [ ] サブスクの編集（モーダルに既存データが入った状態で開く → 保存）
- [ ] サブスクの解約（利用中 → 解約済みタブに移動）
- [ ] サブスクの再開（解約済み → 利用中タブに移動）
- [ ] サブスクの削除（リストから消える）
- [ ] 合計金額が利用中サブスクのみで正しく計算されること
- [ ] 年額サブスクが月額合計に月割り（÷12、切り捨て）で反映されること
- [ ] 口座未入力のサブスクが正しく表示されること（周期のみ表示）
- [ ] API通信失敗時にロールバックされること
- [ ] ページリロード後もデータが保持されていること（キャッシュ + API）
- [ ] GASで `setupSheets()` を実行して Subscriptions シートが作成されること
- [ ] GASのデプロイ更新後にフロントからCRUD操作が動作すること
