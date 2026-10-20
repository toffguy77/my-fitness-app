#!/usr/bin/env bash
# Номер сборки (CFBundleVersion) — число коммитов до HEAD. Вызывается XcodeGen
# перед генерацией проекта (options.preGenCommand в project.yml) и пишет
# BuildNumber.xcconfig, общий для приложения и расширения.
#
# TestFlight требует, чтобы номер рос; число коммитов растёт с каждым коммитом.
# В CI нужна полная история (actions/checkout с fetch-depth: 0), иначе номер
# будет 1. Без git (архив исходников) — время сборки.
set -euo pipefail
cd "$(dirname "$0")/.."

if count=$(git rev-list --count HEAD 2>/dev/null); then
  number="$count"
else
  number=$(date -u +%Y%m%d%H%M)
fi
printf '// Сгенерировано scripts/build-number.sh — не править.\nCURRENT_PROJECT_VERSION = %s\n' "$number" > BuildNumber.xcconfig
echo "Номер сборки: $number"
