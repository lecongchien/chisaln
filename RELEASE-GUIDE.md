# Hướng Dẫn Phát Hành & Tự Động Cập Nhật (Windows + macOS)

Tài liệu này ghi chú cách cấu hình 1 lần duy nhất cho repo **Private** (`lecongchien/chisaln`) và quy trình tung bản cập nhật để ứng dụng **Scream** trên máy tính tự động tải về và cập nhật.

---

## 1. Cấu hình 1 lần duy nhất trên GitHub

Vì mã nguồn đang ở repo **Private** (`lecongchien/chisaln`), ứng dụng không nhúng GitHub Token mà lấy file cài đặt qua một repo **Public rỗng** (chỉ chứa file build và `latest.json`, tuyệt đối không chứa source code).

1. **Tạo repo Public phân phối bản dựng:**
   - Tạo repo mới trên GitHub để ở chế độ **Public** với tên mặc định: `lecongchien/chisaln-releases`
   - *(Nếu muốn đặt tên repo khác, vào repo Private `lecongchien/chisaln` → **Settings → Secrets and variables → Actions → Variables** → tạo biến `RELEASE_REPO` với giá trị `owner/ten-repo-moi`.)*

2. **Tạo Fine-grained Personal Access Token:**
   - Vào **GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - **Repository access:** Chọn **Only select repositories** → chọn duy nhất `lecongchien/chisaln-releases`.
   - **Repository permissions:** Mở rộng **Contents** → chọn **Read and write**.
   - Bấm **Generate token** và copy chuỗi token vừa tạo.

3. **Lưu token vào repo Private:**
   - Vào repo Private `lecongchien/chisaln` → **Settings → Secrets and variables → Actions → Secrets**.
   - Bấm **New repository secret**:
     - **Name:** `RELEASE_REPO_TOKEN`
     - **Secret:** Dán token ở bước 2 → **Add secret**.

---

## 2. Cách phát hành bản cập nhật mới

> **Lưu ý:** Khi bạn `git push origin main` bình thường, code chỉ được lưu lên GitHub — **không** build và **không** tự cập nhật sang máy người dùng. Bản cập nhật chỉ được tung ra khi có tag bắt đầu bằng `v` (ví dụ `v1.0.1`).

### Cách 1: Chạy `release.cmd` (Khuyên dùng — 1 bước)

1. Mở thư mục `d:\chisaln\app` và **nhấp đúp chuột** vào file `release.cmd`, hoặc mở Terminal/PowerShell tại `d:\chisaln\app` và chạy:
   ```powershell
   .\release.cmd
   ```
   *(Hoặc truyền trực tiếp phiên bản: `.\release.cmd 1.0.1`)*

2. Khi màn hình hỏi phiên bản mới:
   ```text
   Current version in Scream.csproj: 1.0.0
   Enter release version [Enter = 1.0.1]:
   ```
   → **Nhấn Enter** để nhận phiên bản gợi ý tiếp theo, hoặc gõ số phiên bản bạn muốn (ví dụ `1.1.0`) rồi nhấn Enter.

3. `release.cmd` sẽ tự động làm trọn gói 4 việc:
   - Cập nhật `<Version>` trong `Scream.csproj`.
   - `git add -A` và `git commit -m "Release v1.0.1"`.
   - Gắn tag `v1.0.1`.
   - Đẩy cả `main` và tag `v1.0.1` lên GitHub.

### Cách 2: Đẩy tag `v*` thủ công bằng lệnh Git

Nếu bạn đã tự commit và push code lên `main`, khi muốn phát hành chỉ cần chạy:

```powershell
git tag v1.0.1
git push origin v1.0.1
```

---

## 3. Chuyện gì diễn ra sau khi chạy?

1. **GitHub Actions** (`.github/workflows/release.yml`) tự động chạy (~2–3 phút):
   - Build Windows: `Scream-vX.Y.Z-Setup-x64.exe` và `Scream-vX.Y.Z-Portable-x64.zip`.
   - Build macOS Universal (Apple Silicon + Intel): `.pkg`, `.dmg`, `.zip`.
   - Tính **SHA-256** cho mọi tệp, tạo `latest.json` và `checksums.txt`.
   - Đẩy toàn bộ bộ cài + `latest.json` lên `lecongchien/chisaln-releases`.
2. **Theo dõi tiến độ & kết quả:**
   - Tiến độ build: `https://github.com/lecongchien/chisaln/actions`
   - Trang phát hành công khai: `https://github.com/lecongchien/chisaln-releases/releases`
   - Manifest tự cập nhật: `https://github.com/lecongchien/chisaln-releases/releases/latest/download/latest.json`
3. **Ứng dụng trên máy người dùng (Windows & macOS):**
   - Kiểm tra `latest.json` sau khi khởi động 15 giây và định kỳ mỗi 4 giờ (hoặc bấm **Cài đặt → Hệ thống → Kiểm tra** / menu Khay hệ thống / Menu Bar).
   - Khi có bản mới và bật **Tự động cập nhật**: tự tải ngầm → xác thực **SHA-256** → tự cài đè và khởi động lại bản mới.

---

## 4. Lưu ý quan trọng

- **Cài tay 1 lần cuối bản đầu tiên có Auto-Update:** Bản `v1.0.0` cũ trước đây chưa có mô-đun tự cập nhật. Sau khi phát hành `v1.0.1`, hãy tải và cài tay bản `v1.0.1` một lần duy nhất. Từ `v1.0.2` trở đi ứng dụng sẽ hoàn toàn tự cập nhật.
- **Môi trường phát triển (Dev):** Khi chạy trực tiếp từ thư mục code (`dotnet run` / `swift run`), app vẫn cho kiểm tra bản mới nhưng **không** tự ghi đè mã nguồn đang phát triển.
- **Test cục bộ với `latest.json` giả lập:** Bạn có thể đặt biến môi trường `SCREAM_UPDATE_URL` trỏ về server local trước khi chạy app, ví dụ:
  ```powershell
  $env:SCREAM_UPDATE_URL = "http://127.0.0.1:8080/latest.json"
  .\bin\Release\net8.0-windows\Scream.exe
  ```
