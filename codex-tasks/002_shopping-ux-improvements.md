# 002: 買い物リスト UX改善（一括追加 + カテゴリ分類）

> **作成日**: 2026-02-09
> **作成者**: Claude Code（設計フェーズ）
> **対象バージョン**: v2.2.5 → v2.3.0
> **変更ファイル**: index.html, js/app.js, css/styles.css, gas/Code.gs

---

## 概要

買い物リストに2つのUX改善を同時に実施する。

1. **一括追加**: 複数アイテムをまとめて追加できるようにする
2. **カテゴリ分類**: 「すぐ買う」「あとで買う」でアイテムを分類できるようにする

---

## 変更①: 一括追加（textarea化）

### 要件

- 入力欄を `<input type="text">` から `<textarea>` に変更
- 改行区切りで複数アイテムを同時に追加
- 1行に1アイテム。空行は無視
- 追加ボタン押下時に全行を分割してそれぞれ追加
- キーボードの Enter は改行（送信しない）。Ctrl+Enter or ボタンクリックで送信

### index.html の変更

`#page-shopping` 内の入力フォーム部分を変更:

**変更前** (line 195-198):
```html
<div class="input-section">
    <input type="text" id="shopping-input" placeholder="買い物アイテムを入力..." />
    <button id="shopping-add-btn" class="primary-btn">追加</button>
</div>
```

**変更後**:
```html
<div class="input-section">
    <textarea id="shopping-input" placeholder="買い物アイテムを入力...&#10;（改行で複数追加）" rows="3"></textarea>
    <div class="input-actions">
        <span class="input-hint">改行で複数追加可</span>
        <button id="shopping-add-btn" class="primary-btn">追加</button>
    </div>
</div>
```

### js/app.js の変更

#### `addShoppingItem()` 関数を複数対応に変更

**変更前** (line 861-896):
```javascript
async function addShoppingItem() {
    const input = document.getElementById('shopping-input');
    const name = input?.value.trim();

    if (!name) {
        showToast('アイテム名を入力してください');
        return;
    }

    const newItem = {
        id: generateId(),
        name: name,
        completed: false,
        deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    // 楽観的UI更新
    state.shopping.unshift(newItem);
    renderShopping();
    saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);
    if (input) input.value = '';

    // バックグラウンドでAPI保存
    const result = await apiRequest('addShopping', newItem);

    if (result) {
        showToast('追加しました');
    } else {
        // 失敗したらロールバック
        state.shopping = state.shopping.filter(i => i.id !== newItem.id);
        renderShopping();
        saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);
        showToast('追加に失敗しました');
    }
}
```

**変更後**:
```javascript
async function addShoppingItem() {
    const input = document.getElementById('shopping-input');
    const rawValue = input?.value.trim();

    if (!rawValue) {
        showToast('アイテム名を入力してください');
        return;
    }

    // 改行で分割し、空行・空白のみの行を除外
    const names = rawValue.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    if (names.length === 0) {
        showToast('アイテム名を入力してください');
        return;
    }

    const newItems = names.map(name => ({
        id: generateId(),
        name: name,
        completed: false,
        deleted: false,
        category: 'soon',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }));

    // 楽観的UI更新（全アイテムをまとめて追加）
    state.shopping.unshift(...newItems);
    renderShopping();
    saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);
    if (input) input.value = '';

    // バックグラウンドでAPI保存（1件ずつ送信）
    let failedCount = 0;
    for (const item of newItems) {
        const result = await apiRequest('addShopping', item);
        if (!result) failedCount++;
    }

    if (failedCount === 0) {
        showToast(`${newItems.length}件追加しました`);
    } else if (failedCount < newItems.length) {
        showToast(`${newItems.length - failedCount}件追加、${failedCount}件失敗`);
    } else {
        // 全件失敗：ロールバック
        const failedIds = new Set(newItems.map(i => i.id));
        state.shopping = state.shopping.filter(i => !failedIds.has(i.id));
        renderShopping();
        saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);
        showToast('追加に失敗しました');
    }
}
```

#### イベントリスナー変更

**変更前** (line 1104-1108):
```javascript
const shoppingInput = document.getElementById('shopping-input');
if (shoppingInput) {
    shoppingInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addShoppingItem();
    });
}
```

**変更後**:
```javascript
const shoppingInput = document.getElementById('shopping-input');
if (shoppingInput) {
    shoppingInput.addEventListener('keydown', (e) => {
        // Ctrl+Enter (or Cmd+Enter) で送信。通常の Enter は改行
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            addShoppingItem();
        }
    });
}
```

### css/styles.css の変更

`#page-shopping .input-hint` のスタイルを追加:

```css
#page-shopping .input-hint {
    font-size: 0.75rem;
    color: var(--text-light);
}
```

※ `<textarea>` のスタイルは既存の `textarea` セレクタで適用されるため追加不要。`input-actions` クラスも共有メモ入力欄で使われている既存クラスを流用。

---

## 変更②: カテゴリ分類（すぐ買う / あとで買う）

### 要件

- アイテムに `category` フィールドを追加（値: `'soon'` / `'later'`）
- タブを2つ→3つに変更: 「すぐ買う」「あとで買う」「購入済み」
- 新規追加アイテムは常に `category: 'soon'`（デフォルト）
- 各アイテムにカテゴリ移動ボタンを表示
  - 「すぐ買う」タブ内 → 「あとで」ボタン（`later` に移動）
  - 「あとで買う」タブ内 → 「すぐ買う」ボタン（`soon` に移動）
- 購入済みチェックの動作は既存通り（チェックボックスタップで `completed` トグル）
- 既存データ（`category` 列なし）は `'soon'` として扱う（フォールバック）

### index.html の変更

`#page-shopping` 内のフィルタータブを変更:

**変更前** (line 200-204):
```html
<div class="filter-tabs">
    <button class="filter-tab active" data-filter="active">買うもの</button>
    <button class="filter-tab" data-filter="completed">購入済み</button>
</div>
```

**変更後**:
```html
<div class="filter-tabs">
    <button class="filter-tab active" data-filter="soon">すぐ買う</button>
    <button class="filter-tab" data-filter="later">あとで買う</button>
    <button class="filter-tab" data-filter="completed">購入済み</button>
</div>
```

### js/app.js の変更

#### state の初期値変更

**変更前** (line 47):
```javascript
shoppingFilter: 'active',
```

**変更後**:
```javascript
shoppingFilter: 'soon',
```

#### `renderShopping()` 関数の変更

**変更前** (line 829-858):
```javascript
function renderShopping() {
    const el = document.getElementById('shopping-list');
    if (!el) return;

    let filtered = state.shopping.filter(item => !item.deleted);

    if (state.shoppingFilter === 'active') {
        filtered = filtered.filter(item => !item.completed);
    } else {
        filtered = filtered.filter(item => item.completed);
    }

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (filtered.length === 0) {
        const message = state.shoppingFilter === 'active'
            ? '買い物リストは空です'
            : '購入済みアイテムはありません';
        el.innerHTML = `<p class="empty-message">${message}</p>`;
        return;
    }

    el.innerHTML = filtered.map(item => `
        <div class="shopping-item ${item.completed ? 'completed' : ''}" data-id="${item.id}">
            <div class="shopping-checkbox ${item.completed ? 'checked' : ''}"
                 onclick="toggleShoppingItem('${item.id}')"></div>
            <span class="shopping-name">${escapeHtml(item.name)}</span>
            <button class="action-btn delete-btn" onclick="deleteShoppingItem('${item.id}')">×</button>
        </div>
    `).join('');
}
```

**変更後**:
```javascript
function renderShopping() {
    const el = document.getElementById('shopping-list');
    if (!el) return;

    let filtered = state.shopping.filter(item => !item.deleted);
    const filter = state.shoppingFilter;

    if (filter === 'soon') {
        filtered = filtered.filter(item => !item.completed && (item.category || 'soon') === 'soon');
    } else if (filter === 'later') {
        filtered = filtered.filter(item => !item.completed && item.category === 'later');
    } else {
        // completed
        filtered = filtered.filter(item => item.completed);
    }

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (filtered.length === 0) {
        const messages = {
            soon: '「すぐ買う」アイテムはありません',
            later: '「あとで買う」アイテムはありません',
            completed: '購入済みアイテムはありません'
        };
        el.innerHTML = `<p class="empty-message">${messages[filter]}</p>`;
        return;
    }

    el.innerHTML = filtered.map(item => {
        // カテゴリ移動ボタン（購入済みタブでは表示しない）
        let moveBtn = '';
        if (filter === 'soon') {
            moveBtn = `<button class="action-btn move-btn" onclick="moveShoppingCategory('${item.id}', 'later')" title="あとで買う">↓</button>`;
        } else if (filter === 'later') {
            moveBtn = `<button class="action-btn move-btn" onclick="moveShoppingCategory('${item.id}', 'soon')" title="すぐ買う">↑</button>`;
        }

        return `
            <div class="shopping-item ${item.completed ? 'completed' : ''}" data-id="${item.id}">
                <div class="shopping-checkbox ${item.completed ? 'checked' : ''}"
                     onclick="toggleShoppingItem('${item.id}')"></div>
                <span class="shopping-name">${escapeHtml(item.name)}</span>
                ${moveBtn}
                <button class="action-btn delete-btn" onclick="deleteShoppingItem('${item.id}')">×</button>
            </div>
        `;
    }).join('');
}
```

#### 新規関数 `moveShoppingCategory()` を追加

`deleteShoppingItem()` の後に追加:

```javascript
async function moveShoppingCategory(id, newCategory) {
    const item = state.shopping.find(i => i.id === id);
    if (!item) return;

    const oldCategory = item.category || 'soon';
    item.category = newCategory;
    item.updatedAt = new Date().toISOString();

    // 楽観的UI更新
    renderShopping();
    saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);

    const label = newCategory === 'soon' ? '「すぐ買う」' : '「あとで買う」';
    showToast(`${label}に移動しました`);

    // バックグラウンドでAPI更新
    const result = await apiRequest('updateShopping', item);

    if (!result) {
        // 失敗したらロールバック
        item.category = oldCategory;
        renderShopping();
        saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);
        showToast('移動に失敗しました');
    }
}
```

#### `addShoppingItem()` 内の `newItem` / `newItems` に `category` を追加

※ 変更①で記載済み。`category: 'soon'` がデフォルトで含まれている。

#### `toggleShoppingItem()` に `category` を保持

既存の `toggleShoppingItem()` は `item` オブジェクトの `completed` を変更してそのまま `apiRequest('updateShopping', item)` に渡しているので、`category` フィールドが `item` に含まれていればそのまま送信される。変更不要。

### css/styles.css の変更

カテゴリ移動ボタンのスタイルを追加（買い物リストセクション内に追記）:

```css
.move-btn {
    color: var(--primary-color);
    font-size: 1rem;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    background: none;
    border: 1px solid var(--border-color);
    cursor: pointer;
    flex-shrink: 0;
}
```

---

## 変更③: GAS (gas/Code.gs) の変更

### `setupSheets()` のヘッダー更新

**注意**: 既存のShoppingシートには `category` 列がないため、手動でヘッダーに `category` を追加するか、新規シート作成時のみ反映される。

**変更前** (line 55):
```javascript
shoppingSheet.appendRow(['id', 'name', 'completed', 'deleted', 'createdAt', 'updatedAt']);
shoppingSheet.getRange(1, 1, 1, 6).setFontWeight('bold');
```

**変更後**:
```javascript
shoppingSheet.appendRow(['id', 'name', 'completed', 'deleted', 'category', 'createdAt', 'updatedAt']);
shoppingSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
```

### `addShopping()` の変更

**変更前** (line 421-428):
```javascript
sheet.appendRow([
    item.id,
    item.name,
    item.completed === true || item.completed === 'true',
    item.deleted === true || item.deleted === 'true',
    item.createdAt || new Date().toISOString(),
    item.updatedAt || new Date().toISOString()
]);
```

**変更後**:
```javascript
sheet.appendRow([
    item.id,
    item.name,
    item.completed === true || item.completed === 'true',
    item.deleted === true || item.deleted === 'true',
    item.category || 'soon',
    item.createdAt || new Date().toISOString(),
    item.updatedAt || new Date().toISOString()
]);
```

### `updateShopping()` の変更

**変更前** (line 447-454):
```javascript
sheet.getRange(i + 1, 1, 1, 6).setValues([[
    item.id,
    item.name,
    item.completed === true || item.completed === 'true',
    item.deleted === true || item.deleted === 'true',
    item.createdAt,
    item.updatedAt || new Date().toISOString()
]]);
```

**変更後**:
```javascript
sheet.getRange(i + 1, 1, 1, 7).setValues([[
    item.id,
    item.name,
    item.completed === true || item.completed === 'true',
    item.deleted === true || item.deleted === 'true',
    item.category || 'soon',
    item.createdAt,
    item.updatedAt || new Date().toISOString()
]]);
```

### `getShopping()` について

`getShopping()` はヘッダー行を動的に読み取って `headers.forEach()` でマッピングしているため、ヘッダーに `category` が追加されれば自動的にフィールドが含まれる。**コード変更は不要**。

---

## 既存データの互換性

- **フロントエンド**: `(item.category || 'soon')` でフォールバック。`category` がない既存データは「すぐ買う」に表示
- **GAS**: `item.category || 'soon'` でフォールバック。既存データの更新時も安全

### スプレッドシートの手動対応（ユーザー作業）

既存の Shopping シートに `category` 列を追加する必要がある:

1. Shopping シートの E列（`createdAt` の前）に列を挿入
2. ヘッダー（E1）に `category` と入力
3. 既存データの E列は空欄のままでOK（GASが `'soon'` にフォールバック）

---

## バージョン更新

以下の **すべて** を `v2.3.0` に更新すること:

1. `index.html` 内の `app.js?v=` → `?v=2.3.0`
2. `index.html` 内の `styles.css?v=` → `?v=2.3.0`
3. `index.html` 内の `.version-footer` → `v2.3.0`
4. `index.html` 内の `.app-version` → `家族ポータル v2.3.0`
5. `AI_WORK_CONTEXT.md` 内の「現在のバージョン」→ `v2.3.0`

---

## テスト確認項目

### 一括追加

- [ ] textarea に1行入力 → 追加ボタン → 1件追加される
- [ ] textarea に3行入力（空行を含む） → 追加ボタン → 空行を除いた行数分追加される
- [ ] Enter キーで改行できる（送信されない）
- [ ] Ctrl+Enter で送信される
- [ ] 追加後に textarea がクリアされる
- [ ] トーストに追加件数が表示される（「3件追加しました」等）

### カテゴリ分類

- [ ] 「すぐ買う」タブにデフォルトでアイテムが表示される
- [ ] 新規追加アイテムが「すぐ買う」タブに表示される
- [ ] 「↓」ボタンタップでアイテムが「あとで買う」に移動する
- [ ] 「あとで買う」タブに移動したアイテムが表示される
- [ ] 「↑」ボタンタップでアイテムが「すぐ買う」に戻る
- [ ] チェックボックスタップで「購入済み」に移動する
- [ ] 「購入済み」タブに購入済みアイテムが表示される
- [ ] 各タブの空表示メッセージが正しい

### 既存データ互換性

- [ ] `category` 列がない既存データが「すぐ買う」タブに表示される
- [ ] 既存データの購入済みチェック・削除が正常に動作する

---

## GAS デプロイ手順（ユーザー作業）

Code.gs を変更した後:

1. GAS エディタを開く
2. Code.gs の内容を更新後のコードに差し替え
3. 「デプロイ」→「デプロイを管理」
4. 鉛筆アイコン → バージョン「新バージョン」を選択
5. 「デプロイ」をクリック

**「新しいデプロイ」は絶対に使わないこと**（URLが変わる）。

スプレッドシートの Shopping シートに `category` 列を手動追加することも忘れずに。
