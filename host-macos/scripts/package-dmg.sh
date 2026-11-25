#!/usr/bin/env bash
set -euo pipefail

# Scream Adaptive Wallpaper — macOS .app & .dmg Universal Packager (Apple Silicon + Intel)
# Runs natively on any Mac with Xcode Command Line Tools (or on GitHub Actions macos-latest).
# Usage:
#   ./host-macos/scripts/package-dmg.sh           # Universal arm64 + x86_64 .app + .dmg
#   ./host-macos/scripts/package-dmg.sh --local   # Fast single-arch build for current Mac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAC_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${MAC_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"

LOCAL_ONLY=0
if [[ "${1:-}" == "--local" ]]; then
  LOCAL_ONLY=1
fi

APP_NAME="Scream"
BUNDLE_ID="com.scream.wallpaper"
APP_VER="$(grep -o '<Version>[^<]*</Version>' "${ROOT_DIR}/Scream.csproj" | head -n1 | sed -E 's/<\/?Version>//g' || true)"
APP_VER="${APP_VER:-1.0.0}"
SIGN_IDENTITY="${SIGN_IDENTITY:--}"

echo "===================================================================="
echo "  Scream Adaptive Wallpaper — macOS App & DMG Packager (v${APP_VER})"
echo "===================================================================="

mkdir -p "${DIST_DIR}"
APP_BUNDLE="${DIST_DIR}/${APP_NAME}.app"
rm -rf "${APP_BUNDLE}"

echo "[1/5] Compiling native Swift executable..."
pushd "${MAC_DIR}" >/dev/null
if [[ "${LOCAL_ONLY}" -eq 1 ]]; then
  swift build -c release
  BIN_PATH="$(swift build -c release --show-bin-path)/${APP_NAME}"
  DMG_ARCH="local"
else
  swift build -c release --arch arm64 --arch x86_64
  BIN_PATH="${MAC_DIR}/.build/apple/Products/Release/${APP_NAME}"
  if [[ ! -f "${BIN_PATH}" ]]; then
    # Fallback manual lipo if SwiftPM places arch builds separately
    swift build -c release --arch arm64
    swift build -c release --arch x86_64
    mkdir -p "${MAC_DIR}/.build/universal"
    lipo -create \
      "${MAC_DIR}/.build/arm64-apple-macosx/release/${APP_NAME}" \
      "${MAC_DIR}/.build/x86_64-apple-macosx/release/${APP_NAME}" \
      -output "${MAC_DIR}/.build/universal/${APP_NAME}"
    BIN_PATH="${MAC_DIR}/.build/universal/${APP_NAME}"
  fi
  DMG_ARCH="Universal"
fi
popd >/dev/null

echo "[2/5] Assembling ${APP_NAME}.app bundle..."
mkdir -p "${APP_BUNDLE}/Contents/MacOS" "${APP_BUNDLE}/Contents/Resources/web"
cp "${BIN_PATH}" "${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"
chmod +x "${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"

# Copy full shared web/ assets (excluding dev server script)
rsync -a --delete --exclude='serve.mjs' "${ROOT_DIR}/web/" "${APP_BUNDLE}/Contents/Resources/web/"

echo "[3/5] Generating macOS AppIcon.icns..."
ICON_SRC="${MAC_DIR}/Resources/AppIcon-1024.png"
if [[ -f "${ICON_SRC}" ]]; then
  ICONSET_DIR="$(mktemp -d)/AppIcon.iconset"
  mkdir -p "${ICONSET_DIR}"
  for sz in 16 32 128 256 512; do
    sips -z "${sz}" "${sz}" "${ICON_SRC}" --out "${ICONSET_DIR}/icon_${sz}x${sz}.png" >/dev/null
    sz2=$((sz * 2))
    sips -z "${sz2}" "${sz2}" "${ICON_SRC}" --out "${ICONSET_DIR}/icon_${sz}x${sz}@2x.png" >/dev/null
  done
  iconutil -c icns "${ICONSET_DIR}" -o "${APP_BUNDLE}/Contents/Resources/AppIcon.icns"
  rm -rf "$(dirname "${ICONSET_DIR}")"
fi

cat > "${APP_BUNDLE}/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>Scream</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Scream Adaptive Wallpaper</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${APP_VER}</string>
  <key>CFBundleVersion</key>
  <string>${APP_VER}</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSAppleEventsUsageDescription</key>
  <string>Scream reads macOS Desktop icon positions from Finder so live wallpapers adapt smoothly around your icons.</string>
</dict>
</plist>
EOF

echo "[4/5] Signing ${APP_NAME}.app (${SIGN_IDENTITY})..."
if [[ "${SIGN_IDENTITY}" == "-" ]]; then
  codesign --force --deep --sign - "${APP_BUNDLE}"
else
  codesign --force --deep --sign "${SIGN_IDENTITY}" --options runtime --timestamp "${APP_BUNDLE}"
fi
file "${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"

echo "[5/5] Creating drag-to-Applications DMG..."
DMG_PATH="${DIST_DIR}/Scream-v${APP_VER}-macOS-${DMG_ARCH}.dmg"
rm -f "${DMG_PATH}"
DMG_STAGE="$(mktemp -d)"
cp -R "${APP_BUNDLE}" "${DMG_STAGE}/"
ln -s /Applications "${DMG_STAGE}/Applications"
hdiutil create \
  -volname "Scream ${APP_VER}" \
  -srcfolder "${DMG_STAGE}" \
  -ov -format UDZO \
  "${DMG_PATH}" >/dev/null
rm -rf "${DMG_STAGE}"

echo "===================================================================="
echo "  DONE! Ready to install on macOS:"
echo "    App: ${APP_BUNDLE}"
echo "    DMG: ${DMG_PATH} ($(du -h "${DMG_PATH}" | awk '{print $1}'))"
echo "===================================================================="
