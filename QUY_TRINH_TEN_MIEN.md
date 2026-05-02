# Quy trình Nâng cấp & Chuyển đổi Tên miền (Custom Domain)
## Hệ thống Quản lý KPI - Hội Xây Dựng Sông Hàn

Tài liệu này hướng dẫn cách đưa ứng dụng từ môi trường AI Studio sang một tên miền chính thức.

---

### GIAI ĐOẠN 1: CHUẨN BỊ VỀ THƯƠNG HIỆU & PHÁP LÝ

1.  **Xác minh quyền sở hữu miền (Đã thực hiện):**
    *   Sử dụng mã `google-site-verification` trong `index.html`.
    *   Tạo tệp HTML xác minh tại thư mục gốc.
2.  **Cập nhật Chính sách Bảo mật:**
    *   Đảm bảo URL tên miền mới được cập nhật trong nội dung Chính sách bảo mật (để được Google duyệt OAuth).
3.  **Cấu hình SEO:**
    *   Cập nhật `<title>` và các thẻ `<meta description>` trong `index.html` theo tên miền mới.

---

### GIAI ĐOẠN 2: CẤU HÌNH KỸ THUẬT (DOMAIN MAPPING)

Hiện tại ứng dụng đang chạy trên Cloud Run (Google Cloud). Bạn có 2 lựa chọn chính:

#### Cách 1: Sử dụng "Cloud Run Domain Mapping" (Khuyên dùng cho tính đơn giản)
1.  Truy cập [Google Cloud Console](https://console.cloud.google.com/run).
2.  Chọn service `kpi-s-ng-hn-construction`.
3.  Vào tab **Manage Custom Domains**.
4.  Thêm tên miền `kpissonghan.online`.
5.  **Cấu hình DNS:** Thêm các bản ghi CNAME hoặc A mà Google cung cấp vào trình quản lý tên miền của bạn (nhà cung cấp tên miền).

#### Cách 2: Sử dụng Firebase Hosting (Khuyên dùng nếu muốn SEO tốt hơn)
1.  Kết nối dự án Firebase hiện tại với Firebase Hosting.
2.  Trỏ tên miền từ Firebase Console -> Hosting -> Custom Domain.
3.  Lợi ích: Tự động cấp chứng chỉ SSL (HTTPS) miễn phí và tốc độ truy cập nhanh hơn.

---

### GIAI ĐOẠN 3: XÁC THỰC GOOGLE (OAUTH CONSENT)

Đây là bước quan trọng nhất để hội viên có thể đăng nhập bằng Google trên tên miền mới.

1.  Truy cập [Google Cloud APIs & Services > OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
2.  Thêm URL tên miền chính thức vào mục **Authorized domains**.
3.  Cập nhật **App Home Page**, **Privacy Policy link** và **Terms of Service link** đúng với tên miền mới.
4.  Gửi yêu cầu **Verification** cho Google (nếu cần nếu ứng dụng chuyển sang chế độ "External").

---

### GIAI ĐOẠN 4: TRIỂN KHAI & KIỂM TRA

1.  **Thực hiện Publish lại:** Sử dụng nút **Publish** trong AI Studio để đảm bảo bản build mới nhất chứa file xác minh và header chuẩn.
2.  **Kiểm tra link nội bộ:** Đảm bảo tất cả các link trong ứng dụng trỏ về trang chủ mới thay vì link `run.app`.
3.  **Theo dõi Google Search Console:** Quay lại Search Console để kiểm tra trạng thái lập chỉ mục (Indexing).

---

*Lưu ý: Sau khi cấu hình DNS, có thể mất từ 1-24h để tên miền có hiệu lực hoàn toàn trên toàn cầu.*
