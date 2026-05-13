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

## 5. Các bước hoàn tất bàn giao
1. **Export Code:** Bạn PHẢI dùng chức năng Export to GitHub của AI Studio để đẩy code lên repo `KPIsSongHan`.
2. **Kích hoạt Hosting:** Vào Firebase Console > App Hosting > Chọn Backend `kpissonghan` > Nhấn **"Create rollout"**.
3. **Authorized Domains:** Đảm bảo cả `kpissonghan.online` và `www.kpissonghan.online` đã có trong mục Authentication > Settings.

## 6. Danh sách DNS chuẩn (Vận hành vĩnh viễn)
Để trang web chạy ổn định, bản ghi DNS tại trang quản lý tên miền (inet, matbao, tenten...) phải như sau:
- **A Record:** `@` trỏ về `151.101.1.195`
- **CNAME Record:** `www` trỏ về `kpissonghan.online`
- **TXT Record:** Mã xác thực từ Firebase (Bắt đầu bằng `hosting-site=...`)

---
*Bản quyền thuộc về Hội Xây Dựng Sông Hàn - 2026*
