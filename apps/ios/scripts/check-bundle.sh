#!/usr/bin/env bash
# Проверка собранного приложения перед выкладкой (ios-platform-compliance):
#  - в .app и в каждом .appex есть PrivacyInfo.xcprivacy с NSPrivacyAccessedAPITypes;
#  - в Info.plist приложения ITSAppUsesNonExemptEncryption = false, фоновые
#    режимы remote-notification и fetch, идентификатор досылки очереди
#    в BGTaskSchedulerPermittedIdentifiers;
#  - нигде нет NSUserTrackingUsageDescription (нет запроса ATT);
#  - номер сборки приложения и расширений совпадает.
#
# Запуск: scripts/check-bundle.sh <путь к Vzvesheno.app>. Только macOS (plutil).
set -euo pipefail

app="${1:?путь к .app}"
[ -d "$app" ] || { echo "нет $app" >&2; exit 1; }
fail=0
err() { echo "✗ $*" >&2; fail=1; }
ok() { echo "✓ $*"; }

value() { /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || true; }

check_manifest() {
  local bundle="$1" manifest="$1/PrivacyInfo.xcprivacy"
  if [ ! -f "$manifest" ]; then err "$(basename "$bundle"): нет PrivacyInfo.xcprivacy"; return; fi
  if plutil -extract NSPrivacyAccessedAPITypes xml1 -o - "$manifest" >/dev/null 2>&1; then
    ok "$(basename "$bundle"): PrivacyInfo.xcprivacy с NSPrivacyAccessedAPITypes"
  else
    err "$(basename "$bundle"): в PrivacyInfo.xcprivacy нет NSPrivacyAccessedAPITypes"
  fi
  if [ -n "$(value "$bundle/Info.plist" NSUserTrackingUsageDescription)" ]; then
    err "$(basename "$bundle"): NSUserTrackingUsageDescription — запроса отслеживания быть не должно"
  fi
}

check_manifest "$app"
info="$app/Info.plist"
[ "$(value "$info" ITSAppUsesNonExemptEncryption)" = "false" ] && ok "ITSAppUsesNonExemptEncryption = false" \
  || err "ITSAppUsesNonExemptEncryption должен быть false"
modes=$(value "$info" UIBackgroundModes)
for mode in remote-notification fetch; do
  grep -q "$mode" <<<"$modes" && ok "UIBackgroundModes: $mode" || err "UIBackgroundModes без $mode"
done
bundle_id=$(value "$info" CFBundleIdentifier)
grep -q "$bundle_id.outbox" <<<"$(value "$info" BGTaskSchedulerPermittedIdentifiers)" \
  && ok "BGTaskSchedulerPermittedIdentifiers: $bundle_id.outbox" || err "нет $bundle_id.outbox в BGTaskSchedulerPermittedIdentifiers"
version=$(value "$info" CFBundleVersion)

found=0
for ext in "$app"/PlugIns/*.appex; do
  [ -d "$ext" ] || continue
  found=1
  check_manifest "$ext"
  [ "$(value "$ext/Info.plist" CFBundleVersion)" = "$version" ] && ok "$(basename "$ext"): номер сборки $version" \
    || err "$(basename "$ext"): номер сборки расходится с приложением ($version)"
done
[ "$found" = 1 ] || err "в приложении нет расширений (.appex)"

exit "$fail"
