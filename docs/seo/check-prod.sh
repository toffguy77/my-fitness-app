#!/usr/bin/env bash
# Проверка каждого адреса из sitemap прода: 200, canonical на себя, один <h1>,
# полный Open Graph, без noindex. Вызывать после того, как /ready назвал
# выкаченную версию. Код выхода 1 — если хоть один адрес не прошёл.
#
#   docs/seo/check-prod.sh                 # https://burcev.team
#   docs/seo/check-prod.sh https://new.burcev.team   # dev (canonical там тоже на прод)
set -euo pipefail
SITE="${1:-https://burcev.team}"
CANON_BASE="https://burcev.team"
fail=0
for url in $(curl -fsS "$SITE/sitemap.xml" | grep -o '<loc>[^<]*' | sed 's/<loc>//'); do
  path="${url#"$CANON_BASE"}"
  html=$(curl -sS -w '\n%{http_code}' "$SITE${path:-/}")
  code="${html##*$'\n'}"
  line=$(printf '%s' "${html%$'\n'*}" | python3 -I -c '
import re,sys
s=sys.stdin.read(); u=sys.argv[1]
g=lambda p: re.findall(r"<meta property=\"og:"+p+r"\" content=\"([^\"]*)\"", s)
canon=re.findall(r"rel=\"canonical\" href=\"([^\"]*)\"", s)
robots=re.findall(r"name=\"robots\" content=\"([^\"]*)\"", s)
problems=[]
if canon!=[u]: problems.append("canonical=%s" % canon)
if len(re.findall("<h1", s))!=1: problems.append("h1=%d" % len(re.findall("<h1", s)))
for p in ("type","site_name","image"):
    if not g(p): problems.append("нет og:"+p)
if any("noindex" in r for r in robots): problems.append("noindex")
print("; ".join(problems))' "$url")
  if [ "$code" != 200 ] || [ -n "$line" ]; then
    echo "!! ${path:-/}  код $code  $line"; fail=1
  else
    echo "ok ${path:-/}"
  fi
done
exit $fail
