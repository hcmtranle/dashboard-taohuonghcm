/**
 * ============================================================
 * DASHBOARD APP SCRIPT
 * Trường Tiểu học Nguyễn An Khương - Lê Thành Tạo
 * ============================================================
 *
 * CÁCH DEPLOY:
 * 1. Mở https://script.google.com
 * 2. Tạo project mới → dán code này vào
 * 3. Deploy → New deployment → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy URL → dán vào dashboard.config.json hoặc cài đặt trong dashboard
 *
 * CÁCH GỌI TỪ DASHBOARD:
 * GET {URL}?action=prices&tickers=VNM,VCB,FPT
 * GET {URL}?action=tasks
 * GET {URL}?action=push_price&ticker=VNM&price=68.5
 * ============================================================
 */

// ─── CẤU HÌNH ─────────────────────────────────────────────
const SHEET_ID = '';  // Để trống để tự tạo sheet mới, hoặc điền ID Sheet có sẵn
const SHEET_NAME_PRICES = 'GIA_CO_PHIEU';
const SHEET_NAME_TASKS  = 'NHAC_NHO';
const SHEET_NAME_LOG    = 'LOG';

// Cổ phiếu mặc định cần theo dõi
const DEFAULT_TICKERS = ['VNM', 'VCB', 'FPT', 'VRE'];

// ─── ENTRY POINT ──────────────────────────────────────────
function doGet(e) {
  const action = (e?.parameter?.action || 'prices').toLowerCase();
  let result;

  try {
    if (action === 'prices') {
      const tickers = (e?.parameter?.tickers || DEFAULT_TICKERS.join(',')).split(',');
      result = getPrices(tickers);
    } else if (action === 'tasks') {
      result = getTasks();
    } else if (action === 'push_price') {
      const ticker = e?.parameter?.ticker;
      const price  = parseFloat(e?.parameter?.price || '0');
      result = pushPriceToSheet(ticker, price);
    } else if (action === 'status') {
      result = { status: 'ok', time: new Date().toISOString() };
    } else {
      result = { error: 'Unknown action: ' + action };
    }
  } catch(err) {
    result = { error: err.toString(), stack: err.stack };
    logError(err);
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── LẤY GIÁ CỔ PHIẾU TỪ TCBS ───────────────────────────
function getPrices(tickers) {
  const results = {};

  tickers.forEach(function(ticker) {
    ticker = ticker.trim().toUpperCase();
    if (!ticker) return;
    try {
      const price = fetchPriceFromTCBS(ticker);
      results[ticker] = price;

      // Ghi vào Sheet để lưu lịch sử
      if (price && price.price) {
        pushPriceToSheet(ticker, price.price);
      }
    } catch(e) {
      results[ticker] = { error: e.toString(), ticker: ticker };
    }
  });

  return results;
}

// ─── GỌI API TCBS ─────────────────────────────────────────
function fetchPriceFromTCBS(ticker) {
  // TCBS public API - không cần xác thực
  const url = 'https://apipubaws.tcbs.com.vn/stock-insight/v2/stock/' + ticker + '/price-history?page=0&size=1&headIndex=-1';

  try {
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();

    if (code !== 200) {
      // Fallback: thử endpoint khác
      return fetchPriceFromTCBSv1(ticker);
    }

    const text = response.getContentText();
    const data = JSON.parse(text);

    if (data && data.data && data.data.length > 0) {
      const latest = data.data[0];
      return {
        ticker:    ticker,
        price:     latest.close || latest.price || 0,
        open:      latest.open  || 0,
        high:      latest.high  || 0,
        low:       latest.low   || 0,
        volume:    latest.volume || 0,
        change:    latest.change || 0,
        changePct: latest.changePercent || 0,
        time:      new Date().toISOString(),
        source:    'TCBS'
      };
    }
    return fetchPriceFromTCBSv1(ticker);

  } catch(e) {
    return fetchPriceFromTCBSv1(ticker);
  }
}

// ─── FALLBACK API TCBS V1 ─────────────────────────────────
function fetchPriceFromTCBSv1(ticker) {
  // Thử endpoint khác của TCBS
  const url = 'https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/bars-long-term?ticker=' + ticker + '&type=stock&resolution=D&from=' + Math.floor((Date.now() - 86400000*2)/1000) + '&to=' + Math.floor(Date.now()/1000);

  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(response.getContentText());

    if (data && data.data && data.data.length > 0) {
      const latest = data.data[data.data.length - 1];
      return {
        ticker:    ticker,
        price:     latest.close || 0,
        open:      latest.open  || 0,
        high:      latest.high  || 0,
        low:       latest.low   || 0,
        volume:    latest.volume || 0,
        change:    (latest.close - latest.open) || 0,
        changePct: latest.open ? ((latest.close - latest.open) / latest.open * 100) : 0,
        time:      new Date().toISOString(),
        source:    'TCBS_v1'
      };
    }
  } catch(e) {
    // ignore
  }

  // Cuối cùng fallback về Google Finance
  return fetchPriceFromGoogleFinance(ticker);
}

// ─── FALLBACK GOOGLE FINANCE ──────────────────────────────
function fetchPriceFromGoogleFinance(ticker) {
  try {
    // Dùng Google Sheets GOOGLEFINANCE qua SpreadsheetApp
    const ss = SpreadsheetApp.create('_temp_price_' + ticker);
    const sheet = ss.getActiveSheet();
    sheet.getRange('A1').setFormula('=GOOGLEFINANCE("' + ticker + '","price")');
    SpreadsheetApp.flush();
    Utilities.sleep(2000);
    const price = sheet.getRange('A1').getValue();
    DriveApp.getFileById(ss.getId()).setTrashed(true); // Xóa file tạm
    return {
      ticker: ticker,
      price:  typeof price === 'number' ? price : 0,
      change: 0,
      source: 'GoogleFinance'
    };
  } catch(e) {
    return { ticker: ticker, price: 0, error: 'Không lấy được giá', source: 'error' };
  }
}

// ─── GHI GIÁ VÀO SHEET ───────────────────────────────────
function pushPriceToSheet(ticker, price) {
  try {
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_PRICES);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME_PRICES);
      // Header
      sheet.getRange(1, 1, 1, 6).setValues([['Ngày giờ', 'Mã CP', 'Giá', 'Thay đổi', 'Nguồn', 'Ghi chú']]);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
    }

    const lastRow = Math.max(sheet.getLastRow(), 1);
    sheet.getRange(lastRow + 1, 1, 1, 5).setValues([[
      new Date(), ticker, price, '', 'AppScript'
    ]]);

    return { success: true, ticker, price, row: lastRow + 1 };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── LẤY NHẮC NHỞ TỪ SHEET ───────────────────────────────
function getTasks() {
  try {
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_TASKS);

    if (!sheet) {
      // Tạo sheet mẫu
      sheet = ss.insertSheet(SHEET_NAME_TASKS);
      const headers = ['Tiêu đề', 'Hạn chót', 'Xong', 'Ưu tiên', 'Ghi chú'];
      sheet.getRange(1, 1, 1, 5).setValues([headers]).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
      // Thêm dữ liệu mẫu
      const today = new Date();
      const demo = [
        ['Họp tổ chuyên môn', new Date(today.getTime()), true,  'Cao', ''],
        ['Nộp kế hoạch bài dạy tuần 3', new Date(today.getTime() + 2*86400000), false, 'Cao', ''],
        ['Kiểm tra nội bộ - GV Nguyễn Thị B', new Date(today.getTime() + 4*86400000), false, 'Bình thường', ''],
        ['Đăng video YouTube kênh giáo dục', new Date(today.getTime() + 5*86400000), false, 'Bình thường', '']
      ];
      sheet.getRange(2, 1, demo.length, 5).setValues(demo);
    }

    const data = sheet.getDataRange().getValues();
    const tasks = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      const due = row[1] ? Utilities.formatDate(new Date(row[1]), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy') : '';
      const isDone = row[2] === true || row[2] === 'TRUE' || row[2] === '✓';
      const priority = row[3] || 'Bình thường';
      tasks.push({
        title:    row[0],
        due:      (priority === 'Cao' ? '⚠️ ' : '📅 ') + due,
        done:     isDone,
        priority: priority,
        note:     row[4] || ''
      });
    }

    return { tasks, count: tasks.length, updated: new Date().toISOString() };

  } catch(e) {
    return { tasks: [], error: e.toString() };
  }
}

// ─── HELPER: Lấy hoặc tạo Spreadsheet ────────────────────
function getOrCreateSheet() {
  if (SHEET_ID && SHEET_ID.length > 10) {
    return SpreadsheetApp.openById(SHEET_ID);
  }

  // Tìm sheet đã tạo trước
  const files = DriveApp.getFilesByName('Dashboard NAK - Dữ liệu');
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }

  // Tạo mới
  const ss = SpreadsheetApp.create('Dashboard NAK - Dữ liệu');
  Logger.log('Đã tạo Sheet mới: ' + ss.getUrl());
  return ss;
}

// ─── LOG LỖI ─────────────────────────────────────────────
function logError(err) {
  try {
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_LOG) || ss.insertSheet(SHEET_NAME_LOG);
    sheet.appendRow([new Date(), err.toString()]);
  } catch(e) { /* ignore */ }
}

// ─── TEST FUNCTION (chạy thủ công để kiểm tra) ───────────
function test_getPrices() {
  const result = getPrices(['VNM', 'VCB', 'FPT']);
  Logger.log(JSON.stringify(result, null, 2));
}

function test_getTasks() {
  const result = getTasks();
  Logger.log(JSON.stringify(result, null, 2));
}
