#!/usr/bin/env bash
# Проверка самого правила ds_color_literal (ios-design-tokens: «Цвет литералом
# в экране»): экран с `Color(red:…)` обязан валить `swiftlint --strict`, а тот
# же код внутри DesignSystem — нет. Правило, которое молча перестало
# срабатывать, пропускает ровно то, ради чего написано.
#
# Запуск из apps/ios: scripts/check-color-rule.sh [команда swiftlint].
set -euo pipefail
cd "$(dirname "$0")/.."
swiftlint="${SWIFTLINT:-swiftlint}"

screen="Vzvesheno/__ColorRuleProbe.swift"
inside="VzveshenoKit/Sources/DesignSystem/__ColorRuleProbe.swift"
trap 'rm -f "$screen" "$inside"' EXIT
probe='import SwiftUI
let probe = Color(red: 0.7, green: 0.3, blue: 0.2)
'
printf '%s' "$probe" > "$screen"
if out=$($swiftlint lint --strict --no-cache --quiet "$screen" 2>&1); then
  echo "✗ Color(red:) в экране не остановил swiftlint --strict" >&2; exit 1
fi
grep -q "ds_color_literal" <<<"$out" || { echo "✗ отказ не по ds_color_literal: $out" >&2; exit 1; }
echo "✓ Color(red:) в экране — ошибка ds_color_literal"
rm -f "$screen"

printf '%s' "$probe" > "$inside"
if ! out=$($swiftlint lint --strict --no-cache --quiet "$inside" 2>&1) && grep -q ds_color_literal <<<"$out"; then
  echo "✗ ds_color_literal сработал внутри DesignSystem: $out" >&2; exit 1
fi
echo "✓ внутри DesignSystem правило молчит"
