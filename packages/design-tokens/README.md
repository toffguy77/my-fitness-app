# @burcev/design-tokens

Токены дизайн-системы BURCEV. Источник — `tokens/*.json` (W3C Design Tokens),
собранное — `dist/` (коммитится).

```bash
npm run tokens:build   # собрать dist/ из tokens/
npm run tokens:check   # проверить, что dist/ совпадает с источником (CI)
```

| Файл | Для чего |
|---|---|
| `dist/tokens.css` | CSS-переменные `--ds-*`, светлая и тёмная тема |
| `dist/tailwind.css` | тема Tailwind v4: утилиты ролей, радиусы, `type-*` |
| `dist/tokens.js`, `.d.ts` | `color.*` — CSS-переменные ролей; `values.light/dark` — значения |
| `dist/tokens.json` | развёрнутые значения обеих тем и отчёт о контрасте — для iOS/Android |

Роли, правила и компоненты — [docs/design-system](../../docs/design-system/README.md).
