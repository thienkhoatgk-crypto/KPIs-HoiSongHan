# HƯỚNG DẪN VẬN HÀNH HỆ THỐNG KPI SÔNG HÀN

## 1. Kết nối GitHub & Đưa website lên internet

Để website của bạn có thể truy cập được bởi mọi người tại `kpissonghan.online`, bạn cần thực hiện "Cầu nối" 3 bước sau:

### BƯỚC A: Đẩy code từ AI Studio lên GitHub (Quan trọng nhất)
1. Tại giao diện **AI Studio** này, nhấn vào **Menu (biểu tượng 3 gạch ngang)** ở góc trên bên trái.
2. Chọn **"Export to GitHub"**.
3. Nếu chưa kết nối GitHub, AI Studio sẽ yêu cầu bạn cấp quyền (Authorize).
4. Chọn repository (kho lưu trữ) tên là `KPIs-HoiSongHan` (hoặc tạo mới nếu chưa có).
5. Sau khi đẩy xong, code của bạn đã nằm an toàn trên GitHub.

### BƯỚC B: Kết nối Firebase App Hosting với GitHub
1. Truy cập [Firebase Console](https://console.firebase.google.com/).
2. Chọn dự án **kpissonghan**.
3. Trong menu bên trái, tìm mục **Kỹ thuật (Build)** > **App Hosting**.
4. Tại tab **Backend**, bạn sẽ thấy nút **"KẾT NỐI VỚI GITHUB"** (Connect to GitHub).
5. Chọn tài khoản GitHub của bạn và chọn đúng Repo `KPIs-HoiSongHan`.
6. **LƯU Ý QUAN TRỌNG (Sửa lỗi Build):** Trong quá trình thiết lập, nếu thấy mục **Root Directory**, hãy đảm bảo nhập là `/`. TUYỆT ĐỐI không để đường dẫn máy tính cá nhân (D:\...) vào đây.
7. Làm theo các bước mặc định cho đến khi hoàn tất.
8. **KẾT QUẢ:** Kể từ bây giờ, mỗi khi bạn nhấn "Export to GitHub" bên AI Studio, website `kpissonghan.online` sẽ tự động cập nhật bản mới nhất sau vài phút!

### BƯỚC C: Cấu hình Tên miền (DNS)
1. Sau khi BƯỚC B hoàn tất, Firebase sẽ cung cấp cho bạn các bản ghi A và TXT.
2. Bạn truy cập trang quản lý tên miền (iNet, Mắt Bão...) và nhập vào:
   - **Loại A:** Trỏ `@` về `199.36.158.100`
   - **Loại TXT:** Trỏ `@` về `hosting-site=kpissonghan`
   - **Loại CNAME:** Trỏ `www` về `kpissonghan.online`

---

## 2. Các lỗi thường gặp khi triển khai (Troubleshooting)

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| **Invalid Root Directory** | Điền sai đường dẫn ổ đĩa vào Firebase | Vào Backend Settings > Đổi Root Directory thành `/` |
| **Compilation failed** | Sai cấu hình Build hoặc tên nhánh | Kiểm tra tab **Deployments** trong App Hosting, click vào build bị lỗi để xem Build Logs. Đảm bảo nhánh chính tên là `main`. |
| **Requires configuration** | Đã thêm tên miền nhưng chưa trỏ DNS | Click vào chữ này, lấy bản ghi: Loại A -> `199.36.158.100`, loại TXT -> `hosting-site=kpissonghan`. |
| **Site Not Found** | DNS chưa cập nhật hoặc cấu hình sai | Cần chờ 15p - 2h để DNS cập nhật. Kiểm tra xem đã **Xóa** các bản ghi cũ chưa. |

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
1. **Export Code:** Đẩy code từ AI Studio lên Repo GitHub.
2. **Kích hoạt Hosting:** Chọn Backend `kpissonghan` > Nhấn **"Create rollout"**.
3. **Bảng Create rollout (Tạo bản triển khai):** 
   - **BẮT BUỘC:** Chọn dòng đầu tiên: **"Lần cập nhật cuối cùng"** (Latest update).
   - **TUYỆT ĐỐI KHÔNG** nhập ID cơ sở dữ liệu (`ai-studio-kpisnghn...`) vào ô "Nhập ID của commit". Ô đó để trống.
   - Nhấn **"Tạo nên"**.
4. **KẾT NỐI TÊN MIỀN (Sửa lỗi Site Not Found):**
   - Vào **App Hosting** > Chọn backend `kpissonghan`.
   - Sang tab **Cài đặt (Settings)** > **Tên miền tùy chỉnh (Custom domains)**.
   - Nhấn **Thêm tên miền** (Add domain) và nhập `kpissonghan.online`.
   - CẬP NHẬT DNS: Sử dụng mã IP/CNAME mà Firebase cung cấp tại đây để cập nhật vào trang quản lý tên miền (iNet, Mắt Bão...).
5. **KIỂM TRA QUYỀN TRUY CẬP (Firestore vs Storage):**
   - **Firestore Database (Lưu dữ liệu):** Bạn PHẢI chọn đúng database ID `ai-studio-kpisnghnconstruc...` ở dòng trên cùng (không dùng default). Sang tab Rules và Publish.
   - **Storage (Lưu ảnh):** Bạn đã cấu hình đúng trong ảnh gửi cho tôi.
6. **PHÂN QUYỀN TRÊN GOOGLE (IAM):**
   - **Người sở hữu (Owner):** Quyền cao nhất cho sếp.
   - **Nhân viên (Staff):** **KHÔNG CẦN thêm vào trang này.** Họ chỉ cần đăng nhập thẳng vào website `kpissonghan.online`.

6. **GIẢI QUYẾT LỖI TRUY CẬP (Firestore Permission):**
   - Vào Firestore Database.
   - **QUAN TRỌNG:** Ở phía trên cùng, nếu thấy chữ `(default)`, bạn PHẢI nhấn vào đó và chọn đúng database có ID dài bắt đầu bằng: `ai-studio-kpisnghnconstruc-...`.
   - Sang tab **Rules**, copy luật bảo mật từ AI Studio dán vào (nếu thấy khác) và nhấn **Publish**.

## 6. Danh sách DNS chuẩn (Vận hành vĩnh viễn)
Để trang web chạy ổn định, bản ghi DNS tại trang quản lý tên miền (inet, matbao, tenten...) phải như sau:
- **A Record:** `@` trỏ về `199.36.158.100` (XÓA cái cũ `151.101.1.195`)
- **TXT Record:** `@` trỏ về `hosting-site=kpissonghan`
- **CNAME Record:** `www` trỏ về `kpissonghan.online` (Nếu cần dùng www)

**LƯU Ý:** Sau khi cập nhật DNS, có thể mất vài tiếng để tên miền hoạt động chính thức. Nếu Firebase báo "Enregistrements pas encore détectés" (Chưa nhận diện được), hãy nhấn nút **Valider** (Xác nhận) sau mỗi 1 tiếng.

---
*Bản quyền thuộc về Hội Xây Dựng Sông Hàn - 2026*
