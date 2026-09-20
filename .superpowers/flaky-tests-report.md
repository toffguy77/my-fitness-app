# Два теста, «падающих в компании»: на самом деле не течёт состояние, а тест зависит от календаря/часового пояса

## Статус

Готово. Оба целевых теста починены. Причина — не протечка состояния между
тестами, а зависимость самих тестов от реального времени выполнения
(граница полуночи и рассинхрон UTC/локальной даты). Мутация проведена и
поймана для обоих тестов. Устойчивость к порядку подтверждена `--randomize`
(дважды, разные seed). Полный `npx jest`, `lint`, `type-check` — зелёные.
Коммит будет создан после этого отчёта; хэш — в финальном ответе координатору.

## Причина протечки своими словами

Никакой протечки состояния между тестовыми файлами на самом деле нет —
Jest с `jest-environment-jsdom` даёт каждому тестовому файлу свежий `global`
(включая `Date`), так что подмена времени в одном файле физически не может
долететь до другого. То, что выглядело как «падает в компании, проходит
поодиночке», было совпадением: оба теста **сами по себе зависят от того, в
какую минуту суток их запустили**, а полный прогон (`notifications` +
`dashboard`) просто идёт дольше и чаще случайно попадает в уязвимое окно,
чем однострочный запуск одного файла. Сегодня, 2026-09-20, в Москве (UTC+3)
я воспроизвёл оба падения **поодиночке**, ровно потому что запускал их
между 00:00 и 01:00 по местному времени — то самое уязвимое окно.

**Тест 1** — `groupNotificationsByDate › should sort notifications within
each group by createdAt (newest first)`
(`apps/web/src/features/notifications/utils/dateGrouping.test.ts`).
Тест брал реальное «сейчас» и строил три уведомления как «10/30/60 минут
назад», предполагая, что все три попадут в группу «Today». Это верно почти
всегда, но не в первый час после полуночи: «60 минут назад» от 00:27
— это 23:27 **вчера**, и `groupNotificationsByDate` совершенно корректно
кладёт такое уведомление в группу «Yesterday». Тест ломается не потому что
код неправ, а потому что тест понадеялся на календарь.

**Тест 2** — `Property 39: Attention Indicator Display › … visual attention
indicator`
(`apps/web/src/features/dashboard/__tests__/attention-indicators.property.test.tsx`).
Здесь причина тоньше и это не просто «граница полуночи», а рассинхрон
**UTC-даты и локальной даты**. Тестовый хелпер:

```ts
function toDateStr(date: Date): string {
    return date.toISOString().split('T')[0]   // UTC-дата
}
```

использовался и для ключа `dailyData[todayStr]` в моке стора, и для
`date={today}`, передаваемого в `WeightBlock`/`NutritionBlock`/`StepsBlock`/
`WorkoutBlock`. А эти компоненты сами вычисляют ключ через
`formatLocalDate` (`apps/web/src/shared/utils/format.ts`):

```ts
export const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`   // локальная дата
}
```

Для Москвы (UTC+3) эти две даты расходятся каждый день **с 00:00 до 03:00
по местному времени** — то есть примерно 3 часа из 24 это гарантированно
красный тест, не «иногда мигает», а системно. В этом окне тестовые данные
кладутся под ключ вчерашней (UTC) даты, а компонент ищет их под ключом
сегодняшней (локальной) даты — не находит, считает вес/питание/шаги
незаписанными и рисует значок внимания там, где по смыслу теста его быть
не должно (или наоборот, для сгенерированных «вчера/завтра» дат — не
рисует там, где должен). Первое же несовпадающее утверждение бросает
исключение **до** вызова `unmount()`, и следующая итерация fast-check
рендерит новый экземпляр компонента поверх непочищенного — отсюда и
вторичный симптом «Found multiple elements with the role status», который
я увидел в логе: он не первопричина, а следствие первой протечки внутри
теста, усиленное шринкингом fast-check.

Ни разу это не «сосед не вернул время» — прямой подмены `Date`/`jest.useFakeTimers`
в обоих файлах и их соседях не найдено; я специально прогнал grep по
`useFakeTimers/setSystemTime/MockDate` во всех файлах `dashboard`+`notifications`
и проверил, что каждый вызов сопровождён `afterEach(() => jest.useRealTimers())`
(включая нестандартный случай в `dashboardStoreCoverage.test.ts`, где
восстановление стоит на уровне внешнего `describe`, а не рядом с каждым
`beforeEach` — тоже безопасно).

## Что изменено

- `apps/web/src/features/notifications/utils/dateGrouping.test.ts` — тест
  «should sort notifications within each group…» теперь строит три времени
  явными часами/минутами внутри сегодняшнего календарного дня
  (`new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 30, 0)`
  и т. д.), а не вычитанием минут из `Date.now()`. Порядок (1 — самое
  позднее, 3 — самое раннее) сохранён, смысл теста не изменился.
- `apps/web/src/features/dashboard/__tests__/attention-indicators.property.test.tsx`
  — `toDateStr` теперь делегирует в `formatLocalDate` из
  `@/shared/utils/format` (тот же модуль, что использует
  `WeightBlock`/`NutritionBlock`/`StepsBlock`/`WorkoutBlock`), вместо
  собственной UTC-реализации через `toISOString()`. Ключи теста и ключи
  компонентов теперь всегда согласованы, независимо от часового пояса и
  времени суток.

Никакой код приложения не менялся — оба дефекта целиком в тестах.

## Фактический вывод до и после

### До (не тронутый код, застал прямо сейчас, 2026-09-20 00:27–00:32 MSK)

Компания, как в задании:
```
$ npx jest src/features/notifications src/features/dashboard
FAIL src/features/dashboard/__tests__/attention-indicators.property.test.tsx
  ● Property 39: Attention Indicator Display › … visual attention indicator
    Cause:
    TestingLibraryElementError: Found multiple elements with the role "status" and name `/вес не записан сегодня/i`
FAIL src/features/notifications/utils/dateGrouping.test.ts
  ● groupNotificationsByDate › should sort notifications within each group by createdAt (newest first)
    TypeError: Cannot read properties of undefined (reading 'id')
Tests: 2 failed, 14 skipped, 1490 passed, 1506 total
```

Поодиночке (та же минута, доказывает — не протечка, а календарь):
```
$ npx jest src/features/notifications/utils/dateGrouping.test.ts
FAIL … TypeError: Cannot read properties of undefined (reading 'id')
Tests: 1 failed, 13 passed, 14 total

$ npx jest src/features/dashboard/__tests__/attention-indicators.property.test.tsx
FAIL … Found multiple elements with the role "status" …
Tests: 1 failed, 3 passed, 4 total
```

### После (правка применена)

```
$ npx jest src/features/notifications/utils/dateGrouping.test.ts
Tests: 14 passed, 14 total

$ npx jest src/features/dashboard/__tests__/attention-indicators.property.test.tsx
Tests: 4 passed, 4 total

$ npx jest src/features/notifications src/features/dashboard
Test Suites: 1 skipped, 90 passed, 90 of 91 total
Tests: 14 skipped, 1492 passed, 1506 total
```

## Мутация (обязательная проверка)

Вернул причину — `git stash` на оба файла (снова UTC-хелпер `toDateStr` и
вычитание минут из `Date.now()`) — и прогнал **те же самые** тесты **в тот
же час** (00:31–00:32 MSK, то же уязвимое окно):

```
$ npx jest src/features/notifications/utils/dateGrouping.test.ts
FAIL … TypeError: Cannot read properties of undefined (reading 'id')
Tests: 1 failed, 13 passed, 14 total

$ npx jest src/features/dashboard/__tests__/attention-indicators.property.test.tsx
FAIL … Cause: TestingLibraryElementError: Found multiple elements …
Tests: 1 failed, 3 passed, 4 total
```

Оба падения воспроизвелись один в один — значит, чинил именно причину, а
не переставил тесты местами. После этого `git stash pop` вернул правку.

## Проверка устойчивости к порядку (`--randomize`)

Два прогона исходной команды из задания с перемешиванием порядка тестов
внутри файлов и разными seed:

```
$ npx jest src/features/notifications src/features/dashboard --randomize --showSeed
Seed: 1994135949
Tests: 2 failed, 14 skipped, 1490 passed, 1506 total   ← см. «Что нашлось попутно»

$ npx jest src/features/notifications src/features/dashboard --randomize --showSeed
Seed: 21441052
Tests: 1 failed, 14 skipped, 1491 passed, 1506 total   ← см. «Что нашлось попутно»
```

В обоих прогонах падали **не мои** тесты (см. ниже). Чтобы явно проверить
именно целевые два теста, прогнал их отдельно с `--randomize` дважды:

```
$ npx jest src/features/notifications/utils/dateGrouping.test.ts \
           src/features/dashboard/__tests__/attention-indicators.property.test.tsx \
           --randomize --showSeed
Seed: 838554218
Tests: 18 passed, 18 total

$ npx jest src/features/notifications/utils/dateGrouping.test.ts \
           src/features/dashboard/__tests__/attention-indicators.property.test.tsx \
           --randomize --showSeed
Seed: -988571718
Tests: 18 passed, 18 total
```

Оба раза зелено.

## Что нашлось попутно (не трогал, вне рамок задания)

`--randomize` (перемешивает порядок тестов **внутри** файла) вскрыл
отдельный, настоящий дефект: `Dashboard Store Actions › State Transitions ›
transitions from offline to online`
(`apps/web/src/features/dashboard/store/__tests__/storeActions.test.ts:472`)
падает при определённых перестановках порядка тестов внутри файла —
`result.current.isOffline` остаётся `true` после `setOfflineStatus(false)`,
похоже на реальную протечку состояния стора между тестами этого файла. Я
его не трогал: он не входит в два теста, на которые меня просили, никак
не связан с календарём/временем (это стор `isOffline`, не даты), и я его
не редактировал (два моих правленных файла — `dateGrouping.test.ts` и
`attention-indicators.property.test.tsx` — физически не пересекаются с
`storeActions.test.ts`). Стоит завести отдельную задачу.

## Сколько ещё тестов в наборе зависят от текущей даты

Целенаправленно проверил `src/features/notifications` и
`src/features/dashboard` на тот же класс дефектов.

**Тот же класс бага (тестовый хелпер берёт UTC-дату через
`toISOString().split('T')[0]`, а рендерит компонент, который сам берёт
`formatLocalDate` — локальную дату) нашёлся ещё в одном файле:**

- `apps/web/src/features/dashboard/__tests__/long-term-attention-indicators.property.test.tsx`
  — тот же самый хелпер `toDateStr` через `toISOString()`, рендерит
  `CalendarNavigator` и `WeeklyPlanSection`, оба используют
  `formatLocalDate` внутри. Прямо сейчас (00:41 MSK, всё ещё в уязвимом
  окне для Москвы) он прошёл — свойство не задело нужную комбинацию входных
  данных в этом прогоне, — но это latent-дефект того же типа, что я
  исправил, просто не каждый прогон fast-check (без фиксированного seed)
  на него натыкается. В рамки этой задачи не входит — не трогал, только
  сообщаю.

**Файлы, использующие `toISOString().split('T')[0]`, но безопасные** —
проверил, не сравнивают с `formatLocalDate`-based компонентом и не рендерят
ничего (тестируют чистые функции/генераторы, само-согласованы):
`generators.test.ts`, `errorHandling.property.test.ts`,
`weekNavigation.property.test.ts`, `loadPerformance.property.test.ts`.
`DailyTrackingGrid.property.test.tsx` использует оба варианта, но в месте,
где строится ключ для реального компонента, уже стоит правильный
`formatLocalDate` — не задет.

**Файлы с относительным временем («N часов/минут назад»)** —
`formatTimestamp.test.ts`, `NotificationItem.test.tsx`,
`notifications.integration.test.tsx`, `NotificationList.test.tsx`:
проверил реализацию `formatRelativeTime` — она считает по разнице
миллисекунд (`Date.now() - date.getTime()`), не по календарным суткам,
так что не зависит от часового пояса/полуночи. Не в зоне риска.

**Итог: один дополнительный latent-дефект того же класса**
(`long-term-attention-indicators.property.test.tsx`), не исправлял, за
рамками задания — рекомендую почеловечески почистить тем же способом
(`formatLocalDate` вместо самодельного UTC-хелпера) отдельным изменением.

## Прогоны

```
$ npx jest src/features/notifications src/features/dashboard
Test Suites: 1 skipped, 90 passed, 90 of 91 total
Tests: 14 skipped, 1492 passed, 1506 total

$ npx jest
Test Suites: 1 skipped, 332 passed, 332 of 333 total
Tests: 14 skipped, 4419 passed, 4433 total

$ npm run lint
✖ 586 problems (0 errors, 586 warnings)   ← все warnings предсуществующие, не в тронутых файлах

$ npm run type-check
(чисто, без вывода — tsc --noEmit прошёл)
```
