#!/usr/bin/env bash
# Снимает скриншоты для App Store в демо-режиме: отладочная сборка с
# заготовленными данными, без сети и без настоящих учёток.
#
# App Store требует снимки iPhone 6.9″ (1320×2868) — берём симулятор Pro Max.
# Запуск на Mac из apps/ios после `xcodegen generate`.
set -euo pipefail

out="fastlane/screenshots/ru"
bundle="team.burcev.app"

udid=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
best = None
for runtime, items in devices.items():
    if "iOS" not in runtime:
        continue
    for d in items:
        if "Pro Max" in d["name"]:
            best = d["udid"]
print(best or "")')
[ -n "$udid" ] || { echo "нет симулятора iPhone Pro Max" >&2; exit 1; }
echo "симулятор: $udid"

xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b
xcrun simctl ui "$udid" appearance light
xcrun simctl status_bar "$udid" override --time "9:41" --dataNetwork wifi --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100

xcodebuild build -project Burcev.xcodeproj -scheme Burcev -configuration Debug \
  -destination "id=$udid" -derivedDataPath build/dd CODE_SIGNING_ALLOWED=NO -quiet
app=$(find build/dd/Build/Products/Debug-iphonesimulator -maxdepth 1 -name 'Burcev.app' | head -n1)
xcrun simctl install "$udid" "$app"

rm -rf "$out" && mkdir -p "$out"

shot() {
  local name="$1" role="$2" screen="$3"
  xcrun simctl terminate "$udid" "$bundle" 2>/dev/null || true
  xcrun simctl launch "$udid" "$bundle" -demo "$role" -demoScreen "$screen" >/dev/null
  sleep 5
  xcrun simctl io "$udid" screenshot "$out/$name.png" >/dev/null
  echo "снят $name"
}

shot "01_today" client today
shot "02_diary" client diary
shot "03_chat" client chat
shot "04_clients" curator clients
shot "05_client" curator client
shot "06_profile" client profile

python3 - "$out" <<'EOF'
import struct, sys, pathlib
for p in sorted(pathlib.Path(sys.argv[1]).glob("*.png")):
    w, h = struct.unpack(">II", p.read_bytes()[16:24])
    print(f"{p.name}: {w}×{h}")
EOF
