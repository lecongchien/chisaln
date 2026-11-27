#!/usr/bin/env bash
set -euo pipefail

# Scream Adaptive Wallpaper — macOS Universal Packager (.app, .pkg, .dmg, .zip)
# Produces:
#   1. Scream-v<ver>-macOS-Universal.pkg  (1-step macOS installer -> /Applications + auto-launch!)
#   2. Scream-v<ver>-macOS-Universal.dmg  (drag-to-Applications disk image)
#   3. Scream-v<ver>-macOS-Universal.zip  (consumed by 1-line install.sh)
#
# Usage:
#   ./host-macos/scripts/package-dmg.sh           # Universal arm64 + x86_64
#   ./host-macos/scripts/package-dmg.sh --local   # Fast single-arch build on current Mac

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
if [[ -n "${SCREAM_VERSION:-}" ]]; then
  APP_VER="${SCREAM_VERSION#v}"
else
  APP_VER="$(grep -o '<Version>[^<]*</Version>' "${ROOT_DIR}/Scream.csproj" | head -n1 | sed -E 's/<\/?Version>//g' || true)"
fi
APP_VER="${APP_VER:-1.0.0}"
SIGN_IDENTITY="${SIGN_IDENTITY:--}"
UPDATE_REPO="${SCREAM_UPDATE_REPO:-lecongchien/chisaln}"
UPDATE_MANIFEST_URL="${SCREAM_UPDATE_MANIFEST_URL:-https://github.com/${UPDATE_REPO}/releases/latest/download/latest.json}"

echo "===================================================================="
echo "  Scream Adaptive Wallpaper — macOS Packager (v${APP_VER})"
echo "===================================================================="

mkdir -p "${DIST_DIR}"
APP_BUNDLE="${DIST_DIR}/${APP_NAME}.app"
rm -rf "${APP_BUNDLE}"

echo "[1/6] Compiling native Swift executable..."
pushd "${MAC_DIR}" >/dev/null
if [[ "${LOCAL_ONLY}" -eq 1 ]]; then
  swift build -c release
  BIN_PATH="$(swift build -c release --show-bin-path)/${APP_NAME}"
  ARCH_TAG="local"
else
  swift build -c release --arch arm64 --arch x86_64
  BIN_PATH="${MAC_DIR}/.build/apple/Products/Release/${APP_NAME}"
  if [[ ! -f "${BIN_PATH}" ]]; then
    swift build -c release --arch arm64
    swift build -c release --arch x86_64
    mkdir -p "${MAC_DIR}/.build/universal"
    lipo -create \
      "${MAC_DIR}/.build/arm64-apple-macosx/release/${APP_NAME}" \
      "${MAC_DIR}/.build/x86_64-apple-macosx/release/${APP_NAME}" \
      -output "${MAC_DIR}/.build/universal/${APP_NAME}"
    BIN_PATH="${MAC_DIR}/.build/universal/${APP_NAME}"
  fi
  ARCH_TAG="Universal"
fi
popd >/dev/null

echo "[2/6] Assembling ${APP_NAME}.app bundle..."
mkdir -p "${APP_BUNDLE}/Contents/MacOS" "${APP_BUNDLE}/Contents/Resources/web"
cp "${BIN_PATH}" "${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"
chmod +x "${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"

# Copy shared web/ assets (excluding dev server script)
rsync -a --delete --exclude='serve.mjs' "${ROOT_DIR}/web/" "${APP_BUNDLE}/Contents/Resources/web/"

echo "[3/6] Generating macOS AppIcon.icns..."
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
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
  <key>ScreamUpdateManifestUrl</key>
  <string>${UPDATE_MANIFEST_URL}</string>
</dict>
</plist>
EOF

echo "[4/6] Signing ${APP_NAME}.app (${SIGN_IDENTITY})..."
if [[ "${SIGN_IDENTITY}" == "-" ]]; then
  codesign --force --deep --sign - "${APP_BUNDLE}"
else
  codesign --force --deep --sign "${SIGN_IDENTITY}" --options runtime --timestamp "${APP_BUNDLE}"
fi
file "${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"

echo "[5/6] Building 1-step auto-launch macOS Installer (.pkg)..."
PKG_PATH="${DIST_DIR}/Scream-v${APP_VER}-macOS-${ARCH_TAG}.pkg"
PKG_ROOT="$(mktemp -d)"
PKG_SCRIPTS="$(mktemp -d)"
mkdir -p "${PKG_ROOT}/Applications"
cp -R "${APP_BUNDLE}" "${PKG_ROOT}/Applications/${APP_NAME}.app"

cat > "${PKG_SCRIPTS}/preinstall" <<'PRE_EOF'
#!/usr/bin/env bash
pkill -x Scream >/dev/null 2>&1 || true
exit 0
PRE_EOF

cat > "${PKG_SCRIPTS}/postinstall" <<'POST_EOF'
#!/usr/bin/env bash
CONSOLE_USER="$(stat -f%Su /dev/console || true)"
if [[ -n "${CONSOLE_USER}" && "${CONSOLE_USER}" != "root" && -d "/Applications/Scream.app" ]]; then
  chown -R "${CONSOLE_USER}" "/Applications/Scream.app" >/dev/null 2>&1 || true
  su -l "${CONSOLE_USER}" -c 'open -a "/Applications/Scream.app"' >/dev/null 2>&1 || true
fi
exit 0
POST_EOF

chmod +x "${PKG_SCRIPTS}/preinstall" "${PKG_SCRIPTS}/postinstall"
rm -f "${PKG_PATH}"
pkgbuild \
  --root "${PKG_ROOT}" \
  --scripts "${PKG_SCRIPTS}" \
  --identifier "${BUNDLE_ID}" \
  --version "${APP_VER}" \
  --install-location "/" \
  "${PKG_PATH}" >/dev/null
rm -rf "${PKG_ROOT}" "${PKG_SCRIPTS}"

echo "[6/6] Building drag-to-Applications DMG and Portable ZIP..."
DMG_PATH="${DIST_DIR}/Scream-v${APP_VER}-macOS-${ARCH_TAG}.dmg"
ZIP_PATH="${DIST_DIR}/Scream-v${APP_VER}-macOS-${ARCH_TAG}.zip"
rm -f "${DMG_PATH}" "${ZIP_PATH}"

ditto -c -k --sequesterRsrc --keepParent "${APP_BUNDLE}" "${ZIP_PATH}"

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
echo "    PKG: ${PKG_PATH} ($(du -h "${PKG_PATH}" | awk '{print $1}'))"
echo "    DMG: ${DMG_PATH} ($(du -h "${DMG_PATH}" | awk '{print $1}'))"
echo "    ZIP: ${ZIP_PATH} ($(du -h "${ZIP_PATH}" | awk '{print $1}'))"
echo "===================================================================="
