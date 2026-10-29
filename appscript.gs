/**
 * ============================================================
 * DASHBOARD APP SCRIPT — taohuonghcm
 * Thầy Lê Thành Tạo
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
 * GET {URL}?action=content                            (nội dung tin tức từ Drive)
 * ============================================================
 */

// ─── CẤU HÌNH ─────────────────────────────────────────────
const SHEET_ID = ''; // Để trống để tự tạo sheet mới, hoặc điền ID Sheet có sẵn
const SHEET_NAME_PRICES = 'GIA_CO_PHIEU';
const SHEET_NAME_TASKS = 'NHAC_NHO';
const SHEET_NAME_LOG = 'LOG';
const SHEET_NAME_STOCKLIST = 'DANH_MUC_CP';
const SHEET_NAME_PROJECTS = 'DU_AN';
const SHEET_NAME_SPACES = 'SPACES';
const SHEET_NAME_KHO = 'KHO_DU_LIEU';

// Cổ phiếu mặc định cần theo dõi
const DEFAULT_TICKERS = ['VNM', 'VCB', 'FPT', 'VRE'];

// Toàn bộ mã cổ phiếu dashboard đang theo dõi (dùng cho tự động cập nhật)
const ALL_TICKERS = ['VNM','VCB','FPT','VRE','ACB','MBB','SHB','VPB','VIX','HCM','SSI'];

// ─── BẢO MẬT: token bắt buộc CHỈ cho action Định vị/Thêm module (mới) ──
// Các action cũ (prices/tasks/projects/kho-items/space-items/drive-search...)
// GIỮ NGUYÊN không cần token — vì dashboard-taohuonghcm.vercel.app và
// dashboard-tong-hop là REPO CÔNG KHAI, gắn token vào code của chúng sẽ làm
// lộ token (ai đọc source cũng lấy được) và phá luôn mục đích bảo vệ. Hai
// action Định vị/Thêm module là MỚI, chỉ yourfriend-ai dùng, nên khoá được
// triệt để: token giữ phía server (Vercel env var), gọi qua proxy /api/nak,
// KHÔNG BAO GIỜ xuất hiện trong code client của yourfriend-ai.
// → Nhiệm vụ/Dự án/Kho dữ liệu trên yourfriend-ai vẫn được giấu sau màn hình
//   đăng nhập ở tầng giao diện, nhưng về bản chất backend vẫn mở như trước
//   (rủi ro đã có từ lâu, không phải do thay đổi hôm nay) — chỉ hết hẳn khi
//   dashboard-taohuonghcm.vercel.app (app cũ) được nghỉ hẳn.
const NAK_API_SECRET = 'XEM_APPS_SCRIPT_EDITOR_HOAC_VERCEL_ENV_KHONG_COMMIT_GIA_TRI_THAT';
const NAK_TOKEN_REQUIRED_ACTIONS = new Set([
  'location-items', 'location-search', 'add-location-item', 'update-location-item', 'remove-location-item',
  'modules', 'add-module', 'update-module', 'remove-module',
  'links', 'add-link', 'update-link', 'remove-link',
  'watchlist-items', 'add-watchlist-item', 'update-watchlist-item', 'remove-watchlist-item',
  'journal-list', 'add-journal', 'update-journal', 'remove-journal',
  'habits-list', 'add-habit', 'remove-habit', 'toggle-habit-today',
  'bills-list', 'add-bill', 'update-bill', 'remove-bill', 'mark-bill-paid',
  'people-list', 'add-person', 'update-person', 'remove-person',
  'tarot-log-list', 'add-tarot-log', 'remove-tarot-log',
]);
function isAuthorizedNak_(token) {
  return Boolean(token && String(token) === NAK_API_SECRET);
}

// ─── ENTRY POINT ──────────────────────────────────────────
function doGet(e) {
  const action = (e?.parameter?.action || 'prices').toLowerCase();
  let result;

  if (NAK_TOKEN_REQUIRED_ACTIONS.has(action) && !isAuthorizedNak_(e?.parameter?.token)) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Không được phép truy cập.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (action === 'prices') {
      const tickers = (e?.parameter?.tickers || DEFAULT_TICKERS.join(',')).split(',');
      result = getPrices(tickers);
    } else if (action === 'tasks') {
      result = getTasks();
    } else if (action === 'gmail') {
      const max = parseInt(e?.parameter?.max || '8', 10);
      result = getGmailSummary(max);
  } else if (action === 'sheet-tasks') {
  result = getSheetTasks_();
    } else if (action === 'push_price') {
      const ticker = e?.parameter?.ticker;
      const price = parseFloat(e?.parameter?.price || '0');
      result = pushPriceToSheet(ticker, price);
    } else if (action === 'content') {
      result = getContentFromDrive();
    } else if (action === 'stocklist') {
      result = getStockList_();
    } else if (action === 'add-stock') {
      result = addStock_(e?.parameter?.ticker, e?.parameter?.name);
    } else if (action === 'remove-stock') {
      result = removeStock_(e?.parameter?.ticker);
    } else if (action === 'add-task') {
      result = addTask_(e?.parameter || {});
    } else if (action === 'toggle-task') {
      result = toggleTask_(e?.parameter?.row, e?.parameter?.done);
    } else if (action === 'remove-task') {
      result = removeTask_(e?.parameter?.row);
    } else if (action === 'projects') {
      result = getProjects_();
    } else if (action === 'add-project') {
      result = addProject_(e?.parameter?.name, e?.parameter?.deploy, e?.parameter?.edit);
    } else if (action === 'update-project') {
      result = updateProject_(e?.parameter?.id, e?.parameter?.name, e?.parameter?.deploy, e?.parameter?.edit);
    } else if (action === 'remove-project') {
      result = removeProject_(e?.parameter?.id);
    } else if (action === 'space-items') {
      result = getSpaceItems_(e?.parameter?.space);
    } else if (action === 'add-space-item') {
      result = addSpaceItem_(e?.parameter?.space, e?.parameter?.name, e?.parameter?.desc, e?.parameter?.deploy, e?.parameter?.edit);
    } else if (action === 'update-space-item') {
      result = updateSpaceItem_(e?.parameter?.space, e?.parameter?.id, e?.parameter?.name, e?.parameter?.desc, e?.parameter?.deploy, e?.parameter?.edit);
    } else if (action === 'remove-space-item') {
      result = removeSpaceItem_(e?.parameter?.space, e?.parameter?.id);
    } else if (action === 'kho-items') {
      result = getKhoItems_();
    } else if (action === 'add-kho-item') {
      result = addKhoItem_(e?.parameter?.icon, e?.parameter?.name, e?.parameter?.desc, e?.parameter?.url);
    } else if (action === 'update-kho-item') {
      result = updateKhoItem_(e?.parameter?.id, e?.parameter?.icon, e?.parameter?.name, e?.parameter?.desc, e?.parameter?.url);
    } else if (action === 'remove-kho-item') {
      result = removeKhoItem_(e?.parameter?.id);
    } else if (action === 'drive-search') {
      result = driveSearch_(e?.parameter?.query, e?.parameter?.folderId);
    } else if (action === 'location-items') {
      result = getLocationItems_();
    } else if (action === 'location-search') {
      result = searchLocationItems_(e?.parameter?.query);
    } else if (action === 'add-location-item') {
      result = addLocationItem_(e?.parameter?.name, e?.parameter?.category, e?.parameter?.location, e?.parameter?.note, e?.parameter?.imageUrl);
    } else if (action === 'update-location-item') {
      result = updateLocationItem_(e?.parameter?.id, e?.parameter?.name, e?.parameter?.category, e?.parameter?.location, e?.parameter?.note, e?.parameter?.imageUrl);
    } else if (action === 'remove-location-item') {
      result = removeLocationItem_(e?.parameter?.id);
    } else if (action === 'modules') {
      result = getModules_();
    } else if (action === 'add-module') {
      result = addModule_(e?.parameter?.name, e?.parameter?.icon, e?.parameter?.type, e?.parameter?.config, e?.parameter?.order);
    } else if (action === 'update-module') {
      result = updateModule_(e?.parameter?.id, e?.parameter?.name, e?.parameter?.icon, e?.parameter?.type, e?.parameter?.config, e?.parameter?.order);
    } else if (action === 'remove-module') {
      result = removeModule_(e?.parameter?.id);
    } else if (action === 'links') {
      result = getLinks_();
    } else if (action === 'add-link') {
      result = addLink_(e?.parameter?.name, e?.parameter?.type, e?.parameter?.url, e?.parameter?.project, e?.parameter?.note);
    } else if (action === 'update-link') {
      result = updateLink_(e?.parameter?.id, e?.parameter?.name, e?.parameter?.type, e?.parameter?.url, e?.parameter?.project, e?.parameter?.note);
    } else if (action === 'remove-link') {
      result = removeLink_(e?.parameter?.id);
    } else if (action === 'watchlist-items') {
      result = getWatchlistItems_();
    } else if (action === 'add-watchlist-item') {
      result = addWatchlistItem_(e?.parameter?.symbol, e?.parameter?.buyDate, e?.parameter?.quantity, e?.parameter?.buyPrice, e?.parameter?.note);
    } else if (action === 'update-watchlist-item') {
      result = updateWatchlistItem_(e?.parameter?.id, e?.parameter?.symbol, e?.parameter?.buyDate, e?.parameter?.quantity, e?.parameter?.buyPrice, e?.parameter?.note);
    } else if (action === 'remove-watchlist-item') {
      result = removeWatchlistItem_(e?.parameter?.id);
    } else if (action === 'journal-list') {
      result = getJournalEntries_();
    } else if (action === 'add-journal') {
      result = addJournalEntry_(e?.parameter?.ngay, e?.parameter?.noiDung, e?.parameter?.tamTrang);
    } else if (action === 'update-journal') {
      result = updateJournalEntry_(e?.parameter?.id, e?.parameter?.ngay, e?.parameter?.noiDung, e?.parameter?.tamTrang);
    } else if (action === 'remove-journal') {
      result = removeJournalEntry_(e?.parameter?.id);
    } else if (action === 'habits-list') {
      result = getHabits_();
    } else if (action === 'add-habit') {
      result = addHabit_(e?.parameter?.name, e?.parameter?.icon);
    } else if (action === 'remove-habit') {
      result = removeHabit_(e?.parameter?.id);
    } else if (action === 'toggle-habit-today') {
      result = toggleHabitToday_(e?.parameter?.habitId);
    } else if (action === 'bills-list') {
      result = getBills_();
    } else if (action === 'add-bill') {
      result = addBill_(e?.parameter?.name, e?.parameter?.amount, e?.parameter?.due, e?.parameter?.cycle, e?.parameter?.note);
    } else if (action === 'update-bill') {
      result = updateBill_(e?.parameter?.id, e?.parameter?.name, e?.parameter?.amount, e?.parameter?.due, e?.parameter?.cycle, e?.parameter?.note);
    } else if (action === 'remove-bill') {
      result = removeBill_(e?.parameter?.id);
    } else if (action === 'mark-bill-paid') {
      result = markBillPaid_(e?.parameter?.id);
    } else if (action === 'people-list') {
      result = getPeople_();
    } else if (action === 'add-person') {
      result = addPerson_(e?.parameter?.name, e?.parameter?.relation, e?.parameter?.birthday, e?.parameter?.contact, e?.parameter?.note);
    } else if (action === 'update-person') {
      result = updatePerson_(e?.parameter?.id, e?.parameter?.name, e?.parameter?.relation, e?.parameter?.birthday, e?.parameter?.contact, e?.parameter?.note);
    } else if (action === 'remove-person') {
      result = removePerson_(e?.parameter?.id);
    } else if (action === 'tarot-log-list') {
      result = getTarotLog_();
    } else if (action === 'add-tarot-log') {
      result = addTarotLog_(e?.parameter?.ngay, e?.parameter?.card, e?.parameter?.reversed, e?.parameter?.note);
    } else if (action === 'remove-tarot-log') {
      result = removeTarotLog_(e?.parameter?.id);
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
        row: i + 1,
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

// ─── DANH MỤC CỔ PHIẾU (mã theo dõi — thêm/xoá lưu thật vào Sheet) ─
function getStockList_() {
  try {
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_STOCKLIST);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME_STOCKLIST);
      sheet.getRange(1, 1, 1, 2).setValues([['Mã', 'Tên']]).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
      const demo = DEFAULT_TICKERS.map(function(t) { return [t, t]; });
      sheet.getRange(2, 1, demo.length, 2).setValues(demo);
    }
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      items.push({ ticker: String(data[i][0]).trim().toUpperCase(), name: data[i][1] || data[i][0] });
    }
    return { items: items };
  } catch(e) {
    return { items: DEFAULT_TICKERS.map(function(t){ return { ticker: t, name: t }; }), error: e.toString() };
  }
}

function addStock_(ticker, name) {
  try {
    ticker = (ticker || '').trim().toUpperCase();
    if (!ticker) return { success: false, error: 'Thiếu mã cổ phiếu' };
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_STOCKLIST);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME_STOCKLIST);
      sheet.getRange(1, 1, 1, 2).setValues([['Mã', 'Tên']]).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
    }
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === ticker) {
        return { success: true, items: getStockList_().items };
      }
    }
    sheet.appendRow([ticker, name || ticker]);
    return { success: true, items: getStockList_().items };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function removeStock_(ticker) {
  try {
    ticker = (ticker || '').trim().toUpperCase();
    const ss = getOrCreateSheet();
    const sheet = ss.getSheetByName(SHEET_NAME_STOCKLIST);
    if (!sheet) return { success: true, items: [] };
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim().toUpperCase() === ticker) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true, items: getStockList_().items };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── THÊM NHIỆM VỤ (ghi thật vào Sheet NHAC_NHO) ──────────
function addTask_(params) {
  try {
    const title = (params.title || '').trim();
    if (!title) return { success: false, error: 'Thiếu tiêu đề nhiệm vụ' };
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_TASKS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME_TASKS);
      const headers = ['Tiêu đề', 'Hạn chót', 'Xong', 'Ưu tiên', 'Ghi chú'];
      sheet.getRange(1, 1, 1, 5).setValues([headers]).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
    }
    const due = params.due ? new Date(params.due) : '';
    sheet.appendRow([title, due, false, params.priority || 'Bình thường', params.note || '']);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── NHIỆM VỤ: đổi trạng thái xong / xoá (dùng ID tạm = số dòng, vì NHAC_NHO không có cột ID) ─
function toggleTask_(rowIndex, done) {
  try {
    const i = parseInt(rowIndex, 10);
    if (!i || i < 2) return { success: false, error: 'Thiếu dòng nhiệm vụ' };
    const ss = getOrCreateSheet();
    const sheet = ss.getSheetByName(SHEET_NAME_TASKS);
    if (!sheet) return { success: false, error: 'Chưa có danh sách nhiệm vụ' };
    sheet.getRange(i, 3).setValue(done === 'true' || done === true);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function removeTask_(rowIndex) {
  try {
    const i = parseInt(rowIndex, 10);
    if (!i || i < 2) return { success: false, error: 'Thiếu dòng nhiệm vụ' };
    const ss = getOrCreateSheet();
    const sheet = ss.getSheetByName(SHEET_NAME_TASKS);
    if (!sheet) return { success: true };
    sheet.deleteRow(i);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── DỰ ÁN CỦA TÔI (tên + link deploy + link edit) ────────
function getProjects_() {
  try {
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_PROJECTS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME_PROJECTS);
      sheet.getRange(1, 1, 1, 4).setValues([['ID', 'Tên', 'Link Deploy', 'Link Edit']]).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
    }
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      items.push({ id: String(data[i][0] || ('P' + i)), name: data[i][1], deploy: data[i][2] || '', edit: data[i][3] || '' });
    }
    return { items: items };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}

function addProject_(name, deploy, edit) {
  try {
    name = (name || '').trim();
    if (!name) return { success: false, error: 'Thiếu tên dự án' };
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_PROJECTS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME_PROJECTS);
      sheet.getRange(1, 1, 1, 4).setValues([['ID', 'Tên', 'Link Deploy', 'Link Edit']]).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
    }
    const id = 'P-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    sheet.appendRow([id, name, (deploy || '').trim(), (edit || '').trim()]);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function updateProject_(id, name, deploy, edit) {
  try {
    id = (id || '').trim();
    name = (name || '').trim();
    if (!id) return { success: false, error: 'Thiếu ID dự án' };
    if (!name) return { success: false, error: 'Thiếu tên dự án' };
    const ss = getOrCreateSheet();
    const sheet = ss.getSheetByName(SHEET_NAME_PROJECTS);
    if (!sheet) return { success: false, error: 'Chưa có danh sách dự án' };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        sheet.getRange(i + 1, 2, 1, 3).setValues([[name, (deploy || '').trim(), (edit || '').trim()]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy dự án' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function removeProject_(id) {
  try {
    const ss = getOrCreateSheet();
    const sheet = ss.getSheetByName(SHEET_NAME_PROJECTS);
    if (!sheet) return { success: true };
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── DASHBOARD TỔNG HỢP: SPACES (Cô Hương / Thầy Cô+AI / Smart School / Widget dự phòng) ─
// 1 sheet chung "SPACES" dùng cho mọi không gian, lọc theo cột "space"
function getSpaceItems_(space) {
  try {
    space = (space || '').trim();
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_SPACES);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME_SPACES);
      sheet.getRange(1, 1, 1, 6).setValues([['space', 'id', 'ten', 'mo_ta', 'link_deploy', 'link_edit']]).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
    }
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][2]) continue;
      if (space && String(data[i][0]) !== space) continue;
      items.push({ space: String(data[i][0] || ''), id: String(data[i][1] || ('S' + i)), name: data[i][2], desc: data[i][3] || '', deploy: data[i][4] || '', edit: data[i][5] || '' });
    }
    return { items: items };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}

function addSpaceItem_(space, name, desc, deploy, edit) {
  try {
    space = (space || '').trim();
    name = (name || '').trim();
    if (!space) return { success: false, error: 'Thiếu không gian' };
    if (!name) return { success: false, error: 'Thiếu tên' };
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_SPACES);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME_SPACES);
      sheet.getRange(1, 1, 1, 6).setValues([['space', 'id', 'ten', 'mo_ta', 'link_deploy', 'link_edit']]).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
    }
    const id = 'S-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    sheet.appendRow([space, id, name, (desc || '').trim(), (deploy || '').trim(), (edit || '').trim()]);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function updateSpaceItem_(space, id, name, desc, deploy, edit) {
  try {
    id = (id || '').trim();
    name = (name || '').trim();
    if (!id) return { success: false, error: 'Thiếu ID' };
    if (!name) return { success: false, error: 'Thiếu tên' };
    const ss = getOrCreateSheet();
    const sheet = ss.getSheetByName(SHEET_NAME_SPACES);
    if (!sheet) return { success: false, error: 'Chưa có dữ liệu' };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === id) {
        sheet.getRange(i + 1, 3, 1, 4).setValues([[name, (desc || '').trim(), (deploy || '').trim(), (edit || '').trim()]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy mục' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function removeSpaceItem_(space, id) {
  try {
    const ss = getOrCreateSheet();
    const sheet = ss.getSheetByName(SHEET_NAME_SPACES);
    if (!sheet) return { success: true };
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── DASHBOARD TỔNG HỢP: KHO DỮ LIỆU ──────────────────────
function getKhoItems_() {
  try {
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_KHO);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME_KHO);
      sheet.getRange(1, 1, 1, 5).setValues([['id', 'icon', 'ten', 'mo_ta', 'url']]).setFontWeight('bold').setBackground('#34a853').setFontColor('#ffffff');
    }
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][2]) continue;
      items.push({ id: String(data[i][0] || ('K' + i)), icon: data[i][1] || '📄', name: data[i][2], desc: data[i][3] || '', url: data[i][4] || '' });
    }
    return { items: items };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}

function addKhoItem_(icon, name, desc, url) {
  try {
    name = (name || '').trim();
    if (!name) return { success: false, error: 'Thiếu tên' };
    const ss = getOrCreateSheet();
    let sheet = ss.getSheetByName(SHEET_NAME_KHO);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME_KHO);
      sheet.getRange(1, 1, 1, 5).setValues([['id', 'icon', 'ten', 'mo_ta', 'url']]).setFontWeight('bold').setBackground('#34a853').setFontColor('#ffffff');
    }
    const id = 'K-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    sheet.appendRow([id, (icon || '📄').trim(), name, (desc || '').trim(), (url || '').trim()]);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function updateKhoItem_(id, icon, name, desc, url) {
  try {
    id = (id || '').trim();
    name = (name || '').trim();
    if (!id) return { success: false, error: 'Thiếu ID' };
    if (!name) return { success: false, error: 'Thiếu tên' };
    const ss = getOrCreateSheet();
    const sheet = ss.getSheetByName(SHEET_NAME_KHO);
    if (!sheet) return { success: false, error: 'Chưa có dữ liệu' };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        sheet.getRange(i + 1, 2, 1, 4).setValues([[(icon || '📄').trim(), name, (desc || '').trim(), (url || '').trim()]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy mục' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function removeKhoItem_(id) {
  try {
    const ss = getOrCreateSheet();
    const sheet = ss.getSheetByName(SHEET_NAME_KHO);
    if (!sheet) return { success: true };
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── YOURFRIEND.AI: ĐỊNH VỊ (tra vị trí vật dụng / hồ sơ) ──
const SHEET_NAME_VITRI = 'VI_TRI';
const VITRI_HEADER = ['id', 'ten', 'danh_muc', 'vi_tri', 'ghi_chu', 'anh_url', 'cap_nhat_luc'];

function _ensureVitriSheet_() {
  const ss = getOrCreateSheet();
  let sheet = ss.getSheetByName(SHEET_NAME_VITRI);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_VITRI);
    sheet.getRange(1, 1, 1, VITRI_HEADER.length).setValues([VITRI_HEADER]).setFontWeight('bold').setBackground('#b45309').setFontColor('#ffffff');
  }
  return sheet;
}

function getLocationItems_() {
  try {
    const sheet = _ensureVitriSheet_();
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      items.push({
        id: String(data[i][0] || ('V' + i)),
        name: data[i][1],
        category: data[i][2] || '',
        location: data[i][3] || '',
        note: data[i][4] || '',
        imageUrl: data[i][5] || '',
        updatedAt: data[i][6] || '',
      });
    }
    return { items: items };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}

function addLocationItem_(name, category, location, note, imageUrl) {
  try {
    name = (name || '').trim();
    location = (location || '').trim();
    if (!name) return { success: false, error: 'Thiếu tên vật dụng/hồ sơ' };
    if (!location) return { success: false, error: 'Thiếu vị trí' };
    const sheet = _ensureVitriSheet_();
    const id = 'V-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    const now = new Date().toISOString();
    sheet.appendRow([id, name, (category || '').trim(), location, (note || '').trim(), (imageUrl || '').trim(), now]);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function updateLocationItem_(id, name, category, location, note, imageUrl) {
  try {
    id = (id || '').trim();
    name = (name || '').trim();
    location = (location || '').trim();
    if (!id) return { success: false, error: 'Thiếu ID' };
    if (!name) return { success: false, error: 'Thiếu tên' };
    if (!location) return { success: false, error: 'Thiếu vị trí' };
    const sheet = _ensureVitriSheet_();
    const data = sheet.getDataRange().getValues();
    const now = new Date().toISOString();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        sheet.getRange(i + 1, 2, 1, 6).setValues([[name, (category || '').trim(), location, (note || '').trim(), (imageUrl || '').trim(), now]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy mục' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function removeLocationItem_(id) {
  try {
    const sheet = _ensureVitriSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// Tìm theo tên / danh mục / vị trí / ghi chú — không phân biệt hoa thường, không cần dấu đúng tuyệt đối
function searchLocationItems_(query) {
  try {
    query = (query || '').trim().toLowerCase();
    const all = getLocationItems_();
    if (!query) return all;
    const items = all.items.filter(function(it) {
      return [it.name, it.category, it.location, it.note].some(function(f) {
        return String(f || '').toLowerCase().indexOf(query) >= 0;
      });
    });
    return { items: items };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}

// ─── YOURFRIEND.AI: DANH MỤC THEO DÕI CỔ PHIẾU (Bộ lọc cổ phiếu) ──
// Chỉ lưu dữ liệu Thầy/Cô tự nhập (mã, ngày mua, số lượng, giá mua, ghi
// chú). Giá hiện tại/lãi-lỗ/tín hiệu BOT tính trực tiếp từ SSI FastConnect
// phía Vercel (api/stock-screener.js) ngay lúc hiển thị, không lưu ở đây.
const SHEET_NAME_WATCHLIST = 'DANH_MUC_THEO_DOI_CP';
const WATCHLIST_HEADER = ['id', 'ma', 'ngay_mua', 'so_luong', 'gia_mua', 'ghi_chu', 'cap_nhat_luc'];

function _ensureWatchlistSheet_() {
  const ss = getOrCreateSheet();
  let sheet = ss.getSheetByName(SHEET_NAME_WATCHLIST);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_WATCHLIST);
    sheet.getRange(1, 1, 1, WATCHLIST_HEADER.length).setValues([WATCHLIST_HEADER]).setFontWeight('bold').setBackground('#1d4ed8').setFontColor('#ffffff');
  }
  return sheet;
}

function getWatchlistItems_() {
  try {
    const sheet = _ensureWatchlistSheet_();
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      items.push({
        id: String(data[i][0] || ('W' + i)),
        symbol: String(data[i][1]).toUpperCase(),
        buyDate: data[i][2] || '',
        quantity: Number(data[i][3]) || 0,
        buyPrice: Number(data[i][4]) || 0,
        note: data[i][5] || '',
        updatedAt: data[i][6] || '',
      });
    }
    return { items: items };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}

function addWatchlistItem_(symbol, buyDate, quantity, buyPrice, note) {
  try {
    symbol = (symbol || '').trim().toUpperCase();
    if (!symbol) return { success: false, error: 'Thiếu mã cổ phiếu' };
    const sheet = _ensureWatchlistSheet_();
    const id = 'W-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    const now = new Date().toISOString();
    sheet.appendRow([id, symbol, (buyDate || '').trim(), Number(quantity) || 0, Number(buyPrice) || 0, (note || '').trim(), now]);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function updateWatchlistItem_(id, symbol, buyDate, quantity, buyPrice, note) {
  try {
    id = (id || '').trim();
    symbol = (symbol || '').trim().toUpperCase();
    if (!id) return { success: false, error: 'Thiếu ID' };
    if (!symbol) return { success: false, error: 'Thiếu mã cổ phiếu' };
    const sheet = _ensureWatchlistSheet_();
    const data = sheet.getDataRange().getValues();
    const now = new Date().toISOString();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        sheet.getRange(i + 1, 2, 1, 6).setValues([[symbol, (buyDate || '').trim(), Number(quantity) || 0, Number(buyPrice) || 0, (note || '').trim(), now]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy mục' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function removeWatchlistItem_(id) {
  try {
    const sheet = _ensureWatchlistSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── YOURFRIEND.AI: THÊM MODULE (Thầy tự đăng ký module mới, không cần code) ─
const SHEET_NAME_MODULES = 'MODULES';
const MODULES_HEADER = ['id', 'ten', 'icon', 'loai', 'cau_hinh', 'thu_tu'];

function _ensureModulesSheet_() {
  const ss = getOrCreateSheet();
  let sheet = ss.getSheetByName(SHEET_NAME_MODULES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_MODULES);
    sheet.getRange(1, 1, 1, MODULES_HEADER.length).setValues([MODULES_HEADER]).setFontWeight('bold').setBackground('#6d28d9').setFontColor('#ffffff');
  }
  return sheet;
}

// loai hợp lệ: 'link' (mở tab mới), 'list' (CRUD đơn giản, tự lưu vào 1 sheet con theo 'cau_hinh'), 'embed' (nhúng iframe theo URL ở 'cau_hinh')
function getModules_() {
  try {
    const sheet = _ensureModulesSheet_();
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      items.push({
        id: String(data[i][0] || ('M' + i)),
        name: data[i][1],
        icon: data[i][2] || '🧩',
        type: data[i][3] || 'link',
        config: data[i][4] || '',
        order: Number(data[i][5] || 0),
      });
    }
    items.sort(function(a, b) { return a.order - b.order; });
    return { items: items };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}

function addModule_(name, icon, type, config, order) {
  try {
    name = (name || '').trim();
    type = (type || 'link').trim().toLowerCase();
    if (!name) return { success: false, error: 'Thiếu tên module' };
    if (['link', 'list', 'embed'].indexOf(type) < 0) return { success: false, error: 'Loại module không hợp lệ' };
    const sheet = _ensureModulesSheet_();
    const id = 'M-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    sheet.appendRow([id, name, (icon || '🧩').trim(), type, (config || '').trim(), Number(order || 0)]);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function updateModule_(id, name, icon, type, config, order) {
  try {
    id = (id || '').trim();
    name = (name || '').trim();
    type = (type || 'link').trim().toLowerCase();
    if (!id) return { success: false, error: 'Thiếu ID' };
    if (!name) return { success: false, error: 'Thiếu tên' };
    const sheet = _ensureModulesSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        sheet.getRange(i + 1, 2, 1, 5).setValues([[name, (icon || '🧩').trim(), type, (config || '').trim(), Number(order || 0)]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy module' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function removeModule_(id) {
  try {
    const sheet = _ensureModulesSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── YOURFRIEND.AI: QUẢN LÝ DỮ LIỆU (chỉ Admin — tập hợp link edit/docx/
// sheet/deploy của mọi dự án để dễ tra cứu, không hiển thị cho Thầy/Cô) ─
const SHEET_NAME_LINKS = 'LINKS';
const LINKS_HEADER = ['id', 'ten', 'loai', 'url', 'du_an', 'ghi_chu', 'cap_nhat'];

function _ensureLinksSheet_() {
  const ss = getOrCreateSheet();
  let sheet = ss.getSheetByName(SHEET_NAME_LINKS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_LINKS);
    sheet.getRange(1, 1, 1, LINKS_HEADER.length).setValues([LINKS_HEADER]).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  }
  return sheet;
}

// loai gợi ý: 'edit' (link sửa code/editor), 'docx' (tài liệu), 'sheet' (Google Sheet),
// 'deploy' (trang live), 'github' (repo), 'apps_script' (Apps Script Editor), 'khac'
function getLinks_() {
  try {
    const sheet = _ensureLinksSheet_();
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      items.push({
        id: String(data[i][0] || ('L' + i)),
        name: data[i][1],
        type: data[i][2] || 'khac',
        url: data[i][3] || '',
        project: data[i][4] || '',
        note: data[i][5] || '',
        updatedAt: data[i][6] || '',
      });
    }
    return { items: items };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}

function addLink_(name, type, url, project, note) {
  try {
    name = (name || '').trim();
    url = (url || '').trim();
    if (!name) return { success: false, error: 'Thiếu tên' };
    if (!url) return { success: false, error: 'Thiếu URL' };
    const sheet = _ensureLinksSheet_();
    const id = 'L-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    const now = new Date().toISOString();
    sheet.appendRow([id, name, (type || 'khac').trim(), url, (project || '').trim(), (note || '').trim(), now]);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function updateLink_(id, name, type, url, project, note) {
  try {
    id = (id || '').trim();
    name = (name || '').trim();
    url = (url || '').trim();
    if (!id) return { success: false, error: 'Thiếu ID' };
    if (!name) return { success: false, error: 'Thiếu tên' };
    if (!url) return { success: false, error: 'Thiếu URL' };
    const sheet = _ensureLinksSheet_();
    const data = sheet.getDataRange().getValues();
    const now = new Date().toISOString();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        sheet.getRange(i + 1, 2, 1, 6).setValues([[name, (type || 'khac').trim(), url, (project || '').trim(), (note || '').trim(), now]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy mục' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function removeLink_(id) {
  try {
    const sheet = _ensureLinksSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── TÌM KIẾM TOÀN DRIVE (tên + nội dung file) ────────────
// folderId (tuỳ chọn): giới hạn quét trong 1 thư mục + thư mục con (đỡ chậm với Drive nhiều file).
// Chấp nhận folderId thô hoặc nguyên link Drive (tự tách ID ra).
function _extractFolderId(raw) {
  raw = (raw || '').trim();
  if (!raw) return '';
  const m = raw.match(/[-\w]{25,}/); // Drive ID dạng chuỗi dài chữ+số+gạch ngang/gạch dưới
  return m ? m[0] : raw;
}

function _collectFolderIds(rootId, maxFolders) {
  const ids = [rootId];
  const queue = [rootId];
  let guard = 0;
  while (queue.length && ids.length < maxFolders && guard < maxFolders * 2) {
    guard++;
    const curr = queue.shift();
    try {
      const it = DriveApp.getFolderById(curr).getFolders();
      while (it.hasNext() && ids.length < maxFolders) {
        const f = it.next();
        ids.push(f.getId());
        queue.push(f.getId());
      }
    } catch(e) { /* bỏ qua thư mục không truy cập được */ }
  }
  return ids;
}

function driveSearch_(query, folderIdRaw) {
  try {
    query = (query || '').trim();
    if (!query) return { items: [], error: 'Thiếu từ khoá tìm kiếm' };
    const qEsc = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const folderId = _extractFolderId(folderIdRaw);
    const MAX_RESULTS = 40;
    const found = {}; // id -> item (gộp trùng)

    function runSearch(gQuery) {
      const it = DriveApp.searchFiles(gQuery);
      let n = 0;
      while (it.hasNext() && n < MAX_RESULTS) {
        const f = it.next();
        n++;
        const id = f.getId();
        if (found[id]) continue;
        found[id] = {
          id: id,
          name: f.getName(),
          url: f.getUrl(),
          mimeType: f.getMimeType(),
          modified: f.getLastUpdated() ? f.getLastUpdated().toISOString() : '',
          matchType: gQuery.indexOf('fullText') >= 0 ? 'noi_dung' : 'ten_file',
        };
      }
    }

    if (folderId) {
      // Quét giới hạn trong 1 thư mục + thư mục con (tối đa 150 thư mục để tránh timeout)
      const folderIds = _collectFolderIds(folderId, 150);
      const BATCH = 15;
      for (let i = 0; i < folderIds.length; i += BATCH) {
        const batch = folderIds.slice(i, i + BATCH);
        const parentClause = '(' + batch.map(id => `'${id}' in parents`).join(' or ') + ')';
        runSearch(`trashed = false and ${parentClause} and title contains '${qEsc}'`);
        runSearch(`trashed = false and ${parentClause} and fullText contains '${qEsc}'`);
      }
    } else {
      // Quét toàn bộ Drive — ưu tiên khớp tên trước, rồi tới nội dung
      runSearch(`trashed = false and title contains '${qEsc}'`);
      runSearch(`trashed = false and fullText contains '${qEsc}'`);
    }

    return { items: Object.values(found).slice(0, MAX_RESULTS), scoped: !!folderId };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}

// ─── YOURFRIEND.AI: helper ngày tháng (tính theo chuỗi 'yyyy-MM-dd', không phụ thuộc timezone server) ──
function _todayStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
}
// Google Sheets tự nhận diện chuỗi "yyyy-MM-dd" ghi vào ô và CHUYỂN THÀNH kiểu Date
// (dù appendRow truyền vào là string thuần) — đọc lại qua getValues() sẽ ra Date object,
// không phải string gốc. Luôn đọc ô "ngày" qua helper này để lấy lại đúng 'yyyy-MM-dd'
// bất kể ô đang là Date hay vẫn là string (ô cũ/ô người dùng gõ tay).
function _cellDateStr_(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  return String(val || '').trim();
}
function _addDays_(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Utilities.formatDate(new Date(Date.UTC(y, m - 1, d + n)), 'UTC', 'yyyy-MM-dd');
}
function _addMonths_(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let tm = m - 1 + n;
  let ty = y + Math.floor(tm / 12);
  tm = ((tm % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return Utilities.formatDate(new Date(Date.UTC(ty, tm, Math.min(d, lastDay))), 'UTC', 'yyyy-MM-dd');
}
function _computeStreak_(dateSet, todayStr) {
  let cursor = todayStr;
  if (!dateSet.has(cursor)) {
    cursor = _addDays_(cursor, -1);
    if (!dateSet.has(cursor)) return 0;
  }
  let streak = 0;
  while (dateSet.has(cursor)) { streak++; cursor = _addDays_(cursor, -1); }
  return streak;
}

// ─── YOURFRIEND.AI: NHẬT KÝ ──────────────────────────────
const SHEET_NAME_NHATKY = 'NHAT_KY';
const NHATKY_HEADER = ['id', 'ngay', 'noi_dung', 'tam_trang', 'created_at'];
function _ensureNhatKySheet_() {
  const ss = getOrCreateSheet();
  let sheet = ss.getSheetByName(SHEET_NAME_NHATKY);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_NHATKY);
    sheet.getRange(1, 1, 1, NHATKY_HEADER.length).setValues([NHATKY_HEADER]).setFontWeight('bold').setBackground('#7c3aed').setFontColor('#ffffff');
    sheet.getRange(2, 2, 4998, 1).setNumberFormat('@'); // cột "ngay" giữ dạng text, tránh Sheets tự đổi thành Date
  }
  return sheet;
}
function getJournalEntries_() {
  try {
    const sheet = _ensureNhatKySheet_();
    const data = sheet.getDataRange().getValues();
    const items = [];
    const dateSet = new Set();
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      const ngay = _cellDateStr_(data[i][1]);
      dateSet.add(ngay);
      items.push({ id: String(data[i][0] || ('N' + i)), ngay, noiDung: data[i][2] || '', tamTrang: data[i][3] || '', createdAt: data[i][4] || '' });
    }
    items.sort((a, b) => b.ngay.localeCompare(a.ngay));
    return { items: items.slice(0, 120), streak: _computeStreak_(dateSet, _todayStr_()) };
  } catch(e) {
    return { items: [], streak: 0, error: e.toString() };
  }
}
function addJournalEntry_(ngay, noiDung, tamTrang) {
  try {
    ngay = (ngay || _todayStr_()).trim();
    noiDung = (noiDung || '').trim();
    if (!noiDung) return { success: false, error: 'Thiếu nội dung' };
    const sheet = _ensureNhatKySheet_();
    const id = 'N-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    sheet.appendRow([id, ngay, noiDung, (tamTrang || '').trim(), new Date().toISOString()]);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}
function updateJournalEntry_(id, ngay, noiDung, tamTrang) {
  try {
    id = (id || '').trim();
    noiDung = (noiDung || '').trim();
    if (!id) return { success: false, error: 'Thiếu ID' };
    if (!noiDung) return { success: false, error: 'Thiếu nội dung' };
    const sheet = _ensureNhatKySheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        sheet.getRange(i + 1, 2, 1, 3).setValues([[(ngay || data[i][1]).trim(), noiDung, (tamTrang || '').trim()]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy mục' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}
function removeJournalEntry_(id) {
  try {
    const sheet = _ensureNhatKySheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── YOURFRIEND.AI: THÓI QUEN ────────────────────────────
const SHEET_NAME_THOIQUEN = 'THOI_QUEN';
const SHEET_NAME_THOIQUEN_LOG = 'THOI_QUEN_LOG';
const THOIQUEN_HEADER = ['id', 'ten', 'icon', 'created_at'];
const THOIQUEN_LOG_HEADER = ['id', 'habit_id', 'ngay', 'created_at'];
function _ensureHabitSheet_() {
  const ss = getOrCreateSheet();
  let sheet = ss.getSheetByName(SHEET_NAME_THOIQUEN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_THOIQUEN);
    sheet.getRange(1, 1, 1, THOIQUEN_HEADER.length).setValues([THOIQUEN_HEADER]).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
  }
  return sheet;
}
function _ensureHabitLogSheet_() {
  const ss = getOrCreateSheet();
  let sheet = ss.getSheetByName(SHEET_NAME_THOIQUEN_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_THOIQUEN_LOG);
    sheet.getRange(1, 1, 1, THOIQUEN_LOG_HEADER.length).setValues([THOIQUEN_LOG_HEADER]).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
    sheet.getRange(2, 3, 4998, 1).setNumberFormat('@'); // cột "ngay" giữ dạng text
  }
  return sheet;
}
function getHabits_() {
  try {
    const habitSheet = _ensureHabitSheet_();
    const logSheet = _ensureHabitLogSheet_();
    const habitData = habitSheet.getDataRange().getValues();
    const logData = logSheet.getDataRange().getValues();
    const todayStr = _todayStr_();
    const logsByHabit = {};
    for (let i = 1; i < logData.length; i++) {
      const hid = String(logData[i][1] || '');
      if (!hid) continue;
      if (!logsByHabit[hid]) logsByHabit[hid] = new Set();
      logsByHabit[hid].add(_cellDateStr_(logData[i][2]));
    }
    const items = [];
    for (let i = 1; i < habitData.length; i++) {
      if (!habitData[i][1]) continue;
      const id = String(habitData[i][0] || ('H' + i));
      const dateSet = logsByHabit[id] || new Set();
      items.push({
        id, name: habitData[i][1], icon: habitData[i][2] || '✅',
        checkedToday: dateSet.has(todayStr),
        streak: _computeStreak_(dateSet, todayStr),
      });
    }
    return { items };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}
function addHabit_(name, icon) {
  try {
    name = (name || '').trim();
    if (!name) return { success: false, error: 'Thiếu tên thói quen' };
    const sheet = _ensureHabitSheet_();
    const id = 'H-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    sheet.appendRow([id, name, (icon || '✅').trim(), new Date().toISOString()]);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}
function removeHabit_(id) {
  try {
    id = (id || '').trim();
    const sheet = _ensureHabitSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === id) { sheet.deleteRow(i + 1); break; }
    }
    const logSheet = _ensureHabitLogSheet_();
    const logData = logSheet.getDataRange().getValues();
    for (let i = logData.length - 1; i >= 1; i--) {
      if (String(logData[i][1]) === id) { logSheet.deleteRow(i + 1); }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}
function toggleHabitToday_(habitId) {
  try {
    habitId = (habitId || '').trim();
    if (!habitId) return { success: false, error: 'Thiếu ID thói quen' };
    const logSheet = _ensureHabitLogSheet_();
    const data = logSheet.getDataRange().getValues();
    const todayStr = _todayStr_();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1]) === habitId && _cellDateStr_(data[i][2]) === todayStr) {
        logSheet.deleteRow(i + 1);
        return { success: true, checked: false };
      }
    }
    const id = 'HL-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    logSheet.appendRow([id, habitId, todayStr, new Date().toISOString()]);
    return { success: true, checked: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── YOURFRIEND.AI: HOÁ ĐƠN & ĐĂNG KÝ ────────────────────
const SHEET_NAME_HOADON = 'HOA_DON';
const HOADON_HEADER = ['id', 'ten', 'so_tien', 'han', 'chu_ky', 'ghi_chu', 'da_thanh_toan_luc'];
function _ensureBillSheet_() {
  const ss = getOrCreateSheet();
  let sheet = ss.getSheetByName(SHEET_NAME_HOADON);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_HOADON);
    sheet.getRange(1, 1, 1, HOADON_HEADER.length).setValues([HOADON_HEADER]).setFontWeight('bold').setBackground('#b45309').setFontColor('#ffffff');
    sheet.getRange(2, 4, 4998, 1).setNumberFormat('@'); // cột "han" giữ dạng text
    sheet.getRange(2, 7, 4998, 1).setNumberFormat('@'); // cột "da_thanh_toan_luc" giữ dạng text
  }
  return sheet;
}
function getBills_() {
  try {
    const sheet = _ensureBillSheet_();
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      items.push({
        id: String(data[i][0] || ('B' + i)), name: data[i][1], amount: Number(data[i][2]) || 0,
        due: _cellDateStr_(data[i][3]), cycle: data[i][4] || '', note: data[i][5] || '', lastPaid: _cellDateStr_(data[i][6]),
      });
    }
    items.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    return { items };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}
function addBill_(name, amount, due, cycle, note) {
  try {
    name = (name || '').trim();
    if (!name) return { success: false, error: 'Thiếu tên hoá đơn' };
    const sheet = _ensureBillSheet_();
    const id = 'B-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    sheet.appendRow([id, name, Number(amount) || 0, (due || '').trim(), (cycle || '').trim(), (note || '').trim(), '']);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}
function updateBill_(id, name, amount, due, cycle, note) {
  try {
    id = (id || '').trim();
    name = (name || '').trim();
    if (!id) return { success: false, error: 'Thiếu ID' };
    if (!name) return { success: false, error: 'Thiếu tên hoá đơn' };
    const sheet = _ensureBillSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        sheet.getRange(i + 1, 2, 1, 5).setValues([[name, Number(amount) || 0, (due || '').trim(), (cycle || '').trim(), (note || '').trim()]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy mục' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}
function removeBill_(id) {
  try {
    const sheet = _ensureBillSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}
function markBillPaid_(id) {
  try {
    id = (id || '').trim();
    const sheet = _ensureBillSheet_();
    const data = sheet.getDataRange().getValues();
    const todayStr = _todayStr_();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        const due = _cellDateStr_(data[i][3]);
        const cycle = data[i][4] || '';
        let newDue = due;
        if (cycle === 'thang' && due) newDue = _addMonths_(due, 1);
        else if (cycle === 'nam' && due) newDue = _addMonths_(due, 12);
        sheet.getRange(i + 1, 4, 1, 1).setValues([[newDue]]);
        sheet.getRange(i + 1, 7, 1, 1).setValues([[todayStr]]);
        return { success: true, newDue };
      }
    }
    return { success: false, error: 'Không tìm thấy mục' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── YOURFRIEND.AI: MỌI NGƯỜI ────────────────────────────
const SHEET_NAME_MOINGUOI = 'MOI_NGUOI';
const MOINGUOI_HEADER = ['id', 'ten', 'moi_quan_he', 'sinh_nhat', 'lien_he', 'ghi_chu'];
function _ensurePeopleSheet_() {
  const ss = getOrCreateSheet();
  let sheet = ss.getSheetByName(SHEET_NAME_MOINGUOI);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_MOINGUOI);
    sheet.getRange(1, 1, 1, MOINGUOI_HEADER.length).setValues([MOINGUOI_HEADER]).setFontWeight('bold').setBackground('#be185d').setFontColor('#ffffff');
    sheet.getRange(2, 4, 4998, 1).setNumberFormat('@'); // cột "sinh_nhat" giữ dạng text
  }
  return sheet;
}
function getPeople_() {
  try {
    const sheet = _ensurePeopleSheet_();
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      items.push({
        id: String(data[i][0] || ('P' + i)), name: data[i][1], relation: data[i][2] || '',
        birthday: _cellDateStr_(data[i][3]), contact: data[i][4] || '', note: data[i][5] || '',
      });
    }
    return { items };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}
function addPerson_(name, relation, birthday, contact, note) {
  try {
    name = (name || '').trim();
    if (!name) return { success: false, error: 'Thiếu tên' };
    const sheet = _ensurePeopleSheet_();
    const id = 'P-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    sheet.appendRow([id, name, (relation || '').trim(), (birthday || '').trim(), (contact || '').trim(), (note || '').trim()]);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}
function updatePerson_(id, name, relation, birthday, contact, note) {
  try {
    id = (id || '').trim();
    name = (name || '').trim();
    if (!id) return { success: false, error: 'Thiếu ID' };
    if (!name) return { success: false, error: 'Thiếu tên' };
    const sheet = _ensurePeopleSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        sheet.getRange(i + 1, 2, 1, 5).setValues([[name, (relation || '').trim(), (birthday || '').trim(), (contact || '').trim(), (note || '').trim()]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy mục' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}
function removePerson_(id) {
  try {
    const sheet = _ensurePeopleSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── YOURFRIEND.AI: NHẬT KÝ LÁ BÀI (Tarot) ───────────────
const SHEET_NAME_TAROTLOG = 'TAROT_LOG';
const TAROTLOG_HEADER = ['id', 'ngay', 'la_bai', 'nguoc_xuoi', 'ghi_chu', 'created_at'];
function _ensureTarotLogSheet_() {
  const ss = getOrCreateSheet();
  let sheet = ss.getSheetByName(SHEET_NAME_TAROTLOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_TAROTLOG);
    sheet.getRange(1, 1, 1, TAROTLOG_HEADER.length).setValues([TAROTLOG_HEADER]).setFontWeight('bold').setBackground('#5b21b6').setFontColor('#ffffff');
    sheet.getRange(2, 2, 4998, 1).setNumberFormat('@'); // cột "ngay" giữ dạng text
  }
  return sheet;
}
function getTarotLog_() {
  try {
    const sheet = _ensureTarotLogSheet_();
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][2]) continue;
      items.push({ id: String(data[i][0] || ('T' + i)), ngay: _cellDateStr_(data[i][1]), card: data[i][2], reversed: data[i][3] === true || data[i][3] === 'true', note: data[i][4] || '' });
    }
    items.sort((a, b) => (b.ngay || '').localeCompare(a.ngay || ''));
    return { items: items.slice(0, 60) };
  } catch(e) {
    return { items: [], error: e.toString() };
  }
}
function addTarotLog_(ngay, card, reversed, note) {
  try {
    card = (card || '').trim();
    if (!card) return { success: false, error: 'Thiếu tên lá bài' };
    const sheet = _ensureTarotLogSheet_();
    const id = 'TL-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss');
    sheet.appendRow([id, (ngay || _todayStr_()).trim(), card, reversed === true || reversed === 'true', (note || '').trim(), new Date().toISOString()]);
    return { success: true, id: id };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}
function removeTarotLog_(id) {
  try {
    const sheet = _ensureTarotLogSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
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
    const list = getStockList_().items || [];
    const tickers = list.length ? list.map(function(it) { return it.ticker; }) : ALL_TICKERS;
    getPrices(tickers);
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

// ─── LẤY NỘI DUNG TIN TỨC TỪ GOOGLE DRIVE ──────────────
function getContentFromDrive() {
  try {
    var folder = DriveApp.getFolderById('11nkqNxjmHXjIg_YRP8ysp2iizVB6So3-');
    var files = folder.getFilesByName('dashboard-content.json');
    var latest = null;
    while (files.hasNext()) {
      var f = files.next();
      if (!latest || f.getDateCreated().getTime() > latest.getDateCreated().getTime()) latest = f;
    }
    if (!latest) throw new Error('Khong tim thay file dashboard-content.json trong thu muc');
    var text = latest.getBlob().getDataAsString();
    return JSON.parse(text);
  } catch(e) {
    return { error: e.toString(), contentTrends: [], videoIdeas: [], cryptoNews: [], socialTrends: [], keywords: [] };
  }
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

// ─── LẤY VIỆC ƯU TIÊN TỪ SHEET CONG_VIEC ──────────────────
function getSheetTasks_() {
try {
const ss = getOrCreateSheet();
let sheet = ss.getSheetByName('CONG_VIEC');

if (!sheet) {
sheet = ss.insertSheet('CONG_VIEC');
const headers = ['ID', 'Tên công việc', 'Phụ trách', 'Ưu tiên', 'Hạn chót', 'Trạng thái', 'Tiến độ'];
sheet.getRange(1, 1, 1, 7).setValues([headers]).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
const today = new Date();
const demo = [
['CV-001', 'Họp tổ chuyên môn tuần 3', 'Cô', 'Cao', Utilities.formatDate(new Date(today.getTime()+1*86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'), 'Đang thực hiện', 60],
['CV-002', 'Nộp kế hoạch bài dạy', 'Thầy', 'Cao', Utilities.formatDate(new Date(today.getTime()+2*86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'), 'Chưa bắt đầu', 0],
['CV-003', 'Kiểm tra nội bộ GV Nguyễn Thị B', 'Cả hai', 'Trung bình', Utilities.formatDate(new Date(today.getTime()+5*86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'), 'Đang thực hiện', 30]
];
sheet.getRange(2, 1, demo.length, 7).setValues(demo);
}

const data = sheet.getDataRange().getValues();
const tasks = [];

for (let i = 1; i < data.length; i++) {
const row = data[i];
if (!row[1]) continue;
const dueDate = row[4] ? Utilities.formatDate(new Date(row[4]), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : '';
tasks.push({
id: row[0] || ('CV-' + i),
name: row[1],
owner: row[2] || '',
priority: row[3] || 'Bình thường',
dueDate: dueDate,
status: row[5] || 'Chưa bắt đầu',
progress: Number(row[6]) || 0
});
}

return { tasks: tasks, count: tasks.length, updated: new Date().toISOString() };
} catch(e) {
return { tasks: [], error: e.toString() };
}
}

function test_getSheetTasks() {
const result = getSheetTasks_();
Logger.log(JSON.stringify(result, null, 2));
}
