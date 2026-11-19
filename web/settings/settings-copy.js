/**
 * Localized UI copy (Vietnamese / English) and high-res Studio Ghibli
 * painted thumbnail artwork references for the Settings presentation layer.
 */
export const COPY = {
  vi: {
    running: 'Đang chạy trên desktop',
    paused: 'Đang tạm dừng',
    previewOnly: 'Chế độ xem trước',
    iconsFmt: (n) => `${n} biểu tượng`,
    dragBadge: 'Kéo icon để thử',
    syncedBadge: (n) => `Đồng bộ · ${n} icon`,
    dragHint: 'Kéo thả các biểu tượng mẫu trong khung để xem địa hình tự uốn theo.',
    syncedHint: 'Xem trước đồng bộ theo bố cục icon trên desktop của bạn.',
    pause: 'Tạm dừng',
    resume: 'Tiếp tục',
    reload: 'Tải lại',
    hideTray: 'Ẩn xuống khay',
    fullscreen: 'Toàn màn hình',
    sharePng: 'Lưu ảnh',
    shareVideo: 'Clip 4s',
    systemGroup: 'Hệ thống',
    recording: 'Đang quay 4s...',
    capturing: 'Đang lưu...',
    themesHeading: 'Chủ đề thích ứng',
    customize: 'Tùy chỉnh cảnh quan',
    reset: 'Mặc định',
    autopause: 'Tự động tạm dừng khi mở toàn màn hình',
    autopauseHint: 'Đưa tải GPU về gần 0% khi phóng to ứng dụng hoặc chơi game',
    multimon: 'Phủ tất cả màn hình',
    multimonHint: (n) => n > 1 ? `Phát hiện ${n} màn hình — mỗi màn hình thích ứng độc lập` : 'Tự động bật khi kết nối thêm màn hình phụ',
    autostart: 'Khởi động cùng Windows',
    autostartHint: 'Tự chạy ngầm trong khay hệ thống khi mở máy',
    resetToast: 'Đã khôi phục thông số mặc định cho chủ đề hiện tại.',
    reloadToast: 'Đã tải lại chủ đề trên desktop.',
    shareOk: (name) => `Đã lưu an toàn: ${name}`,
    shareFail: (err) => `Không thể xuất tệp: ${err}`,
    openFolder: 'Mở tệp',
    hostRequired: 'Tính năng lưu trực tiếp hoạt động khi chạy qua ứng dụng Scream.exe.'
  },
  en: {
    running: 'Live on desktop',
    paused: 'Paused',
    previewOnly: 'Browser preview',
    iconsFmt: (n) => `${n} icons`,
    dragBadge: 'Drag icons to test',
    syncedBadge: (n) => `Synced · ${n} icons`,
    dragHint: 'Drag sample icons inside the preview to watch the terrain reshape live.',
    syncedHint: 'Live preview mirrored from your real desktop icon layout.',
    pause: 'Pause',
    resume: 'Resume',
    reload: 'Reload',
    hideTray: 'Hide to Tray',
    fullscreen: 'Full Screen',
    sharePng: 'Snapshot',
    shareVideo: '4s Clip',
    systemGroup: 'System',
    recording: 'Recording 4s...',
    capturing: 'Saving...',
    themesHeading: 'Adaptive Themes',
    customize: 'Scene Parameters',
    reset: 'Reset',
    autopause: 'Auto-pause on maximized / full-screen apps',
    autopauseHint: 'Drops GPU usage near zero whenever desktop is covered',
    multimon: 'Extend across all monitors',
    multimonHint: (n) => n > 1 ? `${n} displays detected — each adapts independently` : 'Automatically activates when extra displays connect',
    autostart: 'Launch on Windows sign-in',
    autostartHint: 'Starts silently in the system tray',
    resetToast: 'Restored default parameters for this theme.',
    reloadToast: 'Reloaded desktop wallpaper.',
    shareOk: (name) => `Saved privacy-safe export: ${name}`,
    shareFail: (err) => `Export failed: ${err}`,
    openFolder: 'Reveal File',
    hostRequired: 'Direct disk export runs inside Scream.exe.'
  }
};

export const THEME_THUMBS = {
  beach: './assets/thumb-beach.jpg',
  meadow: './assets/thumb-meadow.jpg',
  castle: './assets/thumb-castle.jpg'
};

export const THEME_SUBTITLES = {
  beach: {
    vi: 'Bờ cát uốn quanh icon · Dừa & Kayak',
    en: 'Shore wraps icons · Palms & Kayak'
  },
  meadow: {
    vi: 'Mây ôm icon · Thả diều & Đêm trăng',
    en: 'Clouds frame icons · Kite & Moon'
  },
  castle: {
    vi: 'Núi tuyết Alps · Lâu đài & Đàn cừu',
    en: 'Alps panorama · Castle & Sheep'
  }
};
