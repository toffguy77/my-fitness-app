## 1. Событие

- [x] 1.1 Тест Go: словарь принимает `calculator_result` с `goal` и `activity_level`, без них — отклоняет. Проверка: `go test ./internal/modules/analytics/` падает до реализации.
- [x] 1.2 Добавить событие в `dictionary.go` и `shared/analytics/events.ts`. Проверка: Go-тесты зелёные, тест совпадения словарей (`Словари событий совпадают`) зелёный.

## 2. Калькулятор

- [x] 2.1 Тесты `KbzhuCalculator`: расчёт вызывает `guestApi.calculate` и показывает КБЖУ; неполные данные не отправляют запрос; после расчёта отправлен `calculator_result`, а `onboarding_result_shown` — нет; «Сохранить результат» ставит шаг `result` в хранилище и ведёт на `/onboarding`. Проверка: `npx jest KbzhuCalculator` падает до реализации.
- [x] 2.2 Реализовать компонент. Проверка: тесты зелёные.

## 3. Страница

- [x] 3.1 Тесты страницы: `h1`, текст 300–400 слов, коэффициенты 1,2/1,375/1,55/1,725, 15 %, 1,6/1,8/2 г; FAQ видим и совпадает с `FAQPage`; canonical. Проверка: `npx jest kalkulyator` падает до реализации.
- [x] 3.2 Реализовать `app/kalkulyator-kbzhu/page.tsx`. Проверка: тесты зелёные.
- [x] 3.3 Тест посадочной: ссылка на `/kalkulyator-kbzhu` в подвале; добавить ссылку. Проверка: `npx jest landing`.
- [x] 3.4 Проверки целостности: `node scripts/check-internal-links.mjs` и `node scripts/check-i18n.mjs` из корня. Проверка: обе проходят.

## 4. Руководство пользователя

- [x] 4.1 Добавить в `docs/user-guide/` раздел о странице `/kalkulyator-kbzhu` (что считает, как сохранить результат), проверить `05-контент-и-обучение.md` на упоминания адресов статей; выполнить `make sync-knowledge` в `apps/api`. Проверка: `go test ./internal/modules/support/ -run TestKnowledgeMatchesUserGuide` зелёный.

## 5. Без JavaScript

- [x] 5.1 E2E `seo-without-javascript.spec.ts`: страница без JavaScript содержит `h1`, текст и вопросы. Проверка: локальный прогон E2E.
- [x] 5.2 После выкатки: `curl -s https://new.burcev.team/kalkulyator-kbzhu | grep -c 'FAQPage'` = 1, расчёт в браузере работает; затем прод. *Проверено 2026-10-06 на dev и на проде (`v2026.10.06+31a71d72`).*
