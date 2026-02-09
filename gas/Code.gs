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
    shoppingSheet.appendRow(['id', 'name', 'completed', 'deleted', 'category', 'createdAt', 'updatedAt']);
    shoppingSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    shoppingSheet.setFrozenRows(1);
  }

  // 設定シート（トップ画像のfileIdなどを保存）
  let settingsSheet = ss.getSheetByName('Settings');
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet('Settings');
    settingsSheet.appendRow(['key', 'value', 'updatedAt']);
    settingsSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    settingsSheet.setFrozenRows(1);
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

    // リクエスト情報をログ（デバッグ用）
    Logger.log('=== Request ===');
    Logger.log('Action: ' + action);
    Logger.log('Method: ' + (e.postData ? 'POST' : 'GET'));

    // データはクエリパラメータから取得（GETでもPOSTでも対応）
    let data = {};

    // パラメータからデータを取得（GETリクエスト用）
    if (e.parameter.data) {
      try {
        data = JSON.parse(e.parameter.data);
        Logger.log('Data from parameter: ' + e.parameter.data.substring(0, 100) + '...');
      } catch (parseError) {
        Logger.log('Parameter parse error: ' + parseError);
        return createResponse({ success: false, error: 'Invalid JSON in data parameter' });
      }
    }

    // POSTの場合はpostDataから取得（画像アップロード用）
    if (e.postData && e.postData.contents) {
      try {
        Logger.log('POST data size: ' + e.postData.contents.length + ' bytes');
        Logger.log('POST data type: ' + e.postData.type);
        const postBody = JSON.parse(e.postData.contents);
        data = { ...data, ...postBody };
        Logger.log('POST data parsed successfully');
      } catch (parseError) {
        Logger.log('POST parse error: ' + parseError);
        // 画像アップロードの場合はエラーを返す
        if (action === 'uploadTopImage') {
          return createResponse({ success: false, error: 'Failed to parse POST data: ' + parseError });
        }
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

      // === トップ画像 ===
      case 'uploadTopImage':
        result = uploadTopImage(data);
        break;
      case 'getTopImage':
        result = getTopImage();
        break;
      case 'deleteTopImage':
        result = deleteTopImage();
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
    item.category || 'soon',
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
      sheet.getRange(i + 1, 1, 1, 7).setValues([[
        item.id,
        item.name,
        item.completed === true || item.completed === 'true',
        item.deleted === true || item.deleted === 'true',
        item.category || 'soon',
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

/* ============================================
   トップ画像関連

   画像は Google Drive に保存し、fileId のみを
   スプレッドシートに記録する。
   画像取得時は GAS がプロキシとして機能し、
   Base64 形式で返却する。

   ★ Google Drive 上の画像は「限定公開」のまま。
   ★ GAS経由でしかアクセスできないため安全。
============================================ */

/**
 * トップ画像をアップロード
 * @param {object} data - { base64: 'data:image/...', fileName: 'image.jpg' }
 * @returns {object} { success: true, fileId: '...' }
 *
 * フロントエンドで1MB以下に圧縮済みの画像を受け取る想定。
 * Base64のオーバーヘッド（約33%）を考慮し、URLパラメータ制限内に収まる。
 */
function uploadTopImage(data) {
  if (!data || !data.base64) {
    return { success: false, error: 'No image data provided' };
  }

  try {
    // 受信データサイズをログ（デバッグ用）
    const receivedSizeKB = Math.round(data.base64.length / 1024);
    Logger.log('Received image data: ' + receivedSizeKB + ' KB');

    // Base64データをデコード
    // フォーマット: "data:image/jpeg;base64,/9j/4AAQ..."
    const matches = data.base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return { success: false, error: 'Invalid base64 format' };
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    // デコード後のサイズをログ
    const decodedBytes = Utilities.base64Decode(base64Data);
    const fileSizeKB = Math.round(decodedBytes.length / 1024);
    Logger.log('Decoded image size: ' + fileSizeKB + ' KB, type: ' + mimeType);

    const blob = Utilities.newBlob(
      decodedBytes,
      mimeType,
      data.fileName || 'top_image.jpg'
    );

    // 既存の画像があれば削除
    const oldFileId = getSettingValue('topImageFileId');
    if (oldFileId) {
      try {
        DriveApp.getFileById(oldFileId).setTrashed(true);
      } catch (e) {
        // 古いファイルが見つからなくても続行
        Logger.log('Old file not found: ' + oldFileId);
      }
    }

    // Google Driveに保存（マイドライブ直下）
    // ★ ファイルは「限定公開」（デフォルト）のまま
    const file = DriveApp.createFile(blob);
    const fileId = file.getId();

    // fileIdをスプレッドシートに保存
    setSettingValue('topImageFileId', fileId);

    return { success: true, fileId: fileId };

  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * トップ画像を取得
 * @returns {object} { success: true, base64: 'data:image/...', hasImage: true }
 */
function getTopImage() {
  try {
    const fileId = getSettingValue('topImageFileId');

    if (!fileId) {
      return { success: true, hasImage: false };
    }

    // Google Driveから画像を取得
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const mimeType = blob.getContentType();
    const base64Data = Utilities.base64Encode(blob.getBytes());

    return {
      success: true,
      hasImage: true,
      base64: 'data:' + mimeType + ';base64,' + base64Data,
      fileName: file.getName()
    };

  } catch (error) {
    // ファイルが見つからない場合
    if (error.toString().includes('not found') || error.toString().includes('does not exist')) {
      // 無効なfileIdをクリア
      setSettingValue('topImageFileId', '');
      return { success: true, hasImage: false };
    }
    return { success: false, error: error.toString() };
  }
}

/**
 * トップ画像を削除
 * @returns {object} { success: true }
 */
function deleteTopImage() {
  try {
    const fileId = getSettingValue('topImageFileId');

    if (fileId) {
      try {
        DriveApp.getFileById(fileId).setTrashed(true);
      } catch (e) {
        // ファイルが見つからなくても続行
      }
    }

    // 設定をクリア
    setSettingValue('topImageFileId', '');

    return { success: true };

  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/* ============================================
   設定値の読み書き（Settingsシート）
============================================ */

/**
 * 設定値を取得
 * @param {string} key - 設定キー
 * @returns {string} 設定値（なければ空文字）
 */
function getSettingValue(key) {
  const sheet = getSpreadsheet().getSheetByName('Settings');
  if (!sheet) return '';

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      return data[i][1] || '';
    }
  }
  return '';
}

/**
 * 設定値を保存
 * @param {string} key - 設定キー
 * @param {string} value - 設定値
 */
function setSettingValue(key, value) {
  const sheet = getSpreadsheet().getSheetByName('Settings');
  if (!sheet) {
    // Settingsシートがなければ作成
    const ss = getSpreadsheet();
    const newSheet = ss.insertSheet('Settings');
    newSheet.appendRow(['key', 'value', 'updatedAt']);
    newSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    newSheet.setFrozenRows(1);
    newSheet.appendRow([key, value, new Date().toISOString()]);
    return;
  }

  const data = sheet.getDataRange().getValues();

  // 既存のキーを探す
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[value, new Date().toISOString()]]);
      return;
    }
  }

  // 新規追加
  sheet.appendRow([key, value, new Date().toISOString()]);
}

/**
 * 画像アップロードのテスト（GASエディタから実行）
 */
function testImageUpload() {
  // 現在のトップ画像を確認
  const result = getTopImage();
  Logger.log('Current top image: ' + JSON.stringify(result));
}
