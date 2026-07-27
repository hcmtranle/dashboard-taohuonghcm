# Dashboard Công Việc – Cô Trần Thị Thu Hương & Thầy Lê Thành Tạo
**Thạc sĩ quản lý giáo dục**

---

## Cấu trúc file

```
dashboard/
├── index.html              ← Giao diện chính
├── dashboard.config.json   ← Cấu hình trung tâm (Claude chỉnh sửa khi Thầy yêu cầu)
├── appscript.gs            ← Google Apps Script (lấy giá cổ phiếu VN + Sheets)
├── vercel.json             ← Cấu hình triển khai Vercel
└── README.md               ← File này
```

---

## Bước 1 – Đưa code lên GitHub

1. Vào [github.com](https://github.com) → **New repository**
2. Đặt tên: `dashboard-nak` (hoặc tên khác)
3. Chọn **Public** → **Create repository**
4. Tải về [GitHub Desktop](https://desktop.github.com/) (dễ dùng hơn command line)
5. Clone repo vừa tạo → Copy tất cả file trong thư mục này vào → Commit & Push

---

## Bước 2 – Deploy lên Vercel

1. Vào [vercel.com](https://vercel.com) → Đăng nhập bằng GitHub
2. **New Project** → Import repo `dashboard-nak`
3. Framework Preset: **Other** (không phải Next.js)
4. Nhấn **Deploy** → Chờ ~30 giây
5. Vercel tự cấp domain dạng: `dashboard-nak.vercel.app`

---

## Bước 3 – Cài đặt Google Apps Script

### 3a. Tạo Apps Script mới

1. Vào [script.google.com](https://script.google.com)
2. **New project** → Xóa code mặc định → Paste toàn bộ nội dung file `appscript.gs`
3. Đặt tên project: `Dashboard NAK - Stock Price API`
4. Nhấn **Save** (Ctrl+S)

### 3b. Test thủ công

1. Chọn function `test_getPrices` trong dropdown
2. Nhấn **Run** → Xem log → Kiểm tra có lấy được giá chưa
3. Nếu thành công → tiếp tục bước 3c

### 3c. Deploy làm Web App

1. **Deploy** → **New deployment**
2. Chọn type: **Web app**
3. Cài đặt:
   - **Execute as**: Me (hcmtranle@gmail.com)
   - **Who has access**: Anyone
4. **Deploy** → **Authorize** khi được hỏi
5. Copy **Web App URL** (dạng: `https://script.google.com/macros/s/ABC123.../exec`)

### 3d. Dán URL vào dashboard

**Cách 1 (qua giao diện):**
1. Mở dashboard → Nhấn **⚙️ Cấu hình App Script URL**
2. Paste URL vào ô **URL App Script (Giá chứng khoán)**
3. **Lưu cấu hình** → Dashboard tự làm mới

**Cách 2 (qua file — vĩnh viễn hơn):**
1. Mở `dashboard.config.json`
2. Tìm dòng `"stockApiUrl": "PASTE_YOUR_APPSCRIPT_URL_HERE"`
3. Thay bằng URL thật
4. Commit & Push → Vercel tự cập nhật

---

## Bước 4 – Kết nối Google Sheets nhắc nhở (tuỳ chọn)

1. Tạo Google Sheet mới tại [sheets.google.com](https://sheets.google.com)
2. Đặt tên sheet: `NHAC_NHO`
3. Tạo cột: `Tiêu đề | Hạn chót | Xong | Ưu tiên | Ghi chú`
4. Ghi URL Sheet vào `dashboard.config.json` ở dòng `"sheetsUrl"`
5. Apps Script sẽ tự đọc từ Sheet này khi được gọi với `?action=tasks`

---

## Thêm ý tưởng mới – Hệ thống tự cập nhật

Khi Thầy muốn thêm tính năng mới, chỉ cần nói với **Claude trong Cowork**:

> "Thầy muốn thêm widget theo dõi số học sinh vắng mặt"
> "Thêm link Zalo OA của trường vào phần quick links"
> "Theo dõi thêm mã chứng khoán HPG với ngưỡng 22-28"
> "Thay màu giao diện sang tối"
> "Thêm mục xu hướng tin tức giáo dục"

Claude sẽ:
1. Chỉnh sửa `dashboard.config.json` theo yêu cầu
2. Thêm widget mới vào `index.html` nếu cần
3. Thầy commit & push → Vercel tự triển khai trong vài giây

---

## Tính năng chính

| Tính năng | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| Đồng hồ realtime | ✅ Hoạt động | Hiển thị giờ VN |
| Giá Coin (BTC, ETH) | ✅ Hoạt động | CoinGecko API miễn phí |
| Giá cổ phiếu VN | ⚙️ Cần cấu hình | Cài App Script (Bước 3) |
| Gmail quick links | ✅ Hoạt động | Mở thẳng các mục Gmail |
| Lịch Google Calendar | ✅ Hoạt động | Nhúng iframe tuần hiện tại |
| Nhắc nhở từ Sheets | ⚙️ Cần cấu hình | Cài App Script + Sheets (Bước 4) |
| Cảnh báo giá | ✅ Hoạt động | Toast thông báo khi vượt ngưỡng |
| Xu hướng nội dung | ✅ Hoạt động | Links Google Trends, YT Studio... |
| Market analysis links | ✅ Hoạt động | SSI, TCBS, Vietstock, CafeF |
| Dark/Light mode | ✅ Hoạt động | Nhấn 🌙 ở header |
| Tự làm mới | ✅ Hoạt động | 60 giây/lần (cấu hình được) |

---

## Domain tuỳ chỉnh (nâng cao)

Nếu Thầy có domain riêng (vd: `dashboard.truongnak.edu.vn`):
1. Vercel → Project Settings → Domains → Add domain
2. Cấu hình DNS theo hướng dẫn Vercel

---

*File này do Claude tạo tự động. Cập nhật lần cuối: 27/07/2026*
