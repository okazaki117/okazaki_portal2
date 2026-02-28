/**
 * ============================================
 * 家族ポータル - メインアプリケーション v2.5.4
 *
 * v2.2 修正点：
 * - ローカルキャッシュ導入（体感速度改善）
 * - 楽観的UI更新（操作の即時反映）
 * - バックグラウンドでのデータ同期
 *
 * v2.1 修正点：
 * - ローカルストレージのフォールバックを削除
 * - GETリクエストでCORS問題を回避
 * - 全端末でスプレッドシートのみを参照
 * - 詳細なエラーログ出力
 * - 画像アップロードはPOSTを使用
 * ============================================
 */

/* ============================================
   設定
============================================ */
const IS_LOCALHOST = typeof location !== 'undefined'
    && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

const CONFIG = {
    // API URL は設定画面またはlocalStorageから読み込み
    API_URL: '',

    // localStorageキー
    STORAGE_KEY_API_URL: 'portal_api_url',
    CACHE_KEY_MEMOS: 'portal_cache_memos',
    CACHE_KEY_WISHES: 'portal_cache_wishes',
    CACHE_KEY_SHOPPING: 'portal_cache_shopping',
    CACHE_KEY_SUBSCRIPTIONS: 'portal_cache_subscriptions',
    CACHE_KEY_TOP_IMAGE: 'portal_cache_top_image',

    // デバッグモード
    DEBUG: IS_LOCALHOST
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
    subscriptions: [],
    wishFilter: 'all',
    shoppingFilter: 'soon',
    subscriptionFilter: 'active',
    editingSubscriptionId: null,
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

    // ヘッダー初期表示
    updateHeader(state.currentPage);

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

/**
 * 配列からIDの重複を排除する（最初の要素を優先）
 */
function deduplicateById(arr) {
    if (!Array.isArray(arr)) return arr;
    const seen = new Set();
    return arr.filter(item => {
        if (!item || !item.id) return true;
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
    });
}

/* ============================================
   キャッシュ管理

   ・前回取得したデータをlocalStorageに保存
   ・画面表示時はキャッシュを即座に表示
   ・バックグラウンドでAPIから最新を取得
   ・差分があればUIを更新
============================================ */

/**
 * キャッシュを保存
 * @param {string} key - キャッシュキー
 * @param {any} data - 保存するデータ
 */
function saveCache(key, data) {
    try {
        const cacheData = {
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cacheData));
        log('Cache saved:', key);
    } catch (e) {
        logError('Cache save failed:', e);
    }
}

/**
 * キャッシュを読み込み
 * @param {string} key - キャッシュキー
 * @returns {any|null} キャッシュデータ（なければnull）
 */
function loadCache(key) {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const cacheData = JSON.parse(cached);
        log('Cache loaded:', key, 'age:', Math.round((Date.now() - cacheData.timestamp) / 1000), 'sec');
        return cacheData.data;
    } catch (e) {
        logError('Cache load failed:', e);
        return null;
    }
}

/**
 * キャッシュをクリア
 */
function clearCache() {
    localStorage.removeItem(CONFIG.CACHE_KEY_MEMOS);
    localStorage.removeItem(CONFIG.CACHE_KEY_WISHES);
    localStorage.removeItem(CONFIG.CACHE_KEY_SHOPPING);
    localStorage.removeItem(CONFIG.CACHE_KEY_SUBSCRIPTIONS);
    localStorage.removeItem(CONFIG.CACHE_KEY_TOP_IMAGE);
    log('Cache cleared');
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
            log('★ Using POST for image upload (base64 length:', data.base64.length, ')');
            return await apiRequestPost(action, data);
        }

        // 通常のリクエストはGETで送信
        log('Using GET for action:', action);
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

    log('★★★ POST REQUEST ★★★');
    log('POST URL:', url.toString());
    log('POST data size:', Math.round(JSON.stringify(data).length / 1024), 'KB');
    log('POST method: POST (not GET)');

    const response = await fetch(url.toString(), {
        method: 'POST',
        // text/plain を使用することで CORS プリフライトを回避
        headers: {
            'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: JSON.stringify(data)
    });

    log('POST response received, status:', response.status);
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
        subscriptions: 'サブスクリスト',
        settings: '設定'
    };

    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[pageName] || '家族ポータル';

    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.classList.toggle('hidden', pageName === 'portal');
    }

    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.classList.toggle('hidden', pageName !== 'portal');
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
        case 'subscriptions':
            await loadSubscriptions();
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

    // 1. キャッシュがあれば即座に表示
    const cached = loadCache(CONFIG.CACHE_KEY_MEMOS);
    if (cached) {
        state.memos = cached;
        const pinned = state.memos.filter(m => m.pinned && !m.deleted);
        renderPinnedMemos(pinned);
    }

    // 2. バックグラウンドでAPIから取得
    const result = await apiRequest('getMemos');
    if (result && result.data) {
        state.memos = result.data;
        saveCache(CONFIG.CACHE_KEY_MEMOS, result.data);
        const pinned = state.memos.filter(m => m.pinned && !m.deleted);
        renderPinnedMemos(pinned);
    } else if (!cached) {
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

    // 1. キャッシュがあれば即座に表示（ローディングなし）
    const cached = loadCache(CONFIG.CACHE_KEY_MEMOS);
    if (cached) {
        state.memos = cached;
        renderMemos();
    } else {
        showLoading(true);
    }

    // 2. APIから最新を取得
    const result = await apiRequest('getMemos');
    showLoading(false);

    if (result && result.data) {
        state.memos = deduplicateById(result.data);
        saveCache(CONFIG.CACHE_KEY_MEMOS, state.memos);
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

    // 楽観的UI更新：即座にUIに反映
    state.memos.unshift(newMemo);
    renderMemos();
    saveCache(CONFIG.CACHE_KEY_MEMOS, state.memos);

    // 入力欄をクリア
    if (input) input.value = '';
    if (pinCheck) pinCheck.checked = false;

    // バックグラウンドでAPIに保存
    const result = await apiRequest('addMemo', newMemo);

    if (result) {
        showToast('メモを追加しました');
    } else {
        // 失敗したらロールバック
        state.memos = state.memos.filter(m => m.id !== newMemo.id);
        renderMemos();
        saveCache(CONFIG.CACHE_KEY_MEMOS, state.memos);
        showToast('追加に失敗しました');
    }
}

async function toggleMemoPin(id) {
    const memo = state.memos.find(m => m.id === id);
    if (!memo) return;

    const wasPinned = memo.pinned;
    memo.pinned = !memo.pinned;
    memo.updatedAt = new Date().toISOString();

    // 楽観的UI更新
    renderMemos();
    saveCache(CONFIG.CACHE_KEY_MEMOS, state.memos);

    // バックグラウンドでAPI更新
    const result = await apiRequest('updateMemo', memo);

    if (result) {
        showToast(memo.pinned ? 'ピン留めしました' : 'ピン留めを解除しました');
    } else {
        // 失敗したらロールバック
        memo.pinned = wasPinned;
        renderMemos();
        saveCache(CONFIG.CACHE_KEY_MEMOS, state.memos);
    }
}

async function deleteMemo(id) {
    if (!confirm('このメモを削除しますか？')) return;

    const memo = state.memos.find(m => m.id === id);
    if (!memo) return;

    memo.deleted = true;
    memo.updatedAt = new Date().toISOString();

    // 楽観的UI更新
    renderMemos();
    saveCache(CONFIG.CACHE_KEY_MEMOS, state.memos);
    showToast('削除しました');

    // バックグラウンドでAPI更新
    const result = await apiRequest('updateMemo', memo);

    if (!result) {
        // 失敗したらロールバック
        memo.deleted = false;
        renderMemos();
        saveCache(CONFIG.CACHE_KEY_MEMOS, state.memos);
        showToast('削除に失敗しました');
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

    // 1. キャッシュがあれば即座に表示
    const cached = loadCache(CONFIG.CACHE_KEY_WISHES);
    if (cached) {
        state.wishes = cached;
        renderWishes();
    } else {
        showLoading(true);
    }

    // 2. APIから最新を取得
    const result = await apiRequest('getWishes');
    showLoading(false);

    if (result && result.data) {
        state.wishes = deduplicateById(result.data);
        saveCache(CONFIG.CACHE_KEY_WISHES, state.wishes);
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

    // 楽観的UI更新
    state.wishes.unshift(newWish);
    renderWishes();
    saveCache(CONFIG.CACHE_KEY_WISHES, state.wishes);
    if (input) input.value = '';

    // バックグラウンドでAPI保存
    const result = await apiRequest('addWish', newWish);

    if (result) {
        showToast('追加しました');
    } else {
        // 失敗したらロールバック
        state.wishes = state.wishes.filter(w => w.id !== newWish.id);
        renderWishes();
        saveCache(CONFIG.CACHE_KEY_WISHES, state.wishes);
        showToast('追加に失敗しました');
    }
}

async function updateWishStatus(id, status) {
    const wish = state.wishes.find(w => w.id === id);
    if (!wish) return;

    const oldStatus = wish.status;
    wish.status = status;
    wish.updatedAt = new Date().toISOString();

    // 楽観的UI更新
    renderWishes();
    saveCache(CONFIG.CACHE_KEY_WISHES, state.wishes);

    // バックグラウンドでAPI更新
    const result = await apiRequest('updateWish', wish);

    if (!result) {
        // 失敗したらロールバック
        wish.status = oldStatus;
        renderWishes();
        saveCache(CONFIG.CACHE_KEY_WISHES, state.wishes);
    }
}

async function editWishComment(id) {
    const wish = state.wishes.find(w => w.id === id);
    if (!wish) return;

    const comment = prompt('コメントを入力:', wish.comment || '');
    if (comment === null) return;

    const oldComment = wish.comment;
    wish.comment = comment;
    wish.updatedAt = new Date().toISOString();

    // 楽観的UI更新
    renderWishes();
    saveCache(CONFIG.CACHE_KEY_WISHES, state.wishes);

    // バックグラウンドでAPI更新
    const result = await apiRequest('updateWish', wish);

    if (!result) {
        // 失敗したらロールバック
        wish.comment = oldComment;
        renderWishes();
        saveCache(CONFIG.CACHE_KEY_WISHES, state.wishes);
    }
}

async function deleteWish(id) {
    if (!confirm('削除しますか？')) return;

    const wish = state.wishes.find(w => w.id === id);
    if (!wish) return;

    wish.deleted = true;
    wish.updatedAt = new Date().toISOString();

    // 楽観的UI更新
    renderWishes();
    saveCache(CONFIG.CACHE_KEY_WISHES, state.wishes);
    showToast('削除しました');

    // バックグラウンドでAPI更新
    const result = await apiRequest('updateWish', wish);

    if (!result) {
        // 失敗したらロールバック
        wish.deleted = false;
        renderWishes();
        saveCache(CONFIG.CACHE_KEY_WISHES, state.wishes);
        showToast('削除に失敗しました');
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

    // 1. キャッシュがあれば即座に表示
    const cached = loadCache(CONFIG.CACHE_KEY_SHOPPING);
    if (cached) {
        state.shopping = cached;
        renderShopping();
    } else {
        showLoading(true);
    }

    // 2. APIから最新を取得
    const result = await apiRequest('getShopping');
    showLoading(false);

    if (result && result.data) {
        state.shopping = deduplicateById(result.data);
        saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);
        renderShopping();
    }
}

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
        let moveBtn = '';
        if (filter === 'soon') {
            moveBtn = `<button class="action-btn move-btn" onclick="moveShoppingCategory('${item.id}', 'later')">あとで</button>`;
        } else if (filter === 'later') {
            moveBtn = `<button class="action-btn move-btn" onclick="moveShoppingCategory('${item.id}', 'soon')">すぐ</button>`;
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

async function addShoppingItem() {
    const input = document.getElementById('shopping-input');
    const rawValue = input?.value.trim();

    if (!rawValue) {
        showToast('アイテム名を入力してください');
        return;
    }

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

    // 楽観的UI更新
    state.shopping.unshift(...newItems);
    renderShopping();
    saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);
    if (input) input.value = '';

    // バックグラウンドでAPI保存
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
        // 失敗したらロールバック
        const failedIds = new Set(newItems.map(i => i.id));
        state.shopping = state.shopping.filter(i => !failedIds.has(i.id));
        renderShopping();
        saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);
        showToast('追加に失敗しました');
    }
}

async function toggleShoppingItem(id) {
    const item = state.shopping.find(i => i.id === id);
    if (!item) return;

    const wasCompleted = item.completed;
    item.completed = !item.completed;
    item.updatedAt = new Date().toISOString();

    // 楽観的UI更新
    renderShopping();
    saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);

    // バックグラウンドでAPI更新
    const result = await apiRequest('updateShopping', item);

    if (!result) {
        // 失敗したらロールバック
        item.completed = wasCompleted;
        renderShopping();
        saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);
    }
}

async function deleteShoppingItem(id) {
    const item = state.shopping.find(i => i.id === id);
    if (!item) return;

    item.deleted = true;
    item.updatedAt = new Date().toISOString();

    // 楽観的UI更新
    renderShopping();
    saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);
    showToast('削除しました');

    // バックグラウンドでAPI更新
    const result = await apiRequest('updateShopping', item);

    if (!result) {
        // 失敗したらロールバック
        item.deleted = false;
        renderShopping();
        saveCache(CONFIG.CACHE_KEY_SHOPPING, state.shopping);
        showToast('削除に失敗しました');
    }
}

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

/* ============================================
   サブスクリスト
============================================ */

async function loadSubscriptions() {
    if (!CONFIG.API_URL) {
        state.subscriptions = [];
        renderSubscriptions();
        showToast('API URLを設定してください');
        return;
    }

    const cached = loadCache(CONFIG.CACHE_KEY_SUBSCRIPTIONS);
    if (cached) {
        state.subscriptions = cached;
        renderSubscriptions();
    } else {
        showLoading(true);
    }

    const result = await apiRequest('getSubscriptions');
    showLoading(false);

    if (result && result.data) {
        state.subscriptions = deduplicateById(result.data);
        saveCache(CONFIG.CACHE_KEY_SUBSCRIPTIONS, state.subscriptions);
        renderSubscriptions();
    } else if (!cached) {
        renderSubscriptions();
    }
}

function renderSubscriptions() {
    const listEl = document.getElementById('subscription-list');
    const monthlyEl = document.getElementById('subscription-monthly-total');
    const yearlyEl = document.getElementById('subscription-yearly-total');

    if (!listEl || !monthlyEl || !yearlyEl) return;

    const activeItems = state.subscriptions.filter(s => !s.deleted && s.status === 'active');
    let monthlySum = 0;
    let yearlySum = 0;
    activeItems.forEach(s => {
        const price = Number(s.price) || 0;
        if (s.billingCycle === 'yearly') {
            yearlySum += price;
            monthlySum += Math.floor(price / 12);
        } else if (s.billingCycle === 'semi-annual') {
            yearlySum += price * 2;
            monthlySum += Math.floor(price / 6);
        } else if (s.billingCycle === 'quarterly') {
            yearlySum += price * 4;
            monthlySum += Math.floor(price / 3);
        } else {
            monthlySum += price;
            yearlySum += price * 12;
        }
    });

    const monthlyTotal = monthlySum;
    const yearlyTotal = yearlySum;

    monthlyEl.textContent = `¥${monthlyTotal.toLocaleString()}`;
    yearlyEl.textContent = `¥${yearlyTotal.toLocaleString()}`;

    if (!CONFIG.API_URL) {
        listEl.innerHTML = '<p class="empty-message">設定画面でAPI URLを入力してください</p>';
        return;
    }

    const filter = state.subscriptionFilter;
    let filtered = state.subscriptions.filter(s => !s.deleted && s.status === filter);
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (filtered.length === 0) {
        const message = filter === 'active' ? '利用中のサブスクはありません' : '解約済みのサブスクはありません';
        listEl.innerHTML = `<p class="empty-message">${message}</p>`;
        return;
    }

    listEl.innerHTML = filtered.map(item => {
        const cycleLabels = { monthly: '月額', quarterly: '3か月', 'semi-annual': '半年', yearly: '年額' };
        const cycleLabel = cycleLabels[item.billingCycle] || '月額';
        const renewalText = item.renewalTiming ? ` ・ ${escapeHtml(item.renewalTiming)}` : '';
        const accountText = item.account ? ` ・ ${escapeHtml(item.account)}` : '';
        const priceNum = Number(item.price || 0);
        const priceText = `¥${priceNum.toLocaleString()}`;

        let monthlyEquivalentText = '';
        if (item.billingCycle === 'yearly') {
            monthlyEquivalentText = `<span class="subscription-price-monthly">（月額 約¥${Math.floor(priceNum / 12).toLocaleString()}）</span>`;
        } else if (item.billingCycle === 'semi-annual') {
            monthlyEquivalentText = `<span class="subscription-price-monthly">（月額 約¥${Math.floor(priceNum / 6).toLocaleString()}）</span>`;
        } else if (item.billingCycle === 'quarterly') {
            monthlyEquivalentText = `<span class="subscription-price-monthly">（月額 約¥${Math.floor(priceNum / 3).toLocaleString()}）</span>`;
        }

        const statusBtn = filter === 'active'
            ? `<button class="action-btn cancel-btn" onclick="toggleSubscriptionStatus('${item.id}')">解約</button>`
            : `<button class="action-btn resume-btn" onclick="toggleSubscriptionStatus('${item.id}')">再開</button>`;

        return `
            <div class="subscription-item ${item.status === 'cancelled' ? 'cancelled' : ''}" data-id="${item.id}">
                <div class="subscription-header">
                    <span class="subscription-name">${escapeHtml(item.name)}</span>
                    <div class="subscription-price-wrapper">
                        <span class="subscription-price">${priceText}</span>
                        ${monthlyEquivalentText}
                    </div>
                </div>
                <div class="subscription-meta"><span class="cycle-badge cycle-${item.billingCycle || 'monthly'}">${cycleLabel}</span>${renewalText}${accountText}</div>
                <div class="subscription-actions">
                    <button class="action-btn" onclick="openSubscriptionModal('${item.id}')">編集</button>
                    ${statusBtn}
                    <button class="action-btn delete-btn" onclick="deleteSubscription('${item.id}')">×</button>
                </div>
            </div>
        `;
    }).join('');
}

function openSubscriptionModal(id = null) {
    const modal = document.getElementById('subscription-modal');
    const title = document.getElementById('subscription-modal-title');
    const nameInput = document.getElementById('subscription-name');
    const priceInput = document.getElementById('subscription-price');
    const billingSelect = document.getElementById('subscription-billing');
    const renewalInput = document.getElementById('subscription-renewal');
    const accountInput = document.getElementById('subscription-account');
    const saveBtn = document.getElementById('subscription-save-btn');

    if (!modal || !title || !nameInput || !priceInput || !billingSelect || !renewalInput || !accountInput || !saveBtn) return;

    const subscription = id ? state.subscriptions.find(s => s.id === id) : null;
    state.editingSubscriptionId = subscription ? subscription.id : null;

    if (subscription) {
        title.textContent = 'サブスクを編集';
        saveBtn.textContent = '保存';
        nameInput.value = subscription.name || '';
        priceInput.value = subscription.price !== undefined ? String(subscription.price) : '';
        billingSelect.value = subscription.billingCycle || 'monthly';
        renewalInput.value = subscription.renewalTiming || '';
        accountInput.value = subscription.account || '';
    } else {
        title.textContent = 'サブスクを追加';
        saveBtn.textContent = '追加';
        nameInput.value = '';
        priceInput.value = '';
        billingSelect.value = 'monthly';
        renewalInput.value = '';
        accountInput.value = '';
    }

    modal.classList.remove('hidden');
}

function closeSubscriptionModal() {
    const modal = document.getElementById('subscription-modal');
    if (modal) modal.classList.add('hidden');
    state.editingSubscriptionId = null;
}

async function saveSubscription() {
    const nameInput = document.getElementById('subscription-name');
    const priceInput = document.getElementById('subscription-price');
    const billingSelect = document.getElementById('subscription-billing');
    const renewalInput = document.getElementById('subscription-renewal');
    const accountInput = document.getElementById('subscription-account');

    if (!nameInput || !priceInput || !billingSelect || !renewalInput || !accountInput) return;

    const name = nameInput.value.trim();
    const priceValue = Number(priceInput.value);
    const billingCycle = billingSelect.value;
    const renewalTiming = renewalInput.value.trim();
    const account = accountInput.value.trim();

    if (!name) {
        showToast('サービス名を入力してください');
        return;
    }

    if (!Number.isFinite(priceValue) || priceValue <= 0) {
        showToast('金額を正しく入力してください');
        return;
    }

    const now = new Date().toISOString();
    const editingId = state.editingSubscriptionId;

    if (!editingId) {
        const newItem = {
            id: generateId(),
            name: name,
            price: priceValue,
            billingCycle: billingCycle,
            renewalTiming: renewalTiming,
            account: account,
            status: 'active',
            deleted: false,
            createdAt: now,
            updatedAt: now
        };

        state.subscriptions.unshift(newItem);
        renderSubscriptions();
        saveCache(CONFIG.CACHE_KEY_SUBSCRIPTIONS, state.subscriptions);
        closeSubscriptionModal();

        const result = await apiRequest('addSubscription', newItem);
        if (result) {
            showToast('追加しました');
        } else {
            state.subscriptions = state.subscriptions.filter(s => s.id !== newItem.id);
            renderSubscriptions();
            saveCache(CONFIG.CACHE_KEY_SUBSCRIPTIONS, state.subscriptions);
            showToast('追加に失敗しました');
        }
        return;
    }

    const target = state.subscriptions.find(s => s.id === editingId);
    if (!target) return;

    const backup = { ...target };
    target.name = name;
    target.price = priceValue;
    target.billingCycle = billingCycle;
    target.renewalTiming = renewalTiming;
    target.account = account;
    target.updatedAt = now;

    renderSubscriptions();
    saveCache(CONFIG.CACHE_KEY_SUBSCRIPTIONS, state.subscriptions);
    closeSubscriptionModal();

    const result = await apiRequest('updateSubscription', target);
    if (result) {
        showToast('保存しました');
    } else {
        Object.assign(target, backup);
        renderSubscriptions();
        saveCache(CONFIG.CACHE_KEY_SUBSCRIPTIONS, state.subscriptions);
        showToast('保存に失敗しました');
    }
}

async function toggleSubscriptionStatus(id) {
    const item = state.subscriptions.find(s => s.id === id);
    if (!item) return;

    const wasStatus = item.status;
    item.status = item.status === 'active' ? 'cancelled' : 'active';
    item.updatedAt = new Date().toISOString();

    renderSubscriptions();
    saveCache(CONFIG.CACHE_KEY_SUBSCRIPTIONS, state.subscriptions);

    const result = await apiRequest('updateSubscription', item);
    if (!result) {
        item.status = wasStatus;
        renderSubscriptions();
        saveCache(CONFIG.CACHE_KEY_SUBSCRIPTIONS, state.subscriptions);
        showToast('更新に失敗しました');
    }
}

async function deleteSubscription(id) {
    const item = state.subscriptions.find(s => s.id === id);
    if (!item) return;

    if (!confirm('このサブスクを削除しますか？')) return;

    item.deleted = true;
    item.updatedAt = new Date().toISOString();

    renderSubscriptions();
    saveCache(CONFIG.CACHE_KEY_SUBSCRIPTIONS, state.subscriptions);
    showToast('削除しました');

    const result = await apiRequest('updateSubscription', item);
    if (!result) {
        item.deleted = false;
        renderSubscriptions();
        saveCache(CONFIG.CACHE_KEY_SUBSCRIPTIONS, state.subscriptions);
        showToast('削除に失敗しました');
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

/**
 * キャッシュのみクリア（API URLは保持）
 */
function clearDataCache() {
    clearCache();
    state.memos = [];
    state.wishes = [];
    state.shopping = [];
    state.subscriptions = [];
    showToast('キャッシュをクリアしました。画面を更新します...');

    // 少し待ってからポータルに戻ってデータを再取得
    setTimeout(() => {
        navigateTo('portal');
    }, 500);
}

/**
 * すべての設定をクリア（API URL含む）
 */
function clearAllSettings() {
    if (!confirm('API URLを含むすべての設定をクリアしますか？\n（スプレッドシートのデータは消えません）')) return;

    localStorage.removeItem(CONFIG.STORAGE_KEY_API_URL);
    clearCache();
    CONFIG.API_URL = '';
    state.memos = [];
    state.wishes = [];
    state.shopping = [];
    state.subscriptions = [];

    loadSettings();
    showToast('すべての設定をクリアしました');
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

    // 設定ボタン（ヘッダー）
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => navigateTo('settings'));
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
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                addShoppingItem();
            }
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

    // サブスクリスト：フィルター
    document.querySelectorAll('#page-subscriptions .filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#page-subscriptions .filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.subscriptionFilter = tab.dataset.filter;
            renderSubscriptions();
        });
    });

    // サブスクリスト：追加
    const subscriptionAddBtn = document.getElementById('subscription-add-btn');
    if (subscriptionAddBtn) {
        subscriptionAddBtn.addEventListener('click', () => openSubscriptionModal());
    }

    // サブスクリスト：モーダル操作
    const subscriptionCancelBtn = document.getElementById('subscription-cancel-btn');
    if (subscriptionCancelBtn) {
        subscriptionCancelBtn.addEventListener('click', closeSubscriptionModal);
    }

    const subscriptionSaveBtn = document.getElementById('subscription-save-btn');
    if (subscriptionSaveBtn) {
        subscriptionSaveBtn.addEventListener('click', saveSubscription);
    }

    const subscriptionForm = document.getElementById('subscription-form');
    if (subscriptionForm) {
        subscriptionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveSubscription();
        });
    }

    const subscriptionModal = document.getElementById('subscription-modal');
    if (subscriptionModal) {
        subscriptionModal.addEventListener('click', (e) => {
            if (e.target === subscriptionModal) closeSubscriptionModal();
        });
    }

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

    // 設定：キャッシュのみクリア
    const clearDataCacheBtn = document.getElementById('clear-data-cache');
    if (clearDataCacheBtn) {
        clearDataCacheBtn.addEventListener('click', clearDataCache);
    }

    // 設定：トップ画像削除
    const deleteTopImageSettingsBtn = document.getElementById('delete-top-image-settings');
    if (deleteTopImageSettingsBtn) {
        deleteTopImageSettingsBtn.addEventListener('click', deleteTopImage);
    }

    // 設定：すべてクリア
    const clearAllSettingsBtn = document.getElementById('clear-all-settings');
    if (clearAllSettingsBtn) {
        clearAllSettingsBtn.addEventListener('click', clearAllSettings);
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

    if (!container || !imageEl) return;

    // API URL未設定時
    if (!CONFIG.API_URL) {
        if (placeholder) placeholder.classList.remove('hidden');
        imageEl.classList.add('hidden');
        return;
    }

    // 1. キャッシュがあれば即座に表示
    const cached = loadCache(CONFIG.CACHE_KEY_TOP_IMAGE);
    if (cached && cached.hasImage && cached.base64) {
        imageEl.src = cached.base64;
        imageEl.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
        log('Top image loaded from cache');
    } else {
        // キャッシュなし：ローディング表示
        container.classList.add('loading');
    }

    // 2. バックグラウンドでAPIから取得
    try {
        const result = await apiRequest('getTopImage');

        container.classList.remove('loading');

        if (result && result.hasImage && result.base64) {
            // 画像を表示
            imageEl.src = result.base64;
            imageEl.classList.remove('hidden');
            if (placeholder) placeholder.classList.add('hidden');
            saveCache(CONFIG.CACHE_KEY_TOP_IMAGE, { hasImage: true, base64: result.base64 });
            log('Top image loaded from API');
        } else {
            // 画像なし
            imageEl.classList.add('hidden');
            if (placeholder) placeholder.classList.remove('hidden');
            saveCache(CONFIG.CACHE_KEY_TOP_IMAGE, { hasImage: false });
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
