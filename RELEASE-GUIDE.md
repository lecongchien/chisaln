# Hướng Dẫn Phát Hành & Tự Động Cập Nhật (Windows + macOS)

Ứng dụng **Scream** phát hành và tự cập nhật trực tiếp từ repo công khai **`lecongchien/chisaln`** — **không cần repo phụ, không cần Token hay Secret**.

---

## 1. Cách phát hành bản mới (1 bước duy nhất)

Chạy [release.cmd](release.cmd) từ PowerShell (hoặc nhấp đúp):

```powershell
.\release.cmd
# hoặc truyền thẳng số phiên bản:
.\release.cmd 1.0.2
```

Script tự động làm trọn gói:
1. Tăng `<Version>` trong `Scream.csproj`.
2. Commit toàn bộ thay đổi lên `main`.
3. Gắn tag `vX.Y.Z` và đẩy lên GitHub.
4. GitHub Actions (`.github/workflows/release.yml`) tự build **Windows x64** (`.exe` + `.zip`) + **macOS Universal** (`.pkg` + `.dmg` + `.zip`), tạo `latest.json` + SHA-256 và đăng trực tiếp vào `https://github.com/lecongchien/chisaln/releases`.

---

## 2. Phía người dùng cập nhật

- **Cả Windows và macOS:** mở **Scream → tab Hệ thống → Kiểm tra** (hoặc bật **Tự động cập nhật**). App tự tải từ `https://github.com/lecongchien/chisaln/releases/latest/download/latest.json`, kiểm tra SHA-256 và tự cài đè + khởi động lại.
- **Cài mới nhanh 1 dòng trên macOS:**
  ```bash
  curl -fsSL https://raw.githubusercontent.com/lecongchien/chisaln/main/host-macos/scripts/install.sh | bash
  ```
