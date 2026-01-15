# Диаграммы потоков данных My Fitness App

**Версия документа:** 1.0  
**Дата создания:** Январь 2025  
**Статус:** Актуальная реализация v4.0+

---

## Поток данных при регистрации

```mermaid
flowchart TD
    Start([Пользователь на /register]) --> Input[Ввод email и password]
    Input --> Validate{Валидация формы}
    Validate -->|Ошибка| ShowError[Показать ошибку]
    ShowError --> Input
    Validate -->|Успех| CreateAuth[Создание пользователя в Supabase Auth]
    CreateAuth --> CheckInvite{Есть инвайт-код?}
    CheckInvite -->|Да| ValidateCode[Валидация инвайт-кода]
    ValidateCode --> UseCode[use_invite_code в БД]
    UseCode --> GetCoachId[Получение coach_id]
    GetCoachId --> CreateProfile[Создание профиля с coach_id]
    CheckInvite -->|Нет| CreateProfileFree[Создание профиля без coach_id]
    CreateProfile --> CheckTargets{Есть цели?}
    CreateProfileFree --> CheckTargets
    CheckTargets -->|Нет| Onboarding[Редирект на /onboarding]
    CheckTargets -->|Да| Dashboard[Редирект на /app/dashboard]
    Onboarding --> Dashboard
```

---

## Поток данных при вводе питания

```mermaid
flowchart TD
    Start([Пользователь на /app/nutrition]) --> LoadData[Загрузка данных за дату]
    LoadData --> CheckCompleted{День завершен?}
    CheckCompleted -->|Да| BlockEdit[Блокировка редактирования]
    CheckCompleted -->|Нет| AllowEdit[Разрешение редактирования]
    AllowEdit --> UserInput[Ввод данных о питании]
    UserInput --> ClientValidation{Клиентская валидация}
    ClientValidation -->|Ошибка| ShowWarning[Показать предупреждение]
    ShowWarning --> UserInput
    ClientValidation -->|Успех| OptimisticUpdate[Оптимистичное обновление UI]
    OptimisticUpdate --> SaveToDB[Сохранение в БД]
    SaveToDB --> ServerValidation{Серверная валидация}
    ServerValidation -->|Ошибка| Rollback[Откат изменений]
    Rollback --> ShowError[Toast: Ошибка]
    ServerValidation -->|Успех| Success[Toast: Успех]
    Success --> Redirect[Редирект на /app/dashboard]
```

---

## Поток данных в чате

```mermaid
sequenceDiagram
    participant User1 as Пользователь 1
    participant Frontend1 as Frontend 1
    participant Realtime as Supabase Realtime
    participant DB as PostgreSQL
    participant Frontend2 as Frontend 2
    participant User2 as Пользователь 2
    
    User1->>Frontend1: Ввод сообщения
    Frontend1->>DB: INSERT message
    DB-->>Realtime: Broadcast INSERT
    Realtime-->>Frontend1: Подтверждение
    Realtime-->>Frontend2: Новое сообщение
    Frontend2->>User2: Отображение сообщения
    Frontend2->>DB: UPDATE read_at
    DB-->>Realtime: Broadcast UPDATE
    Realtime-->>Frontend1: Сообщение прочитано
    Frontend1->>User1: Индикатор прочтения
```

---

## Поток данных при OCR обработке

```mermaid
flowchart TD
    Start([Пользователь загружает фото]) --> Upload[Загрузка файла]
    Upload --> ValidateFile{Валидация файла}
    ValidateFile -->|Ошибка| ShowError[Показать ошибку]
    ShowError --> Start
    ValidateFile -->|Успех| ChooseMethod{Выбор метода OCR}
    ChooseMethod -->|Tesseract.js| ClientOCR[Клиентское OCR]
    ChooseMethod -->|OpenRouter| ServerOCR[Облачное OCR]
    ClientOCR --> ExtractData[Извлечение данных]
    ServerOCR --> ExtractData
    ExtractData --> ShowResult[Отображение результатов]
    ShowResult --> UserConfirm{Пользователь подтверждает?}
    UserConfirm -->|Редактирует| EditData[Редактирование данных]
    EditData --> UserConfirm
    UserConfirm -->|Подтверждает| SaveOCR[Сохранение в ocr_scans]
    SaveOCR --> FillForm[Заполнение формы питания]
    FillForm --> SaveNutrition[Сохранение в daily_logs]
```

---

## Поток данных при автоматической деактивации подписок

```mermaid
sequenceDiagram
    participant Cron as Cron Job
    participant EdgeFunc as Edge Function
    participant DB as PostgreSQL
    participant Resend as Resend API
    participant User as Пользователь Email
    
    Cron->>EdgeFunc: POST /check-expired-subscriptions
    EdgeFunc->>DB: get_expired_subscriptions()
    DB-->>EdgeFunc: Список истекших подписок
    EdgeFunc->>DB: deactivate_expired_subscriptions()
    DB-->>EdgeFunc: Количество обновленных
    EdgeFunc->>EdgeFunc: Для каждого пользователя
    EdgeFunc->>Resend: Отправка email уведомления
    Resend->>User: Email об истечении подписки
    EdgeFunc-->>Cron: Результат выполнения
```

---

## Поток данных при поиске продуктов

```mermaid
flowchart TD
    Start([Пользователь вводит запрос]) --> CheckCache{Есть в кэше?}
    CheckCache -->|Да| ReturnCache[Возврат из кэша]
    CheckCache -->|Нет| SearchDB[Поиск в БД products]
    SearchDB --> FoundDB{Найдено в БД?}
    FoundDB -->|Да| ReturnDB[Возврат из БД]
    FoundDB -->|Нет| SearchAPI[Поиск в Open Food Facts API]
    SearchAPI --> FoundAPI{Найдено в API?}
    FoundAPI -->|Да| CacheProduct[Кэширование в БД]
    FoundAPI -->|Нет| SearchUserProducts[Поиск в user_products]
    CacheProduct --> ReturnAPI[Возврат результата]
    SearchUserProducts --> ReturnUser[Возврат пользовательских продуктов]
    ReturnCache --> Display[Отображение результатов]
    ReturnDB --> Display
    ReturnAPI --> Display
    ReturnUser --> Display
```

---

## Связанные документы

- [Functional_Specification.md](./Functional_Specification.md) - Функциональная спецификация
- [Diagrams_Index.md](./Diagrams_Index.md) - Индекс всех диаграмм

---

**Последнее обновление:** Январь 2025  
**Версия документа:** 1.0
