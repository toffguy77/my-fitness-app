## 1. Событие

- [ ] 1.1 Тест Go: словарь принимает `calculator_result` с `goal` и `activity_level`, без них — отклоняет. Проверка: `go test ./internal/modules/analytics/` падает до реализации.
- [ ] 1.2 Добавить событие в `dictionary.go` и `shared/analytics/events.ts`. Проверка: Go-тесты зелёные, тест совпадения словарей (`Словари событий совпадают`) зелёный.

## 2. Калькулятор

- [ ] 2.1 Тесты `KbzhuCalculator`: расчёт вызывает `guestApi.calculate` и показывает КБЖУ; неполные данные не отправляют запрос; после расчёта отправлен `calculator_result`, а `onboarding_result_shown` — нет; «Сохранить результат» ставит шаг `result` в хранилище и ведёт на `/onboarding`. Проверка: `npx jest KbzhuCalculator` падает до реализации.
- [ ] 2.2 Реализовать компонент. Проверка: тесты зелёные.

## 3. Страница

- [ ] 3.1 Тесты страницы: `h1`, текст 300–400 слов, коэффициенты 1,2/1,375/1,55/1,725, 15 %, 1,6/1,8/2 г; FAQ видим и совпадает с `FAQPage`; canonical. Проверка: `npx jest kalkulyator` падает до реализации.
- [ ] 3.2 Реализовать `app/kalkulyator-kbzhu/page.tsx`. Проверка: тесты зелёные.
- [ ] 3.3 Тест посадочной: ссылка на `/kalkulyator-kbzhu` в подвале; добавить ссылку. Проверка: `npx jest landing`.
- [ ] 3.4 Проверки целостности: `node scripts/check-internal-links.mjs` и `node scripts/check-i18n.mjs` из корня. Проверка: обе проходят.

## 4. Без JavaScript

- [ ] 4.1 E2E `seo-without-javascript.spec.ts`: страница без JavaScript содержит `h1`, текст и вопросы. Проверка: локальный прогон E2E.
- [ ] 4.2 После выкатки: `curl -s https://new.burcev.team/kalkulyator-kbzhu | grep -c 'FAQPage'` = 1, расчёт в браузере работает; затем прод.
