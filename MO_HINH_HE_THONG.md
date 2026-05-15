# Mô Hình Hệ Thống KPI Sông Hàn Construction (Mindmap)

Dưới đây là sơ đồ tóm tắt cấu trúc và vận hành của hệ thống để anh có thể truyền thông đến đội ngũ:

## 1. TRUNG TÂM DỮ LIỆU (Google Firebase)
*   **Authentication:** Quản lý đăng nhập bằng tài khoản Google (Bảo mật & Tiện lợi).
*   **Firestore Database:** Lưu trữ thông tin hội viên, báo cáo KPI, lịch họp, doanh số.
*   **Cloud Storage:** Lưu trữ ảnh minh chứng (Hợp đồng, phiếu thu, ảnh gặp mặt).
*   **App Hosting:** Tự động cập nhật website mỗi khi có thay đổi code.

## 2. CHỨC NĂNG DÀNH CHO HỘI VIÊN (User)
*   **Dashboard Cá Nhân:** Theo dõi điểm số real-time, hạng thành viên, biểu đồ tăng trưởng.
*   **Báo Cáo KPI Hàng Tuần:**
    *   *Hiện diện:* Đi họp đúng giờ/muộn/vắng.
    *   *Kết nối (1-2-1):* Ghi nhận các buổi gặp mặt chuyên sâu.
    *   *Referral (Cơ hội):* Trao cơ hội kinh doanh cho đồng đội.
    *   *Doanh số:* Ghi nhận doanh thu thực tế (Cho & Nhận).
    *   *Khách mời:* Mời khách đến buổi họp.
*   **Minh Chứng:** Bắt buộc tải ảnh để Admin đối soát.

## 3. CHỨC NĂNG QUẢN TRỊ (Admin)
*   **Duyệt Báo Cáo:** Chấm điểm dựa trên minh chứng ảnh, đảm bảo tính công bằng.
*   **Quản Lý Nhóm:** Phân chia thành viên vào các nhóm (Nhóm 1, 2, 3...) để thi đua.
*   **Lịch Họp & Điểm Danh:** Tạo buổi họp định kỳ, quét mã điểm danh (trong tương lai).
*   **Tổng Kết Tháng:** Tự động chốt điểm, xuất file PDF/Excel bảng xếp hạng.

## 4. QUY TRÌNH VẬN HÀNH (Timeline)
*   **Thứ 4 - Thứ 2 hàng tuần:** Hội viên làm hoạt động và báo cáo lên hệ thống.
*   **00:00 Thứ 3:** Hệ thống khóa báo cáo tuần cũ.
*   **09:00 Thứ 3:** Họp định kỳ, Admin điểm danh và chốt số liệu tuần.
*   **Cuối tháng:** Admin bấm "Chốt tháng" để vinh danh Top thành viên.

---
*Ghi chú: Bản đồ này giúp đội ngũ nắm rõ: Chúng ta làm gì? Báo cáo ở đâu? AI kiểm tra? Và Điểm số tính như thế nào?*
