#!/usr/bin/env bash
# Снимает скриншоты для App Store: отладочная Dev-сборка в сценарии UI-тестов
# (-uiTestScenario, Vzvesheno/Support/UITestScenario.swift) — заготовленные
# ответы, без сети и без настоящих учёток. `-uiTestShot <экран>`
# (UITestScenario+Screenshots.swift) открывает экран сразу после запуска и
# включает данные витрины.
#
# App Store требует снимки iPhone 6.9″ (1320×2868) — берём симулятор Pro Max.
# Имена 01_…08_ задают порядок на странице (deliver сортирует по имени).
# Запуск на Mac из apps/ios после `xcodegen generate`.
#
# Фото тарелки — scripts/screenshots/plate.jpg, CC0:
# https://commons.wikimedia.org/wiki/File:Chicken_breast,_roasted_with_garlic_olive_oil_and_black_pepper,_on_fried_rice_and_peas_with_soy_sauce_-_Massachusetts.jpg
# (EXIF с координатами снят). В сборку не входит: скрипт кладёт его в
# контейнер приложения.
set -euo pipefail

out="fastlane/screenshots/ru"
bundle="team.burcev.app.dev"

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
xcrun simctl status_bar "$udid" override --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 --operatorName "" --batteryState charged --batteryLevel 100

xcodebuild build -project Vzvesheno.xcodeproj -scheme Vzvesheno-Dev -configuration Dev-Debug \
  -destination "id=$udid" -derivedDataPath build/dd -quiet
app=$(find build/dd/Build/Products/Dev-Debug-iphonesimulator -maxdepth 1 -name 'Vzvesheno.app' | head -n1)
xcrun simctl install "$udid" "$app"

# Фото для «Нашли на тарелке» и переписки — в Documents приложения.
media="$(xcrun simctl get_app_container "$udid" "$bundle" data)/Documents/uitest-media"
mkdir -p "$media"
cp scripts/screenshots/plate.jpg "$media/plate.jpg"

rm -rf "$out" && mkdir -p "$out"

# shot <имя> <экран> [секунд до снимка] [сценарий]
shot() {
  local name="$1" screen="$2" wait="${3:-6}" scenario="${4:-client}"
  xcrun simctl terminate "$udid" "$bundle" 2>/dev/null || true
  # Русская локаль: иначе раннер в en_US показал бы «1,173 ккал» и «8:20 AM».
  xcrun simctl launch "$udid" "$bundle" -uiTestScenario "$scenario" -uiTestShot "$screen" \
    -AppleLanguages "(ru)" -AppleLocale ru_RU >/dev/null
  sleep "$wait"
  xcrun simctl io "$udid" screenshot "$out/$name.png" >/dev/null
  echo "снят $name"
}

shot "01_today" today
shot "02_add_food" addFood 8
shot "03_photo_result" photoResult 10
shot "04_diary" diary
shot "05_chat" chat 8
shot "06_menu" menu 8
shot "07_articles" articles
shot "08_health" health

python3 - "$out" <<'EOF'
import struct, sys, pathlib
for p in sorted(pathlib.Path(sys.argv[1]).glob("*.png")):
    w, h = struct.unpack(">II", p.read_bytes()[16:24])
    print(f"{p.name}: {w}×{h}")
    if (w, h) != (1320, 2868):
        sys.exit(f"{p.name}: {w}×{h}, а App Store ждёт 1320×2868")
EOF
