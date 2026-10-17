# Макеты iOS-приложения «Взвешено»

Здесь лежат PNG экранов в масштабе @2x (iPhone 390×844 pt) и их HTML-исходники
в `src/`. Это копия холста Design «Взвешено · iOS»; репозиторий нужен, чтобы
макеты были под рукой у того, кто реализует спеки.

## Как читать

- **Источник правды для значений** — токены из `packages/design-tokens`:
  цвета, шрифты, отступы, радиусы. Макеты нарисованы ими же. Если пиксель
  расходится с токеном, прав токен.
- **Источник правды для поведения** — спеки `openspec/changes/ios-*`. Макет
  показывает одно состояние экрана, остальные описаны в сценариях.
- **Данные на макетах — примеры**: числа, имена, тексты сообщений.
- **Верх экрана (54 pt) пуст** — там системная строка состояния.
- **Таббар и плавающая панель «Записать еду»** нарисованы приблизительно.
  В приложении это системные `TabView` и `tabViewBottomAccessory`: на iOS 26
  они получают Liquid Glass сами, на iOS 18 выглядят как обычные системные.
- **Кнопку «Вход с Apple» рисует система** (`SignInWithAppleButton`), на
  макете — только её место и порядок.

## Экраны и спеки

| Файл | Экран | Спека |
|---|---|---|
| `Main.png` | Карта приложения: вкладки обеих ролей, возможности iOS, что нужно от бэкенда | `docs/ios/README.md` |
| `Today.png`, `TodayDark.png` | Клиент · Сегодня, светлая и тёмная тема | `ios-client-app` → `ios-client-today` |
| `Diary.png` | Клиент · Дневник, удаление свайпом | `ios-client-app` → `ios-food-diary` |
| `AddFood.png` | Лист «Записать еду», поиск и порция | `ios-client-app` → `ios-food-logging` |
| `Scan.png` | Сканер штрихкода (VisionKit) | `ios-client-app` → `ios-food-logging` |
| `PhotoResult.png` | Распознанная еда по фото | `ios-client-app` → `ios-food-logging` |
| `Chat.png` | Клиент · переписка с куратором | `ios-client-app` → `ios-client-chat` |
| `Articles.png` | Клиент · Статьи | `ios-client-app` → `ios-content-reader` |
| `Profile.png` | Профиль и настройки | `ios-client-app` → `ios-client-settings` |
| `HealthConnect.png` | Подключение Здоровья | `healthkit-sync` → `healthkit-client` |
| `SignIn.png` | Вход | `ios-client-app` → `ios-auth-flows`, `ios-native-session` |
| `Widgets.png` | Виджеты, экран блокировки, Пункт управления, пуши, Siri | `ios-system-surfaces`, `ios-push-notifications` |
| `CuratorClients.png` | Куратор · Клиенты | `ios-curator-app` → `ios-curator-hub` |
| `CuratorClient.png` | Куратор · карточка клиента | `ios-curator-app` → `ios-curator-client-card` |
| `CuratorChat.png` | Куратор · переписка | `ios-curator-app` → `ios-curator-chat` |
| `CuratorKbju.png` | Куратор · ввод КБЖУ по фото | `ios-curator-app` → `ios-curator-chat` |
| `CuratorLeads.png` | Куратор · Заявки | `ios-curator-app` → `ios-curator-leads` |
| `CuratorSupport.png` | Куратор · обращение | `ios-curator-app` → `ios-curator-support` |

Экранов, которых нет на макетах (онбординг, уведомления, планы и задачи
куратора, отчёты), собирай из тех же компонентов и по сценариям спек. Если
решение по виду неочевидно, спроси, а не придумывай новый паттерн.

## Пересборка PNG

Нужны зависимости репозитория (`npm ci` в корне): шрифты берутся из
`node_modules/@fontsource-variable`.

```bash
node -e "
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch();
  const dir = 'docs/ios/mockups/src';
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
    const wide = { Main: [1640, 940], Widgets: [820, 844] }[f.replace('.html', '')] || [390, 844];
    const p = await b.newPage({ viewport: { width: wide[0], height: wide[1] }, deviceScaleFactor: 2 });
    await p.goto('file://' + path.resolve(dir, f));
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join('docs/ios/mockups', f.replace('.html', '.png')) });
    await p.close();
  }
  await b.close();
})();
"
```
