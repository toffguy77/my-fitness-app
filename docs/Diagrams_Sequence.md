# Sequence диаграммы My Fitness App

**Версия документа:** 1.0  
**Дата создания:** Январь 2025  
**Статус:** Актуальная реализация v4.0+

---

## Регистрация и онбординг

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Frontend as Frontend
    participant Auth as Supabase Auth
    participant DB as PostgreSQL
    participant Onboarding as Onboarding Page
    
    User->>Frontend: Открывает /register
    Frontend->>User: Показывает форму регистрации
    User->>Frontend: Вводит email и password
    User->>Frontend: Нажимает "Зарегистрироваться"
    Frontend->>Auth: signUp(email, password)
    Auth->>DB: Создание пользователя в auth.users
    DB-->>Auth: Пользователь создан
    Auth-->>Frontend: Успех регистрации
    Frontend->>DB: Создание профиля в profiles
    DB-->>Frontend: Профиль создан
    Frontend->>DB: Проверка наличия целей
    DB-->>Frontend: Целей нет
    Frontend->>Onboarding: Редирект на /onboarding
    Onboarding->>User: Шаг 1: Биометрия
    User->>Onboarding: Вводит данные
    Onboarding->>User: Шаг 2: Активность
    User->>Onboarding: Выбирает активность
    Onboarding->>User: Шаг 3: Цель
    User->>Onboarding: Выбирает цель
    Onboarding->>Onboarding: Расчет BMR/TDEE
    Onboarding->>DB: Создание nutrition_targets
    DB-->>Onboarding: Цели созданы
    Onboarding->>DB: Обновление профиля
    DB-->>Onboarding: Профиль обновлен
    Onboarding->>Frontend: Редирект на /app/dashboard
```

---

## Ввод питания и сохранение

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Frontend as Frontend
    participant Validation as Client Validation
    participant DB as PostgreSQL
    participant ServerValidation as Server Validation
    
    User->>Frontend: Открывает /app/nutrition
    Frontend->>DB: Загрузка данных за дату
    DB-->>Frontend: daily_logs за дату
    Frontend->>User: Отображение формы
    User->>Frontend: Вводит данные о питании
    Frontend->>Validation: Валидация на клиенте
    Validation-->>Frontend: Валидация успешна
    Frontend->>Frontend: Оптимистичное обновление UI
    Frontend->>DB: UPSERT daily_logs
    DB->>ServerValidation: Триггер валидации
    ServerValidation-->>DB: Валидация успешна
    DB-->>Frontend: Данные сохранены
    Frontend->>User: Toast: "Данные сохранены"
    Frontend->>Frontend: Редирект на /app/dashboard
```

---

## Чат между тренером и клиентом

```mermaid
sequenceDiagram
    participant Coach as Тренер
    participant CoachFrontend as Coach Frontend
    participant Realtime as Supabase Realtime
    participant DB as PostgreSQL
    participant ClientFrontend as Client Frontend
    participant Client as Клиент
    
    Coach->>CoachFrontend: Открывает чат
    CoachFrontend->>Realtime: Подписка на messages
    Client->>ClientFrontend: Открывает чат
    ClientFrontend->>Realtime: Подписка на messages
    Coach->>CoachFrontend: Вводит сообщение
    Coach->>CoachFrontend: Нажимает "Отправить"
    CoachFrontend->>DB: INSERT message
    DB-->>Realtime: Broadcast INSERT
    Realtime-->>CoachFrontend: Подтверждение отправки
    Realtime-->>ClientFrontend: Новое сообщение
    ClientFrontend->>Client: Отображение сообщения
    Client->>ClientFrontend: Читает сообщение
    ClientFrontend->>DB: UPDATE read_at
    DB-->>Realtime: Broadcast UPDATE
    Realtime-->>CoachFrontend: Сообщение прочитано
    CoachFrontend->>Coach: Индикатор прочтения
```

---

## OCR обработка фото

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Frontend as Frontend
    participant Tesseract as Tesseract.js
    participant OpenRouter as OpenRouter API
    participant DB as PostgreSQL
    
    User->>Frontend: Загружает фото этикетки
    Frontend->>Frontend: Валидация файла
    Frontend->>Frontend: Выбор метода OCR
    alt Tesseract.js
        Frontend->>Tesseract: Распознавание текста
        Tesseract-->>Frontend: Распознанный текст
    else OpenRouter API
        Frontend->>OpenRouter: POST /chat/completions
        OpenRouter-->>Frontend: Распознанные данные
    end
    Frontend->>Frontend: Извлечение КБЖУ
    Frontend->>User: Отображение результатов
    User->>Frontend: Подтверждает данные
    Frontend->>DB: INSERT ocr_scans
    DB-->>Frontend: Сканирование сохранено
    Frontend->>Frontend: Заполнение формы питания
    Frontend->>User: Форма заполнена
```

---

## Автоматическая деактивация подписок

```mermaid
sequenceDiagram
    participant Cron as Cron Job
    participant EdgeFunc as Edge Function
    participant DB as PostgreSQL
    participant Resend as Resend API
    participant User as Пользователь Email
    
    Cron->>EdgeFunc: POST /check-expired-subscriptions
    EdgeFunc->>DB: SELECT get_expired_subscriptions()
    DB-->>EdgeFunc: Список истекших подписок
    EdgeFunc->>DB: SELECT deactivate_expired_subscriptions()
    DB->>DB: UPDATE profiles SET subscription_status='cancelled'
    DB-->>EdgeFunc: Количество обновленных: 5
    loop Для каждого пользователя
        EdgeFunc->>DB: SELECT email FROM profiles WHERE id=userId
        DB-->>EdgeFunc: Email пользователя
        EdgeFunc->>Resend: POST /emails (subscription_expired)
        Resend->>User: Email об истечении подписки
        Resend-->>EdgeFunc: Email отправлен
    end
    EdgeFunc-->>Cron: Успех: 5 подписок деактивировано
```

---

## Сохранение заметки тренера

```mermaid
sequenceDiagram
    participant Coach as Тренер
    participant Frontend as Frontend
    participant DB as PostgreSQL
    participant NotificationSettings as Notification Settings
    participant EdgeFunc as Edge Function
    participant Resend as Resend API
    participant Client as Клиент Email
    
    Coach->>Frontend: Вводит заметку
    Coach->>Frontend: Нажимает "Сохранить"
    Frontend->>Frontend: Оптимистичное обновление UI
    Frontend->>DB: UPSERT coach_notes
    DB-->>Frontend: Заметка сохранена
    Frontend->>Coach: Toast: "Заметка сохранена"
    Frontend->>NotificationSettings: Проверка настроек клиента
    NotificationSettings-->>Frontend: email_realtime_alerts = true
    Frontend->>EdgeFunc: POST /send-notification
    EdgeFunc->>DB: SELECT email FROM profiles WHERE id=clientId
    DB-->>EdgeFunc: Email клиента
    EdgeFunc->>Resend: POST /emails (coach_note_notification)
    Resend->>Client: Email с заметкой тренера
    Resend-->>EdgeFunc: Email отправлен
    EdgeFunc-->>Frontend: Успех
```

---

## Использование инвайт-кода

```mermaid
sequenceDiagram
    participant User as Новый пользователь
    participant Frontend as Frontend
    participant DB as PostgreSQL
    participant Auth as Supabase Auth
    
    User->>Frontend: Открывает /register?code=ABC12345
    Frontend->>DB: SELECT * FROM invite_codes WHERE code='ABC12345'
    DB-->>Frontend: Инвайт-код найден
    Frontend->>Frontend: Валидация кода (активен, не истек, не превышен лимит)
    Frontend->>User: Показывает форму регистрации
    User->>Frontend: Вводит данные
    User->>Frontend: Нажимает "Зарегистрироваться"
    Frontend->>Auth: signUp(email, password)
    Auth-->>Frontend: Пользователь создан
    Frontend->>DB: SELECT use_invite_code('ABC12345', userId)
    DB->>DB: Проверка кода
    DB->>DB: UPDATE invite_codes SET used_count = used_count + 1
    DB->>DB: INSERT invite_code_usage
    DB-->>Frontend: coach_id тренера
    Frontend->>DB: INSERT profiles (coach_id = coach_id)
    DB-->>Frontend: Профиль создан с тренером
    Frontend->>User: Редирект на /onboarding
```

---

## Связанные документы

- [Functional_Specification.md](./Functional_Specification.md) - Функциональная спецификация
- [API_Reference.md](./API_Reference.md) - Справочник API
- [Diagrams_Index.md](./Diagrams_Index.md) - Индекс всех диаграмм

---

**Последнее обновление:** Январь 2025  
**Версия документа:** 1.0
