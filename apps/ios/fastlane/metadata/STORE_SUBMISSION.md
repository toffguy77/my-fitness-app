# Подача «Взвешено» 1.0.0 на ревью App Store — чек-лист владельца

Приложение `team.burcev.app`, версия 1.0.0. Lane `metadata` загружает название,
подзаголовок, ссылку на политику, категории, copyright, описание, ключевые слова,
рекламный текст, ссылки поддержки и маркетинга и скриншоты. Всё остальное ниже
вводится руками в App Store Connect. Длины и запрещённые слова в текстах проверяет
`node --test scripts/__tests__/appstore-metadata.test.mjs`, его же запускает CI.

## 0. До начала

- [ ] Сборка 1.0.0 обработана (`ios-status-*` или lane `status`: `VALID`) и выбрана
      в версии 1.0.0 (раздел Build).
- [ ] Тексты загружены: тег `ios-meta-*` (lane `metadata`) прошёл без «Не загрузилось».
- [ ] Политика https://burcev.team/legal/privacy уже на проде **с разделами 2-а
      «Данные Apple Здоровье (HealthKit)» и 9-а «Приложение для iPhone»**. Ревьюер
      открывает её первой у приложения с HealthKit (5.1.2, 5.1.3). Пока изменение
      не выкачено на прод, подавать нельзя.

## 1. App Privacy

App Store Connect → App Privacy. Ответы по шагам — в `app_privacy.txt` рядом с этим
файлом (тип данных → цель → связан с пользователем → отслеживание). Итог: отслеживания
нет, все типы связаны с пользователем, данные Здоровья — только App Functionality.
После ответов нажать **Publish**: неопубликованная анкета ревью не проходит.

## 2. Возрастной рейтинг (Age Rating)

App Information → Age Rating → Edit. Ответы и почему:

| Раздел | Вопрос | Ответ | Почему |
|---|---|---|---|
| In-App Controls | Parental Controls | No | родительского контроля нет |
| | Age Assurance | No | возраст не проверяется |
| Capabilities | Unrestricted Web Access | No | встроенного браузера нет; статьи — наш контент, ссылки открываются в Safari |
| | User-Generated Content | No | публичного контента пользователей нет: ленты, комментариев, профилей, видимых другим, нет |
| | Messaging and Chat | **Yes** | переписка один на один с куратором — сотрудником сервиса (не с другими пользователями) |
| | Advertising | No | рекламы нет |
| Mature Themes | Profanity or Crude Humor | None | |
| | Horror/Fear Themes | None | |
| | Alcohol, Tobacco, or Drug Use or References | None | проверить каталог рецептов: если в рецептах есть вино или пиво как ингредиент — Infrequent |
| Medical or Wellness | Medical or Treatment Information | **Infrequent** (рекомендуется) | приложение не лечит и не ставит диагнозов (оговорка в описании), но статьи раздела «Здоровье» и разговор с куратором иногда касаются заболеваний и ограничений в питании. С None рейтинг 9+, с Infrequent — 13+. Занижение — частая причина вопроса ревью, поэтому запасной вариант дороже |
| | Health or Wellness Topics | **Yes** | питание, вес, КБЖУ, похудение |
| Sexuality or Nudity | все вопросы | None | фото прогресса видит только куратор, публичного показа нет |
| Violence | все вопросы | None | |
| Chance-Based Activities | Simulated Gambling | None | |
| | Gambling | No | |
| | Contests | None | |
| | Loot Boxes | No | |

Ожидаемый итог: **13+** (с Medical = None — 9+). App Store Connect считает рейтинг
сам, руками его не задают. Флаг «Made for Kids» не ставить.

## 3. Цена и доступность (Pricing and Availability)

- [ ] Price: **Free** (0, без встроенных покупок — In-App Purchases не заводить).
- [ ] Availability: Россия. Если открывать другие страны, сначала решить вопрос DSA
      (ниже) и языка: страница только на русском.
- [ ] Pre-orders — нет.

## 4. Статус трейдера по DSA (Digital Services Act)

Нужен, только если приложение доступно в странах ЕС. При доступности только в России
статус можно не указывать, и App Store Connect не пустит в ЕС, пока его нет. Если ЕС
понадобится: Business → Compliance → Digital Services Act. ИП, получающий доход от
услуг куратора, — это **трейдер**; тогда Apple публикует на странице приложения адрес,
телефон и почту — их надо подготовить заранее (почта: support@burcev.team).

## 5. Соглашения (Agreements)

- [ ] Business → Agreements: **Free Apps Agreement** принят Account Holder'ом (для
      бесплатного приложения достаточно; Paid Apps Agreement не нужен — встроенных
      покупок нет).
- [ ] В Business нет баннеров о новых условиях Apple Developer Program License
      Agreement: непринятые условия блокируют подачу.

## 6. App Review Information

- [ ] Sign-in required: **Yes**.
- [ ] User name: `e2e-appreview-client@burcev.team`.
- [ ] Password: из `.claude/CLAUDE.local.md` / менеджера паролей. **В git его нет и
      не будет.**
- [ ] Перед подачей войти этим аккаунтом самому: вход паролем работает, доступ к
      куратору активен, назначен **живой** куратор (не служебный `e2e-*`), и он
      ответит в рабочее время. Служебный куратор достаётся только служебному клиенту
      (CLAUDE.md, «Служебные учётки») — ревьюер, у которого никто не отвечает,
      отклоняет по 2.1.
- [ ] Notes: текст из `review_information/notes.txt` (блоки RU и EN), заглушку пароля
      заменить не надо — пароль вводится в поле Password.
- [ ] Contact Information: имя, телефон и почта человека, который ответит ревью за
      сутки.
- [ ] Attachment: по желанию — запись экрана: вход демо-аккаунтом, «Профиль →
      Здоровье», системный запрос HealthKit, удаление аккаунта.

## 7. Экспортный контроль (Export Compliance)

`ITSAppUsesNonExemptEncryption = false` уже в `project.yml` (Info.plist): приложение
использует только шифрование системы (HTTPS, Keychain). Вопрос о шифровании при
выборе сборки не появится; если появится — «None of the algorithms mentioned above».
Документы для Франции не нужны.

## 8. Права на контент (Content Rights)

App Information → Content Rights → «Does your app contain, show, or access third-party
content?» Честный ответ — **Yes** (каталог рецептов, база продуктов), и тогда нужно
подтвердить, что права есть. До ответа:

- [ ] Подтвердить лицензию на 284 рецепта, импортированных из каталога ВкусВилла
      (`scripts/import-vkusvill-recipes.mjs`): тексты и фото рецептов — чужой контент.
- [ ] Подтвердить условия использования базы продуктов (источник состава и КБЖУ).
- [ ] Статьи — свои (или с правами авторов).

Без подтверждённых прав рецепты лучше скрыть до подачи, чем отвечать «права есть».

## 9. Прочие поля версии

- [ ] **What's New**: для первой версии App Store Connect этого поля не показывает.
      Текст на будущее лежит в `ru/release_notes.txt`; lane `metadata` его не
      загружает — добавить поле `whats_new` в lane, начиная с версии 1.0.1.
- [ ] Скриншоты 6,9" (обязательные) загружены; на них нет цен, тарифов и кнопок
      оплаты.
- [ ] Version Release: Manual — выпускать руками после одобрения.
- [ ] Категории: Health & Fitness, вторая — Food & Drink (загружает lane).
- [ ] Удаление аккаунта (5.1.1(v)): «Профиль → Удалить аккаунт» — работает на демо.

## 10. Если отклонили по 3.1.1 или 3.1.3(d)

Работа с куратором — живой специалист, ведущий клиента один на один, это услуга
«человек — человек» в реальном времени (3.1.3(d)), её можно оплачивать вне
приложения. В приложении нет цен, кнопок покупки, форм заявки и ссылок на оплату.
Если ревьюер всё же нашёл ссылку или текст — сначала убрать его в коде, потом
отвечать. Ответ в Resolution Center:

**RU**

> Здравствуйте! Спасибо за проверку.
>
> Работа с куратором в «Взвешено» — персональная услуга, которую в реальном времени
> оказывает один человек другому: живой специалист-нутрициолог один на один ведёт
> клиента — читает его дневник питания, отвечает в переписке, ставит задачи и пишет
> отзыв на недельный отчёт. По пункту 3.1.3(d) App Review Guidelines такие услуги
> могут оплачиваться вне приложения.
>
> В приложении нет цен, кнопок покупки, форм заявки, ссылок на оплату или на
> страницу тарифов и иных призывов оплатить услугу вне приложения. Пользователь без
> доступа видит только описание работы с куратором и кнопку «Написать в поддержку».
> Все остальные функции — дневник, поиск продуктов, сканер штрихкодов, распознавание
> блюд по фото, меню, статьи и интеграция с Apple Здоровье — доступны каждому
> вошедшему пользователю без оплаты.
>
> Если вы нашли в приложении место, которое выглядит как призыв к покупке,
> пожалуйста, укажите экран — мы уберём его в следующей сборке.

**EN**

> Hello, and thank you for the review.
>
> Curator access in Vzvesheno is a person-to-person service provided in real time:
> a live nutrition specialist works one-on-one with the client — reads their food
> diary, replies in the chat, assigns tasks and reviews the weekly report. Under
> App Review Guideline 3.1.3(d), such real-time person-to-person services may be
> paid for outside the app.
>
> The app contains no prices, purchase buttons, request forms, payment or pricing
> links, or any other call to action to pay outside the app. A user without access
> sees only a description of the curator service and a "Contact support" button.
> All other features — the food diary, food search, barcode scanner, photo meal
> recognition, the daily menu, articles and the Apple Health integration — are
> available to every signed-in user at no charge.
>
> If you found a screen that reads as a call to purchase, please tell us which one
> and we will remove it in the next build.
