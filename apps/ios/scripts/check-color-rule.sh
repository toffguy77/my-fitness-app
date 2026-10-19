#!/usr/bin/env bash
# Проверка самого правила ds_color_literal (ios-design-tokens: «Цвет литералом
# в экране»): экран с `Color(red:…)`, `Color(.sRGB, red:…)`,
# `UIColor(displayP3Red:…)` и т. п. обязан валить `swiftlint --strict`, а тот
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

# Каждый способ задать цвет числами, который правило обязано ловить.
probes=(
  'Color(red: 0.7, green: 0.3, blue: 0.2)'
  'Color(.sRGB, red: 0.7, green: 0.3, blue: 0.2, opacity: 1)'
  'Color(.displayP3, red: 0.7, green: 0.3, blue: 0.2)'
  'UIColor(red: 0.7, green: 0.3, blue: 0.2, alpha: 1)'
  'UIColor(displayP3Red: 0.7, green: 0.3, blue: 0.2, alpha: 1)'
  'CGColor(srgbRed: 0.7, green: 0.3, blue: 0.2, alpha: 1)'
  'Color(hue: 0.1, saturation: 0.5, brightness: 0.5)'
  'Color(white: 0.5)'
)

for expression in "${probes[@]}"; do
  printf 'import SwiftUI\nlet probe = %s\n' "$expression" > "$screen"
  if out=$($swiftlint lint --strict --no-cache --quiet "$screen" 2>&1); then
    echo "✗ $expression в экране не остановил swiftlint --strict" >&2; exit 1
  fi
  grep -q "ds_color_literal" <<<"$out" || { echo "✗ $expression: отказ не по ds_color_literal: $out" >&2; exit 1; }
  echo "✓ $expression в экране — ошибка ds_color_literal"
done
rm -f "$screen"

for expression in "${probes[@]}"; do
  printf 'import SwiftUI\nlet probe = %s\n' "$expression" > "$inside"
  if ! out=$($swiftlint lint --strict --no-cache --quiet "$inside" 2>&1) && grep -q ds_color_literal <<<"$out"; then
    echo "✗ ds_color_literal сработал внутри DesignSystem на $expression: $out" >&2; exit 1
  fi
done
echo "✓ внутри DesignSystem правило молчит"
