## 1. Синхронный setState в эффектах

- [x] 1.1 Перестроить `features/content/components/FeedList.tsx` на сброс состояния через `key` вместо синхронного setState. Проверка: сценарий «Смена фильтра в списке», `npx jest content` зелёные.
- [x] 1.2 То же для `features/content/components/ArticleList.tsx`. Проверка: тесты раздела зелёные.
- [x] 1.3 То же для `features/food-tracker/components/SearchTab.tsx` (два места). Проверка: сценарий «Повторный поиск продукта».
- [x] 1.4 То же для `features/food-tracker/components/FoodEntryModal.tsx`. Проверка: тесты компонента.
- [x] 1.5 То же для `features/dashboard/components/ClientTasksSection.tsx`. Проверка: тесты раздела.
- [x] 1.6 То же для `features/settings/hooks/useSettings.ts`. Проверка: тесты хука.
- [x] 1.7 То же для `app/reset-password/page.tsx`. Проверка: сквозной сценарий сброса пароля.
- [x] 1.8 То же для `features/auth/components/VerifyEmailScreen.tsx`. Проверка: тесты компонента.

## 2. Неизменяемость и мемоизация

- [x] 2.1 Убрать мутации в `app/reset-password/page.tsx`, `features/dashboard/components/ClientTasksSection.tsx`, `features/food-tracker/hooks/useFoodSearch.ts`. Проверка: правило `react-hooks/immutability` не срабатывает.
- [x] 2.2 Убрать нарушение ручной мемоизации в `ClientTasksSection.tsx` и `useFoodSearch.ts`. Проверка: правило `preserve-manual-memoization` не срабатывает. *Причина в обоих случаях оказалась одна: `useCallback` читался раньше своего объявления, поэтому компилятор отказывался сохранять мемоизацию всего компонента. Порядок объявлений исправлен, сама мемоизация сохранена — замерять нечего.*
- [x] 2.3 Исправить работу с ref в `features/notifications/components/NotificationDropdown.tsx`. Проверка: правило `react-hooks/refs` не срабатывает.

## 3. Возврат блокировки

- [x] 3.1 Поднять четыре правила до `error` в `eslint.config.mjs` и удалить временный блок с комментарием. Проверка: сценарий «Новое нарушение» на намеренном нарушении.
- [x] 3.2 Прогнать `npx eslint src` — ноль ошибок. Проверка: сценарий «Проверка кодовой базы».
- [x] 3.3 Проверить затронутые экраны. Проверка: вместо ручного клик-теста — сквозной прогон Playwright по всем затронутым экранам (дашборд, трекер еды, контент, настройки, уведомления, сброс пароля) в настоящем браузере; 160 сценариев зелёные, включая перерисовку модального окна записи еды, которое теперь пересоздаётся по `key`.
