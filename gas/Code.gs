/**
 * ============================================
 * 家族ポータル - Google Apps Script API（修正版）
 *
 * 【重要】このファイルをGASに貼り付ける前に、
 * 下記の SPREADSHEET_ID を必ず設定してください！
 *
 * スプレッドシートIDの確認方法：
 * スプレッドシートのURL
 * https://docs.google.com/spreadsheets/d/【このIDをコピー】/edit
 * ============================================
 */

// ★★★ 必須：スプレッドシートIDをここに設定 ★★★
const SPREADSHEET_ID = '1-sl5xav52aE0fnesv9_zSPSBx0b_6l__9ZGXnUkI5qY';

/**
 * スプレッドシートを取得
 * WebアプリではgetActiveSpreadsheet()は動作しないため、
 * 必ずIDで指定する
 */
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * 初期セットアップ：シートを作成
 * ★ GASエディタで最初に1回だけ実行してください
 */
function setupSheets() {
  const ss = getSpreadsheet();

  // メモシート
  let memoSheet = ss.getSheetByName('Memos');
  if (!memoSheet) {
    memoSheet = ss.insertSheet('Memos');
    memoSheet.appendRow(['id', 'content', 'pinned', 'deleted', 'createdAt', 'updatedAt']);
    memoSheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    memoSheet.setFrozenRows(1);
  }

  // やりたいことシート
  let wishSheet = ss.getSheetByName('Wishes');
  if (!wishSheet) {
    wishSheet = ss.insertSheet('Wishes');
    wishSheet.appendRow(['id', 'title', 'year', 'status', 'comment', 'deleted', 'createdAt', 'updatedAt']);
    wishSheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    wishSheet.setFrozenRows(1);
  }

  // 買い物リストシート
  let shoppingSheet = ss.getSheetByName('Shopping');
  if (!shoppingSheet) {
    shoppingSheet = ss.insertSheet('Shopping');
    shoppingSheet.appendRow(['id', 'name', 'completed', 'deleted', 'createdAt', 'updatedAt']);
    shoppingSheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    shoppingSheet.setFrozenRows(1);
  }

  Logger.log('セットアップ完了！シートを確認してください。');
}

/**
 * GETリクエストを処理（データ取得用）
 * フロントエンドからはGETでアクセス
 */
function doGet(e) {
  return handleRequest(e);
}

/**
 * POSTリクエストを処理（データ書き込み用）
 * GASはCORSプリフライトに対応していないため、
 * フロントエンドではGETを推奨
 */
function doPost(e) {
  return handleRequest(e);
}

/**
 * リクエストを統一処理
 */
function handleRequest(e) {
  try {
    const action = e.parameter.action || '';

    // データはクエリパラメータから取得（GETでもPOSTでも対応）
    let data = {};

    // パラメータからデータを取得
    if (e.parameter.data) {
      try {
        data = JSON.parse(e.parameter.data);
      } catch (parseError) {
        return createResponse({ success: false, error: 'Invalid JSON in data parameter' });
      }
    }

    // POSTの場合はpostDataからも試みる
    if (e.postData && e.postData.contents) {
      try {
        const postBody = JSON.parse(e.postData.contents);
        data = { ...data, ...postBody };
      } catch (parseError) {
        // postDataのパースに失敗してもパラメータがあればOK
      }
    }

    let result;

    switch (action) {
      // === メモ ===
      case 'getMemos':
        result = getMemos();
        break;
      case 'addMemo':
        result = addMemo(data);
        break;
      case 'updateMemo':
        result = updateMemo(data);
        break;

      // === やりたいこと ===
      case 'getWishes':
        result = getWishes();
        break;
      case 'addWish':
        result = addWish(data);
        break;
      case 'updateWish':
        result = updateWish(data);
        break;

      // === 買い物リスト ===
      case 'getShopping':
        result = getShopping();
        break;
      case 'addShopping':
        result = addShopping(data);
        break;
      case 'updateShopping':
        result = updateShopping(data);
        break;

      // === テスト用 ===
      case 'ping':
        result = { success: true, message: 'pong', timestamp: new Date().toISOString() };
        break;

      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return createResponse(result);

  } catch (error) {
    return createResponse({
      success: false,
      error: error.toString(),
      stack: error.stack
    });
  }
}

/**
 * JSONレスポンスを作成
 * CORSヘッダーはGASが自動で付与
 */
function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================
   メモ関連
============================================ */

function getMemos() {
  const sheet = getSpreadsheet().getSheetByName('Memos');
  if (!sheet) {
    return { success: false, error: 'Memos sheet not found. Run setupSheets() first.' };
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, data: [] };
  }

  const headers = data[0];
  const memos = data.slice(1).map(row => {
    const memo = {};
    headers.forEach((header, index) => {
      // boolean値の変換
      if (header === 'pinned' || header === 'deleted') {
        memo[header] = row[index] === true || row[index] === 'true';
      } else {
        memo[header] = row[index];
      }
    });
    return memo;
  });

  return { success: true, data: memos };
}

function addMemo(memo) {
  if (!memo || !memo.id || !memo.content) {
    return { success: false, error: 'Invalid memo data' };
  }

  const sheet = getSpreadsheet().getSheetByName('Memos');
  if (!sheet) {
    return { success: false, error: 'Memos sheet not found' };
  }

  sheet.appendRow([
    memo.id,
    memo.content,
    memo.pinned === true || memo.pinned === 'true',
    memo.deleted === true || memo.deleted === 'true',
    memo.createdAt || new Date().toISOString(),
    memo.updatedAt || new Date().toISOString()
  ]);

  return { success: true, id: memo.id };
}

function updateMemo(memo) {
  if (!memo || !memo.id) {
    return { success: false, error: 'Invalid memo data' };
  }

  const sheet = getSpreadsheet().getSheetByName('Memos');
  if (!sheet) {
    return { success: false, error: 'Memos sheet not found' };
  }

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === memo.id) {
      sheet.getRange(i + 1, 1, 1, 6).setValues([[
        memo.id,
        memo.content,
        memo.pinned === true || memo.pinned === 'true',
        memo.deleted === true || memo.deleted === 'true',
        memo.createdAt,
        memo.updatedAt || new Date().toISOString()
      ]]);
      return { success: true };
    }
  }

  return { success: false, error: 'Memo not found: ' + memo.id };
}

/* ============================================
   やりたいこと関連
============================================ */

function getWishes() {
  const sheet = getSpreadsheet().getSheetByName('Wishes');
  if (!sheet) {
    return { success: false, error: 'Wishes sheet not found. Run setupSheets() first.' };
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, data: [] };
  }

  const headers = data[0];
  const wishes = data.slice(1).map(row => {
    const wish = {};
    headers.forEach((header, index) => {
      if (header === 'deleted') {
        wish[header] = row[index] === true || row[index] === 'true';
      } else if (header === 'year') {
        wish[header] = Number(row[index]);
      } else {
        wish[header] = row[index];
      }
    });
    return wish;
  });

  return { success: true, data: wishes };
}

function addWish(wish) {
  if (!wish || !wish.id || !wish.title) {
    return { success: false, error: 'Invalid wish data' };
  }

  const sheet = getSpreadsheet().getSheetByName('Wishes');
  if (!sheet) {
    return { success: false, error: 'Wishes sheet not found' };
  }

  sheet.appendRow([
    wish.id,
    wish.title,
    Number(wish.year) || new Date().getFullYear(),
    wish.status || 'not_started',
    wish.comment || '',
    wish.deleted === true || wish.deleted === 'true',
    wish.createdAt || new Date().toISOString(),
    wish.updatedAt || new Date().toISOString()
  ]);

  return { success: true, id: wish.id };
}

function updateWish(wish) {
  if (!wish || !wish.id) {
    return { success: false, error: 'Invalid wish data' };
  }

  const sheet = getSpreadsheet().getSheetByName('Wishes');
  if (!sheet) {
    return { success: false, error: 'Wishes sheet not found' };
  }

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === wish.id) {
      sheet.getRange(i + 1, 1, 1, 8).setValues([[
        wish.id,
        wish.title,
        Number(wish.year),
        wish.status,
        wish.comment || '',
        wish.deleted === true || wish.deleted === 'true',
        wish.createdAt,
        wish.updatedAt || new Date().toISOString()
      ]]);
      return { success: true };
    }
  }

  return { success: false, error: 'Wish not found: ' + wish.id };
}

/* ============================================
   買い物リスト関連
============================================ */

function getShopping() {
  const sheet = getSpreadsheet().getSheetByName('Shopping');
  if (!sheet) {
    return { success: false, error: 'Shopping sheet not found. Run setupSheets() first.' };
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, data: [] };
  }

  const headers = data[0];
  const items = data.slice(1).map(row => {
    const item = {};
    headers.forEach((header, index) => {
      if (header === 'completed' || header === 'deleted') {
        item[header] = row[index] === true || row[index] === 'true';
      } else {
        item[header] = row[index];
      }
    });
    return item;
  });

  return { success: true, data: items };
}

function addShopping(item) {
  if (!item || !item.id || !item.name) {
    return { success: false, error: 'Invalid shopping item data' };
  }

  const sheet = getSpreadsheet().getSheetByName('Shopping');
  if (!sheet) {
    return { success: false, error: 'Shopping sheet not found' };
  }

  sheet.appendRow([
    item.id,
    item.name,
    item.completed === true || item.completed === 'true',
    item.deleted === true || item.deleted === 'true',
    item.createdAt || new Date().toISOString(),
    item.updatedAt || new Date().toISOString()
  ]);

  return { success: true, id: item.id };
}

function updateShopping(item) {
  if (!item || !item.id) {
    return { success: false, error: 'Invalid shopping item data' };
  }

  const sheet = getSpreadsheet().getSheetByName('Shopping');
  if (!sheet) {
    return { success: false, error: 'Shopping sheet not found' };
  }

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === item.id) {
      sheet.getRange(i + 1, 1, 1, 6).setValues([[
        item.id,
        item.name,
        item.completed === true || item.completed === 'true',
        item.deleted === true || item.deleted === 'true',
        item.createdAt,
        item.updatedAt || new Date().toISOString()
      ]]);
      return { success: true };
    }
  }

  return { success: false, error: 'Shopping item not found: ' + item.id };
}

/* ============================================
   デバッグ・テスト用
============================================ */

/**
 * テスト実行（GASエディタから実行して確認）
 */
function testAPI() {
  // 接続テスト
  Logger.log('=== 接続テスト ===');
  Logger.log('Spreadsheet ID: ' + SPREADSHEET_ID);

  try {
    const ss = getSpreadsheet();
    Logger.log('Spreadsheet Name: ' + ss.getName());
    Logger.log('Sheets: ' + ss.getSheets().map(s => s.getName()).join(', '));
  } catch (e) {
    Logger.log('ERROR: ' + e.toString());
    return;
  }

  // データ取得テスト
  Logger.log('\n=== データ取得テスト ===');
  Logger.log('Memos: ' + JSON.stringify(getMemos()));
  Logger.log('Wishes: ' + JSON.stringify(getWishes()));
  Logger.log('Shopping: ' + JSON.stringify(getShopping()));
}

/**
 * サンプルデータを追加（テスト用）
 */
function addTestData() {
  // メモを追加
  addMemo({
    id: 'test_memo_1',
    content: 'テストメモです',
    pinned: false,
    deleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // やりたいことを追加
  addWish({
    id: 'test_wish_1',
    title: 'テストやりたいこと',
    year: new Date().getFullYear(),
    status: 'not_started',
    comment: '',
    deleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // 買い物を追加
  addShopping({
    id: 'test_shopping_1',
    name: 'テスト商品',
    completed: false,
    deleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  Logger.log('テストデータを追加しました');
}
