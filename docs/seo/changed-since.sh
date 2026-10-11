#!/usr/bin/env bash
# Адреса из sitemap прода, изменённые после указанного момента (по <lastmod>).
# Это статьи: опубликованные или отредактированные в админке, без релиза кода.
# Их и отправляют на переобход — см. docs/seo/README.md, «После выкатки».
#
#   docs/seo/changed-since.sh 2026-10-09T20:06:00Z
#   docs/seo/changed-since.sh 2026-10-09T20:06:00Z https://burcev.team
#
# Момент — время предыдущей выкатки прода. Список /content добавляется сам,
# если изменилась хоть одна статья: на ленте новая карточка.
set -euo pipefail
SINCE="${1:?нужен момент ISO 8601, например 2026-10-09T20:06:00Z}"
SITE="${2:-https://burcev.team}"
curl -fsS "$SITE/sitemap.xml" | python3 -I -c '
import re, sys
from datetime import datetime, timezone
since = datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
xml = sys.stdin.read()
changed = []
for block in re.findall(r"<url>(.*?)</url>", xml, re.S):
    loc = re.search(r"<loc>([^<]+)</loc>", block)
    mod = re.search(r"<lastmod>([^<]+)</lastmod>", block)
    if loc and mod and datetime.fromisoformat(mod.group(1).replace("Z", "+00:00")) > since:
        changed.append(loc.group(1))
if changed:
    changed.append(sys.argv[2].rstrip("/") + "/content")
print("\n".join(changed))
' "$SINCE" "$SITE"
