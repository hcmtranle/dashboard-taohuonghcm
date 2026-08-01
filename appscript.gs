/**
 * ============================================================
 * DASHBOARD APP SCRIPT — taohuonghcm
 * Cô Trần Thị Thu Hương & Thầy Lê Thành Tạo
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
 * GET {URL}?action=prices&tickers=VNM,VCB,FPT       (kèm changeDay/changeWeek/changeMonth)
 * GET {URL}?action=tasks
 * GET {URL}?action=gmail&max=8
 * GET {URL}?action=push_price&ticker=VNM&price=68.5
 * ============================================================
 */

// ─── CẤU HÌNH ─────────────────────────────────────────────
const SHEET_ID = ''; // Để trống để tự tạo sheet mới, hoặc điền ID Sheet có sẵn
const SHEET_NAME_PRICES = 'GIA_CO_PHIEU';
const SHEET_NAME_TASKS = 'NHAC_NHO';
const SHEET_NAME_LOG = 'LOG';

// Cổ phiếu mặc định cần theo dõi
const DEFAULT_TICKERS = ['VNM', 'VCB', 'FPT', 'VRE'];

// Toàn bộ mã cổ phiếu dashboard đang theo dõi (dùng cho tự động cập nhật)
const ALL_TICKERS = ['VNM','VCB','FPT','VRE','ACB','MBB','SHB','VPB','VIX','HCM','SSI'];

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
    } else if (action === 'gmail') {
      const max = parseInt(e?.parameter?.max || '8', 10);
      result = getGmailSummary(max);
    } else if (action === 'push_price') {
      const ticker = e?.parameter?.ticker;
      const price = parseFloat(e?.parameter?.price || '0');
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

// ─── LẤY GIÁ CỔ PHIẾU (giá hiện tại + % thay đổi ngày/tuần/tháng) ─
function getPrices(tickers) {
  const results = {};

  tickers.forEach(function(ticker) {
    ticker = ticker.trim().toUpperCase();
    if (!ticker) return;
    try {
      const price = fetchPriceFromCafefWithHistory(ticker);
      results[ticker] = price || fetchPriceFromTCBS(ticker);

      if (results[ticker] && results[ticker].price) {
        pushPriceToSheet(ticker, results[ticker].price);
      }
    } catch(e) {
      results[ticker] = { error: e.toString(), ticker: ticker };
    }
  });

  return results;
}

// ─── CAFEF: giá hiện tại + lịch sử để tính % thay đổi ngày/tuần/tháng ─
function fetchPriceFromCafefWithHistory(ticker) {
  // Lấy 30 phiên gần nhất - đủ để tính thay đổi theo ngày (1 phiên),
  // tuần (5 phiên) và tháng (~21 phiên giao dịch)
  const url = 'https://cafef.vn/du-lieu/ajax/pagenew/datahistory/pricehistory.ashx?Symbol=' + ticker + '&StartDate=&EndDate=&PageIndex=1&PageSize=30';

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) return null;

    const data = JSON.parse(response.getContentText());
    const rows = data && data.Success && data.Data && data.Data.Data;

    if (!rows || rows.length === 0) return null;

    // rows[0] = phiên mới nhất
    const latest = rows[0];
    const close = latest.GiaDongCua || 0;
    const open = latest.GiaMoCua || 0;
    if (!close) return null;

    const at = function(idx) {
      const r = rows[Math.min(idx, rows.length - 1)];
      return r ? (r.GiaDongCua || 0) : 0;
    };
    const pctChange = function(fromClose) {
      if (!fromClose) return 0;
      return (close - fromClose) / fromClose * 100;
    };

    const weekAgo = at(5);
    const monthAgo = at(21);

    return {
      ticker: ticker,
      price: close,
      open: open,
      high: latest.GiaCaoNhat || 0,
      low: latest.GiaThapNhat || 0,
      volume: latest.KhoiLuongKhopLenh || 0,
      change: close - open,
      changePct: open ? ((close - open) / open * 100) : 0,
      changeDay: rows.length > 1 ? close - at(1) : (close - open),
      changeDayPct: rows.length > 1 ? pctChange(at(1)) : (open ? ((close - open) / open * 100) : 0),
      changeWeek: close - weekAgo,
      changeWeekPct: pctChange(weekAgo),
      changeMonth: close - monthAgo,
      changeMonthPct: pctChange(monthAgo),
      time: new Date().toISOString(),
      source: 'CafeF'
    };
  } catch(e) {
    return null;
  }
}

// ─── GỌI API TCBS (dự phòng nếu CafeF lỗi) ────────────────────
function fetchPriceFromTCBS(ticker) {
  const url = 'https://apipubaws.tcbs.com.vn/stock-insight/v2/stock/' + ticker + '/price-history?page=0&size=1&headIndex=-1';

  try {
    const options = {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json' },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) return fetchPriceFromGoogleFinance(ticker);

    const data = JSON.parse(response.getContentText());
    if (data && data.data && data.data.length > 0) {
      const latest = data.data[0];
      return {
        ticker: ticker,
        price: latest.close || latest.price || 0,
        open: latest.open || 0,
        high: latest.high || 0,
        low: latest.low || 0,
        volume: latest.volume || 0,
        change: latest.change || 0,
        changePct: latest.changePercent || 0,
        changeDay: latest.change || 0,
        changeDayPct: latest.changePercent || 0,
        changeWeek: 0, changeWeekPct: 0, changeMonth: 0, changeMonthPct: 0,
        time: new Date().toISOString(),
        source: 'TCBS'
      };
    }
    return fetchPriceFromGoogleFinance(ticker);
  } catch(e) {
    return fetchPriceFromGoogleFinance(ticker);
  }
}

// ─── FALLBACK GOOGLE FINANCE ──────────────────────────────
function fetchPriceFromGoogleFinance(ticker) {
  try {
    const ss = SpreadsheetApp.create('_temp_price_' + ticker);
    const sheet = ss.getActiveSheet();
    sheet.getRange('A1').setFormula('=GOOGLEFINANCE("' + ticker + '","price")');
    SpreadsheetApp.flush();
    Utilities.sleep(2000);
    const price = sheet.getRange('A1').getValue();
    DriveApp.getFileById(ss.getId()).setTrashed(true);
    return {
      ticker: ticker,
      price: typeof price === 'number' ? price : 0,
      change: 0, changePct: 0, changeDay: 0, changeDayPct: 0, changeWeek: 0, changeWeekPct: 0, changeMonth: 0, changeMonthPct: 0,
      source: 'GoogleFinance'
    };
  } catch(e) {
    return { ticker: ticker, price: 0, error: 'Không lấy được giá', source: 'error' };
  }
}

// ─── GMAIL: tóm tắt hộp thư đến ───────────────────────────
function getGmailSummary(max) {
  try {
    max = max && max > 0 ? Math.min(max, 20) : 8;
    const threads = GmailApp.getInboxThreads(0, max);
    const emails = threads.map(function(t) {
      const msgs = t.getMessages();
      const last = msgs[msgs.length - 1];
      let starred = false;
      try { starred = last.isStarred(); } catch(e) { starred = false; }
      return {
        id: last.getId(),
        from: last.getFrom(),
        subject: t.getFirstMessageSubject(),
        date: Utilities.formatDate(last.getDate(), 'Asia/Ho_Chi_Minh', 'HH:mm dd/MM'),
        unread: t.isUnread(),
        starred: starred
      };
    });
    const unreadCount = GmailApp.getInboxUnreadCount();
    return { emails: emails, unreadCount: unreadCount, updated: new Date().toISOString() };
  } catch(e) {
    return { error: e.toString() };
  }
}

// ─── GHI GIÁ VÀO SHEET ───────────────────────────────────
function pushPriceToSheet(ticker, price) {
  try {
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_PRICES);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME_PRICES);
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
      sheet = ss.insertSheet(SHEET_NAME_TASKS);
      const headers = ['Tiêu đề', 'Hạn chót', 'Xong', 'Ưu tiên', 'Ghi chú'];
      sheet.getRange(1, 1, 1, 5).setValues([headers]).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
      const today = new Date();
      const demo = [
        ['Họp tổ chuyên môn', new Date(today.getTime()), true, 'Cao', ''],
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
        title: row[0],
        due: (priority === 'Cao' ? '⚠️ ' : '📅 ') + due,
        done: isDone,
        priority: priority,
        note: row[4] || ''
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

  const files = DriveApp.getFilesByName('Dashboard NAK - Dữ liệu');
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }

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

// ─── TỰ ĐỘNG CẬP NHẬT (chạy nền, không cần mở dashboard) ──
// Hàm này được gọi định kỳ bởi Trigger thời gian (xem createAutoUpdateTrigger).
// Mỗi lần chạy: lấy giá toàn bộ mã CP + ghi log vào Sheet GIA_CO_PHIEU,
// để widget "Thay đổi theo tuần/tháng" luôn có đủ dữ liệu lịch sử.
function autoUpdateAll() {
  try {
    getPrices(ALL_TICKERS);
    Logger.log('Auto update xong lúc ' + new Date().toISOString());
  } catch(e) {
    logError(e);
  }
}

// Chạy hàm này 1 LẦN trong trình soạn thảo để bật tự động cập nhật
// (tạo Trigger thời gian chạy mỗi 30 phút). Chạy lại an toàn - sẽ
// tự xoá trigger cũ trùng tên trước khi tạo mới.
function createAutoUpdateTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'autoUpdateAll') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoUpdateAll')
    .timeBased()
    .everyMinutes(30)
    .create();
  Logger.log('Đã bật tự động cập nhật giá mỗi 30 phút.');
}

// ─── TEST FUNCTION (chạy thủ công để kiểm tra + cấp quyền) ───
function test_getPrices() {
  const result = getPrices(['VNM', 'VCB', 'FPT']);
  Logger.log(JSON.stringify(result, null, 2));
}

function test_getTasks() {
  const result = getTasks();
  Logger.log(JSON.stringify(result, null, 2));
}

function test_getGmail() {
  const result = getGmailSummary(5);
  Logger.log(JSON.stringify(result, null, 2));
}
