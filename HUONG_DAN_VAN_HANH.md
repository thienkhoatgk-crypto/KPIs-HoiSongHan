# HƯỚNG DẪN VẬN HÀNH HỆ THỐNG KPI SÔNG HÀN

## 1. Truy cập Hệ thống
- **Địa chỉ chính thức:** [https://kpissonghan.online](https://kpissonghan.online)
- **Phương thức đăng nhập:** Sử dụng tài khoản Google Workspace hoặc Gmail cá nhân đã được cấp quyền.

## 2. Phân quyền Người dùng
- **Admin:** (thienkhoatgk@gmail.com, queenkily@gmail.com) - Có quyền duyệt báo cáo, quản lý thành viên, xem thống kê toàn hội.
- **Thành viên:** Có quyền gửi báo cáo cá nhân, xem lịch sử báo cáo của mình.

## 3. Quy trình Duyệt & Thông báo (Mới)
- Khi Admin thay đổi trạng thái báo cáo sang **Approved (Đã duyệt)** hoặc **Rejected (Từ chối)**:
    1. Hệ thống tự động tạo một bản ghi trong bộ nhớ đệm.
    2. Extension **Trigger Email** (của Firebase) sẽ quét và gửi email thông báo tới thành viên.
    3. Nội dung email bao gồm: Tuần báo cáo, Kết quả, và Ghi chú từ Admin.

## 4. Xử lý lỗi phổ biến trên thiết bị di động
### Lỗi chớp tắt màn hình khi đăng nhập (iPhone/Safari):
- **Nguyên nhân:** Do tính năng bảo mật "Ngăn chặn theo dõi chéo trang" của Apple.
- **Khắc phục:** Vào **Cài đặt** > **Safari** > Tắt **Ngăn chặn theo dõi chéo trang**.
- **Lưu ý:** Khi chạy trên tên miền chính thức và ổn định DNS, lỗi này sẽ ít xuất hiện hơn.

## 5. Xử lý lỗi khi bàn giao
- **Lỗi Billing (Artifact Registry):** Bạn đã nạp tiền thành công, lỗi này sẽ biến mất khi bạn tạo Rollout mới.
- **Lỗi "Resource already exists":** Đây là thông báo Backend đã được tạo. Bạn chỉ cần vào Backend đó và nhấn **"Create rollout"** thay vì tạo mới.
- **QUAN TRỌNG - Code trên GitHub:** Repo GitHub của bạn hiện đang trống. Firebase App Hosting cần code để chạy.
  - Bạn phải quay lại AI Studio, nhấn vào **Menu (3 gạch)** góc trên bên trái.
  - Chọn **Export to GitHub**, chọn đúng tài khoản và Repo `KPIsSongHan` để đẩy code lên.
  - Sau khi code đã lên GitHub, quay lại Firebase App Hosting và nhấn **"Create rollout"**.
- **Tên miền WWW:** Đừng quên thêm `www.kpissonghan.online` vào phần Custom Domain của Hosting để người dùng gõ kiểu gì cũng vào được.

## 6. Danh sách DNS chuẩn (Kết nối vĩnh viễn)
Để trang web chạy ổn định, bản ghi DNS tại trang quản lý tên miền (inet, matbao, tenten...) phải như sau:
- **A Record:** `@` trỏ về `151.101.1.195`
- **CNAME Record:** `www` trỏ về `kpissonghan.online`
- **TXT Record:** Mã xác thực từ Firebase (Bắt đầu bằng `hosting-site=...`)

---
*Bản quyền thuộc về Hội Xây Dựng Sông Hàn - 2026*
