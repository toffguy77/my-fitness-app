## Why

Интерфейс собран из классов палитры Tailwind напрямую: 3 037 классов
(`text-gray-500`, `bg-blue-600`…) в 201 файле и десятки шестнадцатеричных цветов
в графиках. «Вторичный текст» был пятью разными серыми, главное действие —
тремя синими, тёмной темы не было и быть не могло: цвет нигде не был ролью.
Впереди iOS и Android, и переносить на них нечего — решения о цвете, шрифте и
размерах нигде не записаны.

Дашборд и дневник при этом показывают долю от нормы процентом, хотя человеку
за едой нужен ответ «сколько ещё можно», а куратор — главное отличие продукта
— выглядит как любая другая карточка.

## What Changes

- **Пакет `@burcev/design-tokens`**: источник в формате W3C Design Tokens
  (палитра → роли → компоненты), сборка в CSS-переменные, тему Tailwind v4,
  JS с типами и JSON для мобильных платформ. Сборка проверяет ссылки,
  совпадение ролей в темах и контраст WCAG; CI падает, если собранное отстало
  от источника.
- **Палитра Tailwind отключена** в теме; ESLint запрещает классы палитры и цвет
  литералом в `apps/web/src`. Весь интерфейс переведён на роли кодмодом
  (`apps/web/scripts/design-system-codemod.mjs`).
- **Тёмная тема** по системной настройке, `data-theme` на `<html>` её
  переопределяет.
- **Шрифты** Literata (засечки, голос куратора) и Golos Text (интерфейс,
  цифры) — свои копии, без Google Fonts.
- **Компоненты**: Button/IconButton, Card (`coach`), ProgressBar, ProgressArc,
  MacroRemaining, WeekDots, QuickAddActions, QuickAddBar.
- **Дашборд**: приветствие, куратор тёмной плашкой с цитатой, питание —
  остаток ккал на полукруглой шкале и остаток по макросам в граммах, запись
  в одно касание (поиск/фото/штрихкод), неделя точками вместо линейного
  графика.
- **Дневник**: итог дня фразой и плитки остатка, лента приёмов пищи, панель
  быстрого ввода вместо плавающей кнопки.
- **Справочник `/design-system`** и документация `docs/design-system/README.md`.

## Impact

- `apps/web/src/app/globals.css` (было одна строка `@import "tailwindcss"`),
  `apps/web/src/app/layout.tsx:11` (шрифты), `:16` (`themeColor`).
- `apps/web/src/styles/tokens/*` — удалён: нигде не импортировался.
- `apps/web/src/shared/constants/macros.ts:23-27` — hex → роли токенов.
- `apps/web/src/shared/components/ui/{Button,Card,Input,Checkbox,ConfirmDialog}.tsx`.
- `apps/web/src/features/dashboard/components/{NutritionBlock,CuratorCard,NavigationItem,FooterNavigation,DashboardHeader,DailyTrackingGrid}.tsx`,
  `apps/web/src/app/dashboard/page.tsx` (`KBJUWeeklyChart` → `WeekCaloriesCard`).
- `apps/web/src/features/food-tracker/components/{FoodTrackerPage,DietTab,KBZHUSummary,MealSlot,FoodEntryItem,FoodTrackerTabs,DatePicker}.tsx`.
- Графики recharts: `WeightSection.tsx`, `KBJUWeeklyChart.tsx`,
  `curator/components/{WaterChart,StepsChart,AnalyticsDynamicsChart}.tsx`,
  `app/curator/clients/[id]/page.tsx` → `shared/charts/chartTheme.ts`.
- 256 файлов — механическая замена классов палитры на роли.
- `eslint.config.mjs`, `.github/workflows/ci.yml` (шаг «Check design tokens»),
  `apps/web/Dockerfile` (манифест нового пакета).
