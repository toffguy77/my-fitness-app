# Регрессия: кнопки входа через провайдера исчезли с /auth

## Статус
Исправлено. Коммит: см. `git log -1` после commit ниже.

## Причина
`apps/web/src/features/auth/components/AuthScreen.tsx:247` — `<ProviderButtons mode={mode} />`
находился внутри ветки `{entryMethod === 'password' && (...)}`. После переделки экрана входа
(сначала — вход по одноразовой ссылке, `entryMethod` по умолчанию `'link'`) провайдеры
переставали монтироваться в разметке вовсе на экранах `/auth` и `/auth?mode=register`, пока
человек не нажимал «Войти по паролю».

## Исправление
`ProviderButtons` вынесен из ветки пароля и рендерится безусловно, один раз, в конце карточки
формы — после закрывающей скобки `{entryMethod === 'password' && (...)}`, но до `<AuthFooter />`.
Теперь он виден при любом `entryMethod` и в обоих `mode`.

```diff
-                                <ProviderButtons mode={mode} />
                             </>
                         )}
+                        <ProviderButtons mode={mode} />
                     </div>
```

## Вёрстка — как решил и почему
Ничего не добавлял визуально: у `ProviderButtons` уже есть подписанный разделитель
(`or войдите через` / `или зарегистрируйтесь через` на двух горизонтальных линиях) и
полноразмерные кнопки с рамкой (`py-3`, `w-full`, `border`) — по весу они равны основным
действиям (primary/outline `Button`), а не мелким текстовым ссылкам-переключателям над ними
(«Войти по паролю», «Войти по ссылке», «Уже есть аккаунт»). Разместив блок ниже обеих веток
(ссылка/пароль) единым элементом в самом низу карточки, а не внутри списка мелких ссылок,
получаем: над разделителем — способ, который выбрали (ссылка или пароль) со своими
действиями и переключателями; под разделителем — равноправный третий способ, который виден
всегда. Отдельной рамки/фона не добавлял — разделитель с подписью и вертикальный отступ `mt-6`
уже достаточно отделяют блок от списка ссылок, не отвлекая новыми цветами.

## Тесты — что добавлено
Файл: `apps/web/src/features/auth/components/__tests__/AuthScreen.test.tsx`.
Добавлен мок `@/features/auth/api/providers` (по образцу `ProviderButtons.test.tsx`) —
у реального эндпоинта `/api/v1/auth/providers` нет MSW-хендлера в этом сьюте, поэтому без мока
`ProviderButtons` тихо рендерит `null` и ничего не проверяет.

Новый блок `describe('provider sign-in (third entry method, independent of link/password)')`,
5 тестов, все через `toBeVisible()` (не `toBeInTheDocument()` — форма ссылки на этом экране
прячется атрибутом `hidden`, а не размонтируется, и присутствие в дереве само по себе ничего
не доказывает):

1. `is visible on the default magic-link screen` — провайдеры видны при входе по ссылке.
2. `is visible after switching to the password entry method` — видны при входе по паролю.
3. `is visible on the link screen opened with ?mode=register` — видны на `?mode=register`.
4. `labels itself for signing in on the login-mode link screen` — подпись «или войдите через».
5. `labels itself for registering on the register-mode link screen` — подпись
   «или зарегистрируйтесь через».

## Порядок проверки (TDD)
1. Тесты написаны первыми, прогнаны против кода с багом (до правки) — подтверждено падение
   4 из 5 (`npx jest ... -t "provider sign-in"`): красными вышли обе видимости на экране ссылки
   (login и register) и обе подписи; тест видимости на экране пароля прошёл сразу — это
   единственный сценарий, который уже работал (баг-репорт: «чтобы добраться до провайдеров,
   надо сперва нажать „Войти по паролю“» — то есть в паролe они и правда уже были видны).
2. Внесена правка (вынос `ProviderButtons` из ветки пароля).
3. Все 5 новых тестов и весь файл (22/22) — зелёные.

## Мутационная проверка — фактический вывод
### Мутация 1: вернуть `ProviderButtons` обратно внутрь ветки пароля
Команда: `npx jest src/features/auth/components/__tests__/AuthScreen.test.tsx -t "provider sign-in"`
Результат: **4 failed, 1 passed** (из 5, остальные 17 skipped фильтром `-t`).
- `is visible on the default magic-link screen` — упал (таймаут `findByTestId`, элемент не
  появился — провайдеры не рендерятся на экране ссылки).
- `is visible on the link screen opened with ?mode=register` — упал, та же причина.
- `labels itself for signing in on the login-mode link screen` — упал, подпись не рендерится
  (весь блок отсутствует на экране ссылки).
- `labels itself for registering on the register-mode link screen` — упал, та же причина.
- `is visible after switching to the password entry method` — **прошёл** (не мутация: это уже
  так работало и до правки, ровно то, что описано в баг-репорте).
Мутация отменена, код восстановлен в исправленное состояние; повторный прогон — 22/22 зелёных.

### Мутация 2: перепутать подписи в `apps/web/src/features/auth/components/ProviderButtons.tsx`
`mode === 'register' ? t('auth.orRegisterWith') : t('auth.orSignInWith')` →
`mode === 'register' ? t('auth.orSignInWith') : t('auth.orRegisterWith')` (подписи местами).
Команда: `npx jest ... -t "labels itself"`.
Результат: **2 failed** (оба теста подписи, оба другими тестами не покрыты) — оба упали по
таймауту `findByText`, потому что ожидаемый текст рендерился под другим `mode`.
Мутация отменена, `ProviderButtons.tsx` восстановлен побайтово (через `.bak`), сравнён с
исходным — идентичен. Повторный прогон — все тесты зелёные.

## Что теперь видит человек, открывший `/auth?mode=register`
Экран открывается формой входа по одноразовой ссылке, но с текстами про регистрацию: заголовок
и пояснение MagicLinkForm говорят о создании аккаунта (через `intent="register"`), под формой —
переключатель «Войти по паролю». Дальше, если у деплоя настроены провайдеры (проверено с
мок-списком `['yandex']`, соответствует продовому списку `yandex`/`vk`/`max`), под разделителем
с подписью «или зарегистрируйтесь через» сразу видны полноразмерные кнопки входа через каждый
настроенный провайдер (Яндекс ID, VK ID, MAX) — без клика на «Войти по паролю». Это и есть
восстановленная «лёгкая регистрация»: один клик, без похода за письмом.

## Фактический вывод прогонов (после правки, все зелёные)
```
cd apps/web && npx jest src/features/auth src/app
  Test Suites: 62 passed, 62 total
  Tests:       527 passed, 527 total

cd apps/web && npm run lint
  0 errors, 589 pre-existing warnings (не связаны с правкой, вне apps/web/src/features/auth)

cd apps/web && npm run type-check
  без ошибок (tsc --noEmit)

cd apps/web && npx jest
  Test Suites: 344 passed, 1 skipped, 345 total
  Tests:       4566 passed, 14 skipped, 4580 total

node scripts/check-i18n.mjs
  i18n OK — 271 files in 17 translated sections, 1670 keys.
node scripts/check-codebase-integrity.mjs
  Codebase integrity OK — 4 public env vars all used, 1 Next.js config,
  no unimplemented shipped handlers, 118 app files free of fixture data,
  48 e2e specs all in a project, 21 analytics events all sent,
  81 server env vars all forwarded by compose.
node scripts/check-api-contract.mjs
  API contract OK — 104 frontend paths all resolve to registered routes.
node scripts/check-internal-links.mjs
  Internal links OK — 31 internal hrefs across 388 files all resolve to
  one of 46 App Router pages.
```

## Изменённые файлы
- `apps/web/src/features/auth/components/AuthScreen.tsx` — вынос `ProviderButtons` из ветки
  пароля, рендер безусловно в конце карточки формы.
- `apps/web/src/features/auth/components/__tests__/AuthScreen.test.tsx` — мок
  `@/features/auth/api/providers`, дефолтный `mockResolvedValue([])` в `beforeEach`, новый
  `describe` с 5 регрессионными тестами.

Не тронуты (чужая область): `e2e/tests/`, `playwright.config.ts`,
`openspec/changes/public-support-widget/tasks.md`.
