/**
 * ============================================
 * 家族ポータル - メインアプリケーション（修正版）
 *
 * 修正点：
 * - ローカルストレージのフォールバックを削除
 * - GETリクエストでCORS問題を回避
 * - 全端末でスプレッドシートのみを参照
 * - 詳細なエラーログ出力
 * ============================================
 */

/* ============================================
   設定
============================================ */
const CONFIG = {
    // API URL は設定画面またはlocalStorageから読み込み
    // ★ ここに直接URLを書くこともできる
    API_URL: '',

    // localStorageキー（API URLの保存のみに使用）
    STORAGE_KEY_API_URL: 'portal_api_url',

    // デバッグモード
    DEBUG: true
};

/* ============================================
   グローバル状態
============================================ */
const state = {
    currentPage: 'portal',
    currentYear: new Date().getFullYear(),
    memos: [],
    wishes: [],
    shopping: [],
    wishFilter: 'all',
    shoppingFilter: 'active',
    isLoading: false
};

/* ============================================
   初期化
============================================ */
document.addEventListener('DOMContentLoaded', () => {
    // 保存されているAPI URLを読み込み
    const savedUrl = localStorage.getItem(CONFIG.STORAGE_KEY_API_URL);
    if (savedUrl) {
        CONFIG.API_URL = savedUrl;
    }

    // イベントリスナーを設定
    setupEventListeners();

    // 初期データを読み込み
    loadPageData('portal');

    // 年表示を初期化
    updateYearDisplay();

    log('App initialized. API URL:', CONFIG.API_URL || '(未設定)');
});

/* ============================================
   ユーティリティ関数
============================================ */

/**
 * デバッグログ
 */
function log(...args) {
    if (CONFIG.DEBUG) {
        console.log('[Portal]', new Date().toLocaleTimeString(), ...args);
    }
}

/**
 * エラーログ
 */
function logError(...args) {
    console.error('[Portal Error]', new Date().toLocaleTimeString(), ...args);
}

/**
 * ローディング表示
 */
function showLoading(show) {
    state.isLoading = show;
    const el = document.getElementById('loading');
    if (el) el.classList.toggle('hidden', !show);
}

/**
 * トースト通知
 */
function showToast(message, duration = 2500) {
    const el = document.getElementById('toast');
    if (el) {
        el.textContent = message;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), duration);
    }
    log('Toast:', message);
}

/**
 * 日時フォーマット
 */
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;

    if (diff < 60 * 1000) return 'たった今';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}時間前`;

    return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * ID生成
 */
function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ============================================
   API通信（修正版）

   ・通常のリクエスト: GET + URLパラメータ
   ・画像アップロード: POST + FormData（URLパラメータ制限を回避）
============================================ */

/**
 * APIリクエスト
 * @param {string} action - アクション名
 * @param {object} data - 送信データ（オプション）
 * @returns {Promise<object|null>}
 */
async function apiRequest(action, data = null) {
    // API URL未設定チェック
    if (!CONFIG.API_URL) {
        logError('API URL が設定されていません。設定画面でURLを入力してください。');
        showToast('API URLを設定してください');
        return null;
    }

    log('API Request:', action, data ? '(data present)' : '(no data)');

    try {
        // 画像アップロードはPOSTで送信（URLパラメータ制限を回避）
        if (action === 'uploadTopImage' && data?.base64) {
            return await apiRequestPost(action, data);
        }

        // 通常のリクエストはGETで送信
        return await apiRequestGet(action, data);

    } catch (error) {
        logError('API error:', error);
        logError('Error name:', error.name);
        logError('Error message:', error.message);

        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            showToast('通信エラー: APIに接続できません');
        } else {
            showToast('通信エラー: ' + error.message);
        }
        return null;
    }
}

/**
 * GETリクエスト（通常のAPI呼び出し用）
 */
async function apiRequestGet(action, data = null) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', action);

    if (data) {
        url.searchParams.set('data', JSON.stringify(data));
    }

    log('GET:', url.toString().substring(0, 200) + '...');

    const response = await fetch(url.toString(), { method: 'GET' });
    return await handleApiResponse(response, action);
}

/**
 * POSTリクエスト（画像アップロード用）
 *
 * GASへの大きなデータ送信にはPOST + text/plainを使用。
 * application/jsonだとCORSプリフライトが発生するため、
 * text/plainで送信し、GAS側でJSONパースする。
 */
async function apiRequestPost(action, data) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', action);

    log('POST:', url.toString());
    log('POST data size:', Math.round(JSON.stringify(data).length / 1024), 'KB');

    const response = await fetch(url.toString(), {
        method: 'POST',
        // text/plain を使用することで CORS プリフライトを回避
        headers: {
            'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: JSON.stringify(data)
    });

    return await handleApiResponse(response, action);
}

/**
 * APIレスポンスを処理
 */
async function handleApiResponse(response, action) {
    log('Response status:', response.status);

    const responseText = await response.text();
    log('Response text:', responseText.substring(0, 300));

    // JSONとしてパース
    let result;
    try {
        result = JSON.parse(responseText);
    } catch (parseError) {
        logError('JSON parse error:', parseError);
        logError('Response was:', responseText.substring(0, 500));
        showToast('APIレスポンスの解析に失敗しました');
        return null;
    }

    // 成功チェック
    if (!result.success) {
        logError('API error:', result.error);
        showToast('エラー: ' + (result.error || '不明なエラー'));
        return null;
    }

    log('API Success:', action);
    return result;
}

/* ============================================
   ページナビゲーション
============================================ */

function navigateTo(pageName) {
    log('Navigate to:', pageName);

    // ページ切り替え
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    const newPage = document.getElementById(`page-${pageName}`);
    if (newPage) {
        newPage.classList.add('active');
        state.currentPage = pageName;
    }

    // ヘッダー更新
    updateHeader(pageName);

    // データ読み込み
    loadPageData(pageName);
}

function updateHeader(pageName) {
    const titles = {
        portal: '家族ポータル',
        memo: '共有メモ',
        wishlist: '今年やりたいこと',
        shopping: '買い物リスト',
        settings: '設定'
    };

    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[pageName] || '家族ポータル';

    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.classList.toggle('hidden', pageName === 'portal');
    }
}

async function loadPageData(pageName) {
    switch (pageName) {
        case 'portal':
            // トップ画像とピン留めメモを並行して読み込み
            await Promise.all([
                loadTopImage(),
                loadPinnedMemos()
            ]);
            break;
        case 'memo':
            await loadMemos();
            break;
        case 'wishlist':
            await loadWishes();
            break;
        case 'shopping':
            await loadShopping();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

/* ============================================
   ポータル画面
============================================ */

async function loadPinnedMemos() {
    if (!CONFIG.API_URL) {
        renderPinnedMemos([]);
        return;
    }

    const result = await apiRequest('getMemos');
    if (result && result.data) {
        state.memos = result.data;
        const pinned = state.memos.filter(m => m.pinned && !m.deleted);
        renderPinnedMemos(pinned);
    } else {
        renderPinnedMemos([]);
    }
}

function renderPinnedMemos(pinnedMemos) {
    const el = document.getElementById('pinned-list');
    if (!el) return;

    if (!CONFIG.API_URL) {
        el.innerHTML = '<p class="empty-message">設定画面でAPI URLを入力してください</p>';
        return;
    }

    if (pinnedMemos.length === 0) {
        el.innerHTML = '<p class="empty-message">ピン留めされたメモはありません</p>';
        return;
    }

    el.innerHTML = pinnedMemos.map(memo => `
        <div class="pinned-item">${escapeHtml(memo.content)}</div>
    `).join('');
}

/* ============================================
   共有メモ
============================================ */

async function loadMemos() {
    if (!CONFIG.API_URL) {
        showToast('API URLを設定してください');
        return;
    }

    showLoading(true);
    const result = await apiRequest('getMemos');
    showLoading(false);

    if (result && result.data) {
        state.memos = result.data;
        renderMemos();
    }
}

function renderMemos() {
    const el = document.getElementById('memo-list');
    if (!el) return;

    const visibleMemos = state.memos
        .filter(m => !m.deleted)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (visibleMemos.length === 0) {
        el.innerHTML = '<p class="empty-message">メモはありません</p>';
        return;
    }

    el.innerHTML = visibleMemos.map(memo => `
        <div class="memo-item ${memo.pinned ? 'pinned' : ''}" data-id="${memo.id}">
            <div class="memo-content">${escapeHtml(memo.content)}</div>
            <div class="memo-meta">
                <span>${formatDate(memo.createdAt)}</span>
                <div class="memo-actions">
                    <button class="action-btn pin-btn ${memo.pinned ? 'active' : ''}"
                            onclick="toggleMemoPin('${memo.id}')">
                        ${memo.pinned ? '📌' : 'ピン留め'}
                    </button>
                    <button class="action-btn delete-btn"
                            onclick="deleteMemo('${memo.id}')">
                        削除
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

async function addMemo() {
    const input = document.getElementById('memo-input');
    const pinCheck = document.getElementById('memo-pin-check');
    const content = input?.value.trim();

    if (!content) {
        showToast('メモを入力してください');
        return;
    }

    const newMemo = {
        id: generateId(),
        content: content,
        pinned: pinCheck?.checked || false,
        deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    showLoading(true);
    const result = await apiRequest('addMemo', newMemo);
    showLoading(false);

    if (result) {
        // 成功したらリストに追加して再描画
        state.memos.unshift(newMemo);
        renderMemos();

        // 入力欄をクリア
        if (input) input.value = '';
        if (pinCheck) pinCheck.checked = false;

        showToast('メモを追加しました');
    }
}

async function toggleMemoPin(id) {
    const memo = state.memos.find(m => m.id === id);
    if (!memo) return;

    memo.pinned = !memo.pinned;
    memo.updatedAt = new Date().toISOString();

    showLoading(true);
    const result = await apiRequest('updateMemo', memo);
    showLoading(false);

    if (result) {
        renderMemos();
        showToast(memo.pinned ? 'ピン留めしました' : 'ピン留めを解除しました');
    } else {
        // 失敗したら元に戻す
        memo.pinned = !memo.pinned;
    }
}

async function deleteMemo(id) {
    if (!confirm('このメモを削除しますか？')) return;

    const memo = state.memos.find(m => m.id === id);
    if (!memo) return;

    memo.deleted = true;
    memo.updatedAt = new Date().toISOString();

    showLoading(true);
    const result = await apiRequest('updateMemo', memo);
    showLoading(false);

    if (result) {
        renderMemos();
        showToast('削除しました');
    } else {
        memo.deleted = false;
    }
}

/* ============================================
   やりたいことリスト
============================================ */

function updateYearDisplay() {
    const el = document.getElementById('current-year');
    if (el) el.textContent = state.currentYear;
}

async function loadWishes() {
    if (!CONFIG.API_URL) {
        showToast('API URLを設定してください');
        return;
    }

    showLoading(true);
    const result = await apiRequest('getWishes');
    showLoading(false);

    if (result && result.data) {
        state.wishes = result.data;
        renderWishes();
    }
}

function renderWishes() {
    const el = document.getElementById('wish-list');
    if (!el) return;

    let filtered = state.wishes.filter(w =>
        w.year === state.currentYear && !w.deleted
    );

    if (state.wishFilter !== 'all') {
        filtered = filtered.filter(w => w.status === state.wishFilter);
    }

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (filtered.length === 0) {
        el.innerHTML = `<p class="empty-message">${state.currentYear}年のやりたいことはありません</p>`;
        return;
    }

    const statusLabels = {
        not_started: '未着手',
        in_progress: '進行中',
        completed: '完了'
    };

    el.innerHTML = filtered.map(wish => `
        <div class="wish-item" data-id="${wish.id}">
            <div class="wish-header">
                <span class="wish-title">${escapeHtml(wish.title)}</span>
                <span class="wish-status ${wish.status}">${statusLabels[wish.status] || wish.status}</span>
            </div>
            ${wish.comment ? `<div class="wish-comment">${escapeHtml(wish.comment)}</div>` : ''}
            <div class="wish-actions">
                <select class="status-select" onchange="updateWishStatus('${wish.id}', this.value)">
                    <option value="not_started" ${wish.status === 'not_started' ? 'selected' : ''}>未着手</option>
                    <option value="in_progress" ${wish.status === 'in_progress' ? 'selected' : ''}>進行中</option>
                    <option value="completed" ${wish.status === 'completed' ? 'selected' : ''}>完了</option>
                </select>
                <div class="memo-actions">
                    <button class="action-btn" onclick="editWishComment('${wish.id}')">コメント</button>
                    <button class="action-btn delete-btn" onclick="deleteWish('${wish.id}')">削除</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function addWish() {
    const input = document.getElementById('wish-input');
    const title = input?.value.trim();

    if (!title) {
        showToast('やりたいことを入力してください');
        return;
    }

    const newWish = {
        id: generateId(),
        title: title,
        year: state.currentYear,
        status: 'not_started',
        comment: '',
        deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    showLoading(true);
    const result = await apiRequest('addWish', newWish);
    showLoading(false);

    if (result) {
        state.wishes.unshift(newWish);
        renderWishes();
        if (input) input.value = '';
        showToast('追加しました');
    }
}

async function updateWishStatus(id, status) {
    const wish = state.wishes.find(w => w.id === id);
    if (!wish) return;

    const oldStatus = wish.status;
    wish.status = status;
    wish.updatedAt = new Date().toISOString();

    const result = await apiRequest('updateWish', wish);
    if (result) {
        renderWishes();
    } else {
        wish.status = oldStatus;
    }
}

async function editWishComment(id) {
    const wish = state.wishes.find(w => w.id === id);
    if (!wish) return;

    const comment = prompt('コメントを入力:', wish.comment || '');
    if (comment === null) return;

    wish.comment = comment;
    wish.updatedAt = new Date().toISOString();

    showLoading(true);
    const result = await apiRequest('updateWish', wish);
    showLoading(false);

    if (result) {
        renderWishes();
    }
}

async function deleteWish(id) {
    if (!confirm('削除しますか？')) return;

    const wish = state.wishes.find(w => w.id === id);
    if (!wish) return;

    wish.deleted = true;
    wish.updatedAt = new Date().toISOString();

    showLoading(true);
    const result = await apiRequest('updateWish', wish);
    showLoading(false);

    if (result) {
        renderWishes();
        showToast('削除しました');
    } else {
        wish.deleted = false;
    }
}

/* ============================================
   買い物リスト
============================================ */

async function loadShopping() {
    if (!CONFIG.API_URL) {
        showToast('API URLを設定してください');
        return;
    }

    showLoading(true);
    const result = await apiRequest('getShopping');
    showLoading(false);

    if (result && result.data) {
        state.shopping = result.data;
        renderShopping();
    }
}

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

    showLoading(true);
    const result = await apiRequest('addShopping', newItem);
    showLoading(false);

    if (result) {
        state.shopping.unshift(newItem);
        renderShopping();
        if (input) input.value = '';
        showToast('追加しました');
    }
}

async function toggleShoppingItem(id) {
    const item = state.shopping.find(i => i.id === id);
    if (!item) return;

    item.completed = !item.completed;
    item.updatedAt = new Date().toISOString();

    const result = await apiRequest('updateShopping', item);
    if (result) {
        renderShopping();
    } else {
        item.completed = !item.completed;
    }
}

async function deleteShoppingItem(id) {
    const item = state.shopping.find(i => i.id === id);
    if (!item) return;

    item.deleted = true;
    item.updatedAt = new Date().toISOString();

    const result = await apiRequest('updateShopping', item);
    if (result) {
        renderShopping();
        showToast('削除しました');
    } else {
        item.deleted = false;
    }
}

/* ============================================
   設定画面
============================================ */

function loadSettings() {
    const apiUrlInput = document.getElementById('api-url');
    if (apiUrlInput) {
        apiUrlInput.value = CONFIG.API_URL || '';
    }
}

function saveSettings() {
    const apiUrlInput = document.getElementById('api-url');
    const url = apiUrlInput?.value.trim() || '';

    CONFIG.API_URL = url;
    localStorage.setItem(CONFIG.STORAGE_KEY_API_URL, url);

    showToast('設定を保存しました');
    log('API URL saved:', url);
}

async function testConnection() {
    if (!CONFIG.API_URL) {
        showToast('API URLを入力してください');
        return;
    }

    showLoading(true);
    const result = await apiRequest('ping');
    showLoading(false);

    if (result) {
        showToast('接続成功！');
    }
}

function clearAllData() {
    if (!confirm('ローカルの設定をクリアしますか？（スプレッドシートのデータは消えません）')) return;

    localStorage.removeItem(CONFIG.STORAGE_KEY_API_URL);
    CONFIG.API_URL = '';
    state.memos = [];
    state.wishes = [];
    state.shopping = [];

    loadSettings();
    showToast('設定をクリアしました');
}

/* ============================================
   イベントリスナー
============================================ */

function setupEventListeners() {
    // アプリカード
    document.querySelectorAll('.app-card').forEach(card => {
        card.addEventListener('click', () => {
            const page = card.dataset.page;
            if (page) navigateTo(page);
        });
    });

    // 戻るボタン
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => navigateTo('portal'));
    }

    // 更新ボタン
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadPageData(state.currentPage);
            showToast('更新しました');
        });
    }

    // メモ追加
    const memoAddBtn = document.getElementById('memo-add-btn');
    if (memoAddBtn) {
        memoAddBtn.addEventListener('click', addMemo);
    }

    const memoInput = document.getElementById('memo-input');
    if (memoInput) {
        memoInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') addMemo();
        });
    }

    // やりたいこと：年変更
    const prevYear = document.getElementById('prev-year');
    const nextYear = document.getElementById('next-year');
    if (prevYear) {
        prevYear.addEventListener('click', () => {
            state.currentYear--;
            updateYearDisplay();
            renderWishes();
        });
    }
    if (nextYear) {
        nextYear.addEventListener('click', () => {
            state.currentYear++;
            updateYearDisplay();
            renderWishes();
        });
    }

    // やりたいこと：追加
    const wishAddBtn = document.getElementById('wish-add-btn');
    if (wishAddBtn) {
        wishAddBtn.addEventListener('click', addWish);
    }

    const wishInput = document.getElementById('wish-input');
    if (wishInput) {
        wishInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addWish();
        });
    }

    // やりたいこと：フィルター
    document.querySelectorAll('#page-wishlist .filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#page-wishlist .filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.wishFilter = tab.dataset.filter;
            renderWishes();
        });
    });

    // 買い物：追加
    const shoppingAddBtn = document.getElementById('shopping-add-btn');
    if (shoppingAddBtn) {
        shoppingAddBtn.addEventListener('click', addShoppingItem);
    }

    const shoppingInput = document.getElementById('shopping-input');
    if (shoppingInput) {
        shoppingInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addShoppingItem();
        });
    }

    // 買い物：フィルター
    document.querySelectorAll('#page-shopping .filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#page-shopping .filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.shoppingFilter = tab.dataset.filter;
            renderShopping();
        });
    });

    // 設定：保存
    const saveSettingsBtn = document.getElementById('save-settings');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }

    // 設定：接続テスト
    const testConnectionBtn = document.getElementById('test-connection');
    if (testConnectionBtn) {
        testConnectionBtn.addEventListener('click', testConnection);
    }

    // 設定：クリア
    const clearCacheBtn = document.getElementById('clear-cache');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', clearAllData);
    }

    // トップ画像：コンテナクリックで画像選択
    const topImageContainer = document.getElementById('top-image-container');
    if (topImageContainer) {
        topImageContainer.addEventListener('click', () => {
            const input = document.getElementById('top-image-input');
            if (input) input.click();
        });
    }

    // トップ画像：ファイル選択
    const topImageInput = document.getElementById('top-image-input');
    if (topImageInput) {
        topImageInput.addEventListener('change', handleTopImageSelect);
    }

    // トップ画像：変更ボタン
    const changeImageBtn = document.getElementById('change-image-btn');
    if (changeImageBtn) {
        changeImageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = document.getElementById('top-image-input');
            if (input) input.click();
        });
    }

    // トップ画像：削除ボタン
    const deleteImageBtn = document.getElementById('delete-image-btn');
    if (deleteImageBtn) {
        deleteImageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTopImage();
        });
    }
}

/* ============================================
   トップ画像機能

   ★ 画像はGoogle Drive（限定公開）に保存
   ★ 取得はGAS経由でBase64として返却
   ★ GitHub上のコードには画像URLは含まれない
============================================ */

/**
 * トップ画像を読み込み
 */
async function loadTopImage() {
    const container = document.getElementById('top-image-container');
    const placeholder = document.getElementById('top-image-placeholder');
    const imageEl = document.getElementById('top-image');
    const actions = document.getElementById('top-image-actions');

    if (!container || !imageEl) return;

    // API URL未設定時
    if (!CONFIG.API_URL) {
        if (placeholder) placeholder.classList.remove('hidden');
        imageEl.classList.add('hidden');
        if (actions) actions.classList.add('hidden');
        return;
    }

    // ローディング表示
    container.classList.add('loading');

    try {
        const result = await apiRequest('getTopImage');

        container.classList.remove('loading');

        if (result && result.hasImage && result.base64) {
            // 画像を表示
            imageEl.src = result.base64;
            imageEl.classList.remove('hidden');
            if (placeholder) placeholder.classList.add('hidden');
            if (actions) actions.classList.remove('hidden');
            log('Top image loaded');
        } else {
            // 画像なし
            imageEl.classList.add('hidden');
            if (placeholder) placeholder.classList.remove('hidden');
            if (actions) actions.classList.add('hidden');
        }
    } catch (error) {
        container.classList.remove('loading');
        logError('Failed to load top image:', error);
    }
}

/**
 * 画像選択時の処理
 *
 * iPhone写真（HEIC/JPEG、数MB〜数十MB）を自動でリサイズし、
 * 1MB以下に圧縮してからアップロードする。
 * ユーザーはサイズや形式を意識する必要がない。
 */
async function handleTopImageSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    // 画像タイプチェック（HEIC は Safari が自動で JPEG に変換）
    if (!file.type.startsWith('image/')) {
        showToast('画像ファイルを選択してください');
        return;
    }

    log('Selected image:', file.name, file.type, formatBytes(file.size));

    showLoading(true);

    try {
        // ファイルをBase64に変換
        const originalBase64 = await fileToBase64(file);

        // 圧縮処理（1MB以下を目標）
        const compressedBase64 = await compressImageForUpload(originalBase64, {
            maxWidth: 1280,
            maxHeight: 1280,
            targetSizeKB: 900,  // 目標: 900KB以下
            minQuality: 0.5     // 最低品質
        });

        // 最終サイズをログ
        const finalSizeKB = Math.round(compressedBase64.length * 0.75 / 1024);
        log('Compressed size:', finalSizeKB, 'KB');

        // GASにアップロード
        const result = await apiRequest('uploadTopImage', {
            base64: compressedBase64,
            fileName: file.name.replace(/\.[^.]+$/, '.jpg')  // 拡張子を.jpgに
        });

        showLoading(false);

        if (result && result.success) {
            showToast('画像を設定しました');
            await loadTopImage();
        } else {
            const errorMsg = result?.error || 'アップロードに失敗しました';
            logError('Upload failed:', errorMsg);
            showToast('アップロードに失敗しました');
        }

    } catch (error) {
        showLoading(false);
        logError('Image upload error:', error);
        showToast('画像の処理に失敗しました');
    }

    // inputをリセット（同じファイルを再選択できるように）
    event.target.value = '';
}

/**
 * トップ画像を削除
 */
async function deleteTopImage() {
    if (!confirm('トップ画像を削除しますか？')) return;

    showLoading(true);
    const result = await apiRequest('deleteTopImage');
    showLoading(false);

    if (result && result.success) {
        showToast('画像を削除しました');
        await loadTopImage();
    } else {
        showToast('削除に失敗しました');
    }
}

/**
 * ファイルをBase64に変換
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * 画像を圧縮してアップロード用に最適化
 *
 * @param {string} base64 - 元画像のBase64
 * @param {object} options - 圧縮オプション
 * @returns {Promise<string>} 圧縮後のBase64
 *
 * iPhone Safari 特有の注意点：
 * - HEIC形式はブラウザが自動でJPEG変換
 * - Canvasのメモリ制限があるため、先にリサイズしてからCanvas処理
 * - iOS 13以降はEXIF orientationを自動補正
 */
async function compressImageForUpload(base64, options = {}) {
    const {
        maxWidth = 1280,
        maxHeight = 1280,
        targetSizeKB = 900,
        minQuality = 0.5
    } = options;

    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            try {
                // 1. リサイズ比率を計算
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                log('Resize:', img.width, 'x', img.height, '->', width, 'x', height);

                // 2. Canvasに描画
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                // 背景を白に（透過PNGの場合の対策）
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // 3. 品質を調整しながら圧縮
                let quality = 0.8;
                let result = canvas.toDataURL('image/jpeg', quality);
                let sizeKB = estimateBase64SizeKB(result);

                log('Initial compression: quality=', quality, 'size=', sizeKB, 'KB');

                // 目標サイズを超えている場合、品質を下げて再圧縮
                while (sizeKB > targetSizeKB && quality > minQuality) {
                    quality -= 0.1;
                    result = canvas.toDataURL('image/jpeg', quality);
                    sizeKB = estimateBase64SizeKB(result);
                    log('Re-compress: quality=', quality.toFixed(1), 'size=', sizeKB, 'KB');
                }

                // 最終的なサイズが大きすぎる場合は警告（ただし続行）
                if (sizeKB > 1500) {
                    log('Warning: Final size is', sizeKB, 'KB, may fail to upload');
                }

                resolve(result);

            } catch (error) {
                reject(error);
            }
        };

        img.onerror = () => {
            reject(new Error('Failed to load image'));
        };

        img.src = base64;
    });
}

/**
 * Base64文字列のおおよそのサイズ（KB）を計算
 * Base64は約33%のオーバーヘッドがあるため、実際のバイト数は文字数×0.75
 */
function estimateBase64SizeKB(base64) {
    // "data:image/jpeg;base64," のプレフィックスを除く
    const dataIndex = base64.indexOf(',');
    const data = dataIndex >= 0 ? base64.substring(dataIndex + 1) : base64;
    return Math.round(data.length * 0.75 / 1024);
}

/**
 * バイト数を読みやすい形式にフォーマット
 */
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
