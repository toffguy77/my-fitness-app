#!/usr/bin/env bash
# Переносит учётные данные подписи из соседнего репозитория lorito в секреты
# GitHub этого репозитория. Значения не печатаются.
#
# Команда Apple у приложений общая (3GWRDGA8B7), поэтому ключ App Store Connect
# и сертификат дистрибуции те же; профиль под team.burcev.app fastlane выпускает
# сам при сборке.
#
# Запуск из корня репозитория:
#   apps/ios/scripts/set-github-secrets.sh [путь к lorito/secrets]
set -euo pipefail

src="${1:-$HOME/src/lorito/secrets}"
repo="toffguy77/my-fitness-app"

[ -f "$src/asc.env" ] || { echo "нет $src/asc.env" >&2; exit 1; }
[ -f "$src/dist.p12" ] || { echo "нет $src/dist.p12" >&2; exit 1; }
key_file=$(ls "$src"/AuthKey_*.p8 2>/dev/null | head -n1)
[ -n "$key_file" ] || { echo "нет $src/AuthKey_*.p8" >&2; exit 1; }

# shellcheck disable=SC1091
set -a; . "$src/asc.env"; set +a

missing=()
for name in APP_STORE_CONNECT_KEY_ID APP_STORE_CONNECT_ISSUER_ID DISTRIBUTION_CERTIFICATE_PASSWORD; do
  [ -n "${!name:-}" ] || missing+=("$name")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "в asc.env не заданы: ${missing[*]}" >&2
  echo "имена переменных в файле:" >&2
  grep -oE '^(export )?[A-Za-z_]+=' "$src/asc.env" | sed 's/^export //; s/=$//' >&2
  exit 1
fi

gh secret set APP_STORE_CONNECT_KEY_ID --repo "$repo" --body "$APP_STORE_CONNECT_KEY_ID"
gh secret set APP_STORE_CONNECT_ISSUER_ID --repo "$repo" --body "$APP_STORE_CONNECT_ISSUER_ID"
gh secret set DISTRIBUTION_CERTIFICATE_PASSWORD --repo "$repo" --body "$DISTRIBUTION_CERTIFICATE_PASSWORD"
base64 -w0 "$key_file" | gh secret set APP_STORE_CONNECT_API_KEY --repo "$repo"
base64 -w0 "$src/dist.p12" | gh secret set DISTRIBUTION_CERTIFICATE_P12 --repo "$repo"

echo "Секреты заданы:"
gh secret list --repo "$repo" | grep -E 'APP_STORE_CONNECT|DISTRIBUTION_CERTIFICATE'
