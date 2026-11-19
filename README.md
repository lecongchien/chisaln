# Scream — Ứng Dụng Hình Nền Thích Ứng Theo Icon Desktop (Windows 10/11)

**Scream** là ứng dụng hình nền động thích ứng (adaptive live wallpaper) viết sạch từ đầu theo **Clean Architecture** kết hợp **C# (.NET 8 WinForms + Win32 API)** và **WebView2 (WebGL2 ES Modules)**. Hình nền tự động tính toán trường khoảng cách (SDF) và uốn nắn cảnh quan bao quanh từng biểu tượng trên màn hình desktop theo thời gian thực — chạy cục bộ 100%, không cần tài khoản, tối ưu 30–60 FPS linh hoạt trên GPU tích hợp.

## Tính năng nổi bật
- **3 chủ đề thích ứng hoàn chỉnh:**
  - **Bãi biển & Đảo cát (`beach.html`):** Đường bờ biển gouache/print-stipple tự uốn quanh icon, 3 lớp sóng xô bờ + bọt Worley, bãi cạn ngọc bích chuyển sang biển sâu lấp lánh, rặng dừa màu nước đung đưa, thuyền kayak tự chèo né đảo và đàn hải âu bay phía trên tán lá.
  - **Đồng cỏ & Mây (`meadow.html`):** Đồng cỏ màu nước Studio Ghibli với chế độ **Ban ngày / Đêm ánh trăng / Tự động theo giờ** (ao nước phản chiếu bóng trăng khuyết gợn sóng, sương đêm, đom đóm, vệt gió thoảng), mây tích 3 tầng bọc quanh icon, cậu bé thả diều cử động tay chạy tự do 360° và chú mèo đen nằm nắng.
  - **Lâu đài trên đồi gió (`castle.html`):** Thảo nguyên núi tuyết Alps phong cách *Howl's Moving Castle* với 4 chế độ thời gian (**Ngày / Hoàng hôn / Đêm sao / Tự động**), lâu đài cơ khí vẽ tay 4 chân sắt IK bước đi nhả khói dọc sống đồi, nhà tranh tường đá, người chăn cừu & đàn cừu trắng tự né icon.
- **Tương thích cả Windows 10/11 cũ và Windows 11 24H2+:**
  - Tự nhận diện môi trường để gắn qua `WorkerW` cổ điển (Win10 / Win11 trước 24H2) hoặc `Progman` Layered Child Window (`WS_EX_LAYERED` + `SetWinEventHook` + `EnsureZOrder`, Win11 24H2+).
  - Hỗ trợ **một màn hình** hoặc **phủ toàn bộ đa màn hình** (mỗi màn hình tự đọc icon và dựng địa hình riêng).
- **Đọc tọa độ icon riêng tư (`IconReader`):** Quét `SysListView32` mỗi 400ms bằng `LVM_GETITEMRECT` (`LVIR_BOUNDS`), chỉ đọc 4 tọa độ hình chữ nhật — tuyệt đối không đọc tên file hay nội dung file.
- **Tự động tạm dừng (Auto-Pause):** Kiểm tra cửa sổ đang mở (loại trừ cửa sổ ẩn và `DWMWA_CLOAKED`) để đưa tải GPU về ~0% khi phóng to ứng dụng hoặc chơi game toàn màn hình.
- **Cửa sổ Cài đặt phong cách Apple macOS & Chia sẻ an toàn:** Xem trước trực tiếp đồng bộ theo icon thật, hỗ trợ xem toàn màn hình (`Toàn màn hình`), chỉnh toàn bộ thông số tức thời, song ngữ Việt/Anh, xuất ảnh PNG hoặc quay clip 4 giây bằng icon minh họa giả lập (không lộ tên file thật).

## Phím tắt toàn cục
| Phím tắt | Chức năng |
| --- | --- |
| `Ctrl + Alt + M` | Mở / đưa cửa sổ Cài đặt lên trước |
| `Ctrl + Alt + N` | Bật/tắt nhanh chế độ **Đêm ánh trăng** (tự chuyển sang Đồng cỏ nếu cần) |
| `Ctrl + Alt + H` | Tạm dừng / Tiếp tục hình nền động |

## Cách biên dịch & chạy

### 1. Build và chạy ứng dụng Windows đầy đủ
```powershell
dotnet build -c Release
.\bin\Release\net8.0-windows\Scream.exe
```

### 2. Các tham số dòng lệnh
| Tham số | Chức năng |
| --- | --- |
| *(không tham số)* | Khởi chạy hình nền và mở cửa sổ Cài đặt (nếu đã chạy thì mở lại cửa sổ Cài đặt). |
| `--autostart` | Khởi chạy ngầm trong khay hệ thống, không hiện cửa sổ Cài đặt. |
| `--settings` | Mở cửa sổ Cài đặt của phiên bản đang chạy. |
| `--menu` | Mở menu khay hệ thống tại vị trí con trỏ chuột. |
| `--exit` | Thoát an toàn và khôi phục ngay hình nền gốc của Windows. |

### 3. Xem trước nhanh phần Web (không cần build C#)
```powershell
node web/serve.mjs
# Mở http://127.0.0.1:5178/settings.html trên trình duyệt (kéo thả icon mẫu trực tiếp để thử địa hình)
```

## Kiến trúc Clean Architecture

```text
d:\scream\
├── Scream.csproj                        # .NET 8 WinForms (x64, PerMonitorV2, WebView2)
├── host/                                # Native Windows Host (Clean Architecture 4 tầng)
│   ├── Program.cs                       # Composition Root (single-instance Mutex + DI wiring)
│   ├── app.manifest                     # PerMonitorV2 DPI manifest
│   ├── Domain/
│   │   └── Models.cs                    # AppSettings, ThemeManifest, ThemeDefinition
│   ├── Application/
│   │   ├── ISettingsRepository.cs       # Port lưu trữ cấu hình & manifest
│   │   ├── IpcCommandServer.cs          # NamedPipe IPC server/client
│   │   └── WallpaperCoordinator.cs      # Điều phối vòng đời wallpaper, settings, hotkey, tray
│   ├── Infrastructure/
│   │   ├── AppLogger.cs                 # File logger cục bộ (%LOCALAPPDATA%\Scream)
│   │   ├── DesktopAttacher.cs           # Win10 WorkerW & Win11 24H2+ Raised Progman attacher
│   │   ├── ForegroundMonitor.cs         # Phát hiện cửa sổ toàn màn hình/phóng to để auto-pause
│   │   ├── GlobalHotkeyManager.cs       # Đăng ký & điều phối phím tắt toàn cục Win32
│   │   ├── IconReader.cs                # Đọc bounding rect của Desktop SysListView32
│   │   ├── Native.cs                    # Win32 / DWM / Kernel32 P/Invoke bindings
│   │   └── SettingsRepository.cs        # Triển khai ISettingsRepository (JSON + HKCU Registry)
│   └── Presentation/
│       ├── AppIconFactory.cs            # Tạo icon thương hiệu bằng GDI+
│       ├── SettingsForm.cs              # Cửa sổ Cài đặt WebView2 + hỗ trợ fullscreen thật
│       ├── TrayController.cs            # NotifyIcon & ContextMenuStrip song ngữ
│       └── WallpaperForm.cs             # Surface WebView2 gắn sau lớp icon desktop
└── web/                                 # WebGL2 Frontend (Native ES Modules, Zero Build Step)
    ├── core/
    │   ├── field-engine.js              # Adaptive SDF engine (Gaussian Metaball -> R16F) & WebGL2 utils
    │   ├── host-bridge.js               # Giao tiếp WebView2 / postMessage / PNG & WebM exporter
    │   └── theme-shell.css              # CSS nền dùng chung cho các theme entry
    ├── settings/
    │   ├── settings.css                 # Giao diện Cài đặt phong cách Apple macOS
    │   ├── settings-copy.js             # Từ điển VI/EN & SVG artwork chủ đề
    │   └── settings-app.js              # Controller giao diện Cài đặt & đồng bộ preview
    ├── themes/
    │   ├── beach/
    │   │   ├── beach-shader.js          # Shader đại dương gouache, swash, kayak, hải âu & cây dừa
    │   │   ├── palm-atlas.js            # Đóng gói atlas cây dừa màu nước & bố trí theo SDF
    │   │   └── beach-scene.js           # Scene controller chủ đề Bãi biển
    │   ├── meadow/
    │   │   ├── meadow-shader.js         # Shader đồng cỏ, mây Ghibli, ao phản chiếu trăng & gió
    │   │   ├── cloud-grid.js            # Xây dựng lưới băm không gian 64px RGBA32F cho mây 3 tầng
    │   │   ├── meadow-kitten.js         # Texture & vi chuyển động chú mèo đen
    │   │   ├── meadow-boy.js            # Cậu bé thả diều, khớp tay, sinh cơ học chạy 3D & diều 360°
    │   │   ├── meadow-wind.js           # Bộ lập lịch vệt gió mảnh thoáng qua kiểu Studio Ghibli
    │   │   └── meadow-scene.js          # Scene controller chủ đề Đồng cỏ & chu kỳ ngày/đêm
    │   └── castle/
    │       ├── castle-shader.js         # Shader núi tuyết Alps, biển mây, hoàng hôn/đêm sao & đồi cỏ
    │       ├── castle-walker.js         # Lâu đài di động vẽ tay + 4 chân cơ khí IK & khói ống khói
    │       ├── castle-flock.js          # Nhà tranh tường đá, người chăn cừu & đàn cừu tự né icon
    │       └── castle-scene.js          # Scene controller chủ đề Lâu đài trên đồi gió
    ├── assets/                          # Tài nguyên hình ảnh vẽ tay màu nước / Studio Ghibli
    ├── themes.json                      # Danh mục chủ đề & lược đồ thông số
    ├── beach.html                       # Entry shell chủ đề Bãi biển
    ├── meadow.html                      # Entry shell chủ đề Đồng cỏ
    ├── castle.html                      # Entry shell chủ đề Lâu đài trên đồi gió
    ├── settings.html                    # Entry shell cửa sổ Cài đặt
    └── serve.mjs                        # Máy chủ tĩnh cục bộ xem trước nhanh
```
