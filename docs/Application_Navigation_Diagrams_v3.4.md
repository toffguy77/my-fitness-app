# Диаграммы навигации My Fitness App v3.4

Документация v3.4 отражает **текущую реализацию** навигации в коде (по состоянию на 17 декабря 2025) с добавлением функций **Reliability & Safety**: Subscription Lifecycle UI, Notification Preferences и Coach Input Guardrails.

---

## Общая навигация приложения (с Reliability & Safety)

```mermaid
flowchart TD
    Start([Пользователь]) --> Landing[/ Landing Page]
    
    %% Auth Flow
    Landing -->|Guest| Login[/login]
    Landing -->|Guest| Register[/register]
    Landing -->|Auth: Client| CheckTargets{Есть цели?}
    Landing -->|Auth: Coach| CoachList[/app/coach]
    Landing -->|Auth: Admin| AdminPanel[/admin]
    
    %% Registration & Onboarding Flow
    Register -->|Success| CheckTargets
    Login -->|Client| CheckTargets
    
    CheckTargets -->|Нет| Onboarding[/onboarding]
    CheckTargets -->|Да| Dashboard[/app/dashboard]
    Onboarding -->|Save & Calc| Dashboard
    
    %% Client Zone
    subgraph Client App["/app/*"]
        Dashboard -->|Change Date| Dashboard
        Dashboard -->|Input| Nutrition[/app/nutrition]
        Dashboard -->|Add Meal| AddMealModal[AddMealModal]
        Dashboard -->|Check-in| CheckIn{Validate & Save}
        Dashboard -->|Read Note| CoachNote[Coach Note Widget]
        Dashboard -->|Settings| Settings[/app/settings]
        Dashboard -->|Reports| Reports[/app/reports]
        
        Nutrition -->|Save/Cancel| Dashboard
        AddMealModal -->|Save| Dashboard
        CheckIn -->|Free| SuccessModal[Success: Streak]
        CheckIn -->|Premium| NotifyCoach[Notify Coach]
        Reports -->|Back| Dashboard
        Settings -->|Recalculate| RecalcTargets[Update Targets]
        Settings -->|Notifications| NotificationSettings[Notification Settings]
        Settings -->|Back| Dashboard
        Settings -->|Logout| Login
        
        %% Subscription Banner (Global)
        AppLayout[AppLayout] -.->|Shows| SubscriptionBanner[Subscription Banner]
        SubscriptionBanner -.->|If Expired| Settings
    end
    
    %% Coach Zone
    subgraph Coach App["/app/coach"]
        CoachList -->|Traffic Light Sort| ClientView[/app/coach/clientId]
        CoachList -->|Logout| Login
        ClientView -->|Write Note| SaveNote[Save Coach Note]
        ClientView -->|Update Targets| ValidateTargets[Validate & Save]
        ClientView -->|Back| CoachList
        SaveNote -.->|Check Prefs| NotificationQueue[Notification Queue]
        SaveNote -.->|Realtime| SendEmail[Send Email]
        ValidateTargets -->|API| ValidateAPI[/api/nutrition-targets/update]
        ValidateAPI -->|Zod + Custom| ValidationResult{Valid?}
        ValidationResult -->|Error| ErrorToast[Error Toast]
        ValidationResult -->|Success| DB[(Database)]
    end
    
    %% Admin Zone
    subgraph Admin Area["/admin"]
        AdminPanel -->|Manage Users| AdminPanel
        AdminPanel -->|Logout| Login
    end

    style Landing fill:#e1f5ff,stroke:#333
    style Login fill:#e1f5ff,stroke:#333
    style Register fill:#e1f5ff,stroke:#333
    style Onboarding fill:#ffebcc,stroke:#fd7e14,stroke-width:2px
    style Dashboard fill:#d4edda,stroke:#28a745
    style Nutrition fill:#d4edda,stroke:#28a745
    style Reports fill:#fff3cd,stroke:#ffc107
    style Settings fill:#e2e3e5,stroke:#333
    style CoachList fill:#cfe2ff,stroke:#0d6efd
    style ClientView fill:#cfe2ff,stroke:#0d6efd
    style AdminPanel fill:#f8d7da,stroke:#dc3545
    style AddMealModal fill:#fff9c4,stroke:#ffc107
    style CheckIn fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    style CoachNote fill:#cfe2ff,stroke:#0d6efd,stroke-dasharray: 5 5
    style SaveNote fill:#cfe2ff,stroke:#0d6efd
    style SubscriptionBanner fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    style NotificationSettings fill:#e2e3e5,stroke:#333
    style ValidateAPI fill:#198754,stroke:#333,color:#fff
    style ValidationResult fill:#198754,stroke:#333,color:#fff
    style ErrorToast fill:#dc3545,stroke:#333,color:#fff
```

**Легенда цветов:**
- 🔵 Голубой — публичные страницы
- 🟠 Оранжевый — Onboarding
- 🟢 Зеленый — страницы клиентов
- 🟡 Желтый — Premium функции / Модальные окна / Check-in / Subscription Banner
- 🔵 Синий — страницы тренеров / Coach Feedback
- 🔴 Красный — админ-панель / Ошибки валидации
- ⚪ Серый — настройки / Notification Settings
- 🟢 Темно-зеленый — API валидация

---

## Детальный флоу: Subscription Lifecycle

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant AppLayout as AppLayout
    participant Banner as SubscriptionBanner
    participant SubscriptionAPI as checkSubscriptionStatus
    participant DB as Supabase
    participant Dashboard as /app/dashboard
    
    User->>AppLayout: Заходит на любую страницу /app/*
    AppLayout->>Banner: Render SubscriptionBanner
    Banner->>SubscriptionAPI: checkSubscriptionStatus(userId)
    SubscriptionAPI->>DB: Select profile (subscription_status, subscription_end_date)
    DB-->>SubscriptionAPI: Profile Data
    
    alt Subscription Expired
        SubscriptionAPI->>DB: Update subscription_status = 'expired'
        DB-->>SubscriptionAPI: Success
        SubscriptionAPI-->>Banner: { isExpired: true, status: 'expired' }
        Banner->>User: Show Yellow Banner "Подписка истекла"
        
        User->>Dashboard: Заходит на дашборд
        Dashboard->>DB: Check Premium Status
        DB-->>Dashboard: { isPremium: false, isExpired: true }
        Dashboard->>User: Show Paywall вместо Coach Note Widget
    else Subscription Active
        SubscriptionAPI-->>Banner: { isExpired: false, status: 'active' }
        Banner->>User: Hide Banner
    end
    
    User->>Banner: Нажимает "Продлить"
    Banner->>Dashboard: Navigate to /app/settings?tab=subscription
```

---

## Детальный флоу: Notification Preferences

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Settings as /app/settings
    participant NotificationSettings as NotificationSettings Component
    participant DB as Supabase (notification_settings)
    participant Coach as Тренер
    participant CoachUI as /app/coach/clientId
    participant Queue as pending_notifications
    participant EmailAPI as Edge Function
    
    User->>Settings: Открывает настройки
    Settings->>NotificationSettings: Render Component
    NotificationSettings->>DB: Check notification_settings (user_id)
    
    alt Settings Not Found
        DB-->>NotificationSettings: No data
        NotificationSettings->>DB: Insert default settings<br/>(daily_digest: true, realtime: false)
        DB-->>NotificationSettings: Success
    else Settings Found
        DB-->>NotificationSettings: Settings Data
    end
    
    NotificationSettings->>User: Show Toggles
    
    User->>NotificationSettings: Изменяет настройки
    NotificationSettings->>DB: Upsert notification_settings
    DB-->>NotificationSettings: Success
    
    %% Coach writes note
    Coach->>CoachUI: Пишет заметку клиенту
    Coach->>CoachUI: Нажимает "Сохранить заметку"
    CoachUI->>DB: Save coach_notes
    
    CoachUI->>DB: Check notification_settings (client_id)
    DB-->>CoachUI: Settings Data
    
    alt Realtime Alerts Enabled
        CoachUI->>EmailAPI: Send instant notification
        EmailAPI->>User: Email sent
    else Daily Digest Enabled
        CoachUI->>Queue: Insert pending_notification
        Queue-->>CoachUI: Success
        Note over Queue: Future Cron Worker will process
    else Both Disabled
        CoachUI->>CoachUI: Do nothing
    end
```

---

## Детальный флоу: Coach Input Guardrails (Валидация целей)

```mermaid
sequenceDiagram
    participant Coach as Тренер
    participant UI as ClientDashboardView
    participant ClientValidation as validateNutritionTargets
    participant API as /api/nutrition-targets/update
    participant ZodValidation as Zod Schema
    participant CustomValidation as Custom Validation
    participant DB as Supabase
    participant DBConstraints as CHECK Constraints
    
    Coach->>UI: Открывает профиль клиента
    UI->>Coach: Показывает текущие цели
    
    Coach->>UI: Нажимает "Редактировать"
    UI->>Coach: Показывает форму редактирования
    
    Coach->>UI: Вводит: 800 ккал (Ошибка)
    UI->>ClientValidation: validateNutritionTargets({ calories: 800 })
    ClientValidation-->>UI: { valid: false, errors: ["Минимум 1000 ккал"] }
    UI->>Coach: Show ValidationWarning (Red border)
    
    Coach->>UI: Исправляет: 1200 ккал
    UI->>ClientValidation: validateNutritionTargets({ calories: 1200 })
    ClientValidation-->>UI: { valid: true, warnings: ["Низкая норма"] }
    UI->>Coach: Show ValidationWarning (Yellow warning)
    
    Coach->>UI: Нажимает "Сохранить"
    UI->>API: POST /api/nutrition-targets/update<br/>{ calories: 1200, protein: 50, ... }
    
    API->>API: Check Auth (Coach or Super Admin)
    API->>ZodValidation: nutritionTargetsSchema.parse(body)
    
    alt Zod Validation Failed
        ZodValidation-->>API: Error (400)
        API-->>UI: 400 Bad Request { error: "Invalid input", details: [...] }
        UI->>Coach: Show Error Toast
    else Zod Validation Passed
        API->>CustomValidation: validateNutritionTargets(input)
        
        alt Custom Validation Failed
            CustomValidation-->>API: { valid: false, errors: [...] }
            API-->>UI: 400 Bad Request { error: "Unsafe values detected" }
            UI->>Coach: Show Error Toast
        else Custom Validation Passed
            API->>DB: Update nutrition_targets
            DB->>DBConstraints: Check Constraints
            
            alt DB Constraint Failed
                DBConstraints-->>API: Error (constraint violation)
                API-->>UI: 500 Internal Server Error
                UI->>Coach: Show Error Toast
            else DB Constraint Passed
                DB-->>API: Success
                API-->>UI: 200 OK { success: true }
                UI->>Coach: Show Success Toast
                UI->>UI: Update Local State
            end
        end
    end
```

---

## Детальный флоу: Блокировка Premium функций при истечении подписки

```mermaid
sequenceDiagram
    participant User as Пользователь (Expired)
    participant Dashboard as /app/dashboard
    participant SubscriptionAPI as checkSubscriptionStatus
    participant DB as Supabase
    participant CoachNoteWidget as Coach Note Widget
    
    User->>Dashboard: Заходит на дашборд
    Dashboard->>SubscriptionAPI: checkSubscriptionStatus(userId)
    SubscriptionAPI->>DB: Check subscription_end_date
    DB-->>SubscriptionAPI: { endDate: '2024-12-10', status: 'active' }
    
    alt End Date < Now
        SubscriptionAPI->>DB: Update status = 'expired'
        DB-->>SubscriptionAPI: Success
        SubscriptionAPI-->>Dashboard: { isExpired: true, isActive: false }
        
        Dashboard->>Dashboard: setIsPremium(false)
        Dashboard->>User: Hide Coach Note Widget
        Dashboard->>User: Show Paywall Block "Заметки от тренера"
        
        User->>Dashboard: Клик "Продлить подписку"
        Dashboard->>User: Navigate to /app/settings?tab=subscription
    else End Date >= Now
        SubscriptionAPI-->>Dashboard: { isExpired: false, isActive: true }
        Dashboard->>User: Show Coach Note Widget (if note exists)
    end
```

---

## Детальный флоу: Валидация в форме питания

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Nutrition as /app/nutrition
    participant MealValidation as validateMeal
    participant DailyValidation as validateDailyTotals
    participant DB as Supabase
    
    User->>Nutrition: Открывает форму питания
    Nutrition->>User: Показывает форму с приемами пищи
    
    User->>Nutrition: Вводит данные приема пищи
    Nutrition->>MealValidation: validateMeal({ calories: 6000, protein: 100 })
    MealValidation-->>Nutrition: { valid: true, warnings: ["Калорийность очень высокая"] }
    Nutrition->>User: Show ValidationWarning (Yellow)
    
    User->>Nutrition: Вводит еще один прием
    Nutrition->>MealValidation: validateMeal({ calories: -100 })
    MealValidation-->>Nutrition: { valid: false, errors: ["Калории не могут быть отрицательными"] }
    Nutrition->>User: Show ValidationWarning (Red), Disable Save
    
    User->>Nutrition: Исправляет ошибки
    Nutrition->>DailyValidation: validateDailyTotals(totals)
    
    alt Daily Totals Invalid
        DailyValidation-->>Nutrition: { valid: false, errors: ["Дневная норма калорий слишком низкая"] }
        Nutrition->>User: Show ValidationWarning, Disable Save
    else Daily Totals Valid
        DailyValidation-->>Nutrition: { valid: true, warnings: [...] }
        Nutrition->>User: Enable Save Button
        
        User->>Nutrition: Нажимает "Сохранить"
        Nutrition->>DB: Upsert daily_logs
        DB-->>Nutrition: Success
        Nutrition->>User: Redirect to Dashboard
    end
```

---

## Навигация для клиентов (Client Flow) с Subscription Lifecycle

```mermaid
flowchart LR
    Start([Клиент входит]) --> Login[/login]
    Login --> CheckTargets{Есть цели?}
    CheckTargets -->|Нет| Onboarding[/onboarding]
    CheckTargets -->|Да| Dashboard[/app/dashboard]
    Onboarding --> Dashboard
    
    Dashboard -->|Check Subscription| SubscriptionCheck{Subscription Status}
    SubscriptionCheck -->|Expired| ShowBanner[Show Subscription Banner]
    SubscriptionCheck -->|Active| HideBanner[Hide Banner]
    
    Dashboard -->|Ввести питание| Nutrition[/app/nutrition]
    Dashboard -->|Добавить прием| AddMealModal[AddMealModal]
    Dashboard -->|Завершить день| CheckIn[Check-in]
    Dashboard -->|Прочитать заметку| CoachNote{Is Premium?}
    Dashboard -->|Отчеты Premium| Reports[/app/reports]
    Dashboard -->|Настройки| Settings[/app/settings]
    
    CoachNote -->|Yes| ShowNote[Show Coach Note]
    CoachNote -->|No/Expired| ShowPaywall[Show Paywall]
    
    AddMealModal -->|Save| Dashboard
    Nutrition -->|Save| Dashboard
    CheckIn -->|Validate| CheckIn
    CheckIn -->|Success| Dashboard
    
    Settings -->|Уведомления| NotificationSettings[Notification Settings]
    Settings -->|Пересчитать цели| Settings
    Settings -->|Back| Dashboard
    Settings -->|Logout| Login
    
    Reports -->|Back| Dashboard
    
    style Onboarding fill:#ffebcc
    style Dashboard fill:#d4edda
    style Nutrition fill:#d4edda
    style Reports fill:#fff3cd
    style Settings fill:#e2e3e5
    style AddMealModal fill:#fff9c4
    style CheckIn fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    style CoachNote fill:#cfe2ff
    style ShowBanner fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    style ShowPaywall fill:#f8d7da
    style NotificationSettings fill:#e2e3e5
```

---

## Навигация для тренеров (Coach Flow) с Guardrails

```mermaid
flowchart LR
    Start([Тренер входит]) --> Login[/login]
    Login --> CoachList[/app/coach]
    
    CoachList -->|Traffic Light Sort| CoachList
    CoachList -->|Filter by Status| CoachList
    CoachList -->|Select Client| ClientView[/app/coach/clientId]
    
    ClientView -->|Select Date| ClientView
    ClientView -->|Write Note| SaveNote[Save Note]
    ClientView -->|Edit Targets| EditTargets[Edit Targets Form]
    
    EditTargets -->|Input Values| ClientValidation[Client Validation]
    ClientValidation -->|Errors| ShowErrors[Show ValidationWarning]
    ClientValidation -->|Warnings| ShowWarnings[Show Warnings]
    ClientView -->|Save Targets| ValidateAPI[POST /api/nutrition-targets/update]
    
    ValidateAPI -->|Zod Validation| ZodCheck{Zod Valid?}
    ZodCheck -->|No| ErrorToast[Error Toast]
    ZodCheck -->|Yes| CustomValidation[Custom Validation]
    
    CustomValidation -->|Unsafe| ErrorToast
    CustomValidation -->|Safe| DBUpdate[Update Database]
    DBUpdate -->|Success| SuccessToast[Success Toast]
    
    SaveNote -->|Check Prefs| NotificationCheck{Notification Prefs}
    NotificationCheck -->|Realtime| SendEmail[Send Email]
    NotificationCheck -->|Digest| AddQueue[Add to Queue]
    NotificationCheck -->|Off| DoNothing[Do Nothing]
    
    ClientView -->|Back| CoachList
    
    style CoachList fill:#cfe2ff
    style ClientView fill:#cfe2ff
    style SaveNote fill:#cfe2ff
    style EditTargets fill:#fff3cd
    style ValidateAPI fill:#198754,stroke:#333,color:#fff
    style ErrorToast fill:#dc3545,stroke:#333,color:#fff
    style SuccessToast fill:#28a745,stroke:#333,color:#fff
```

---

## Система ролей и доступа (с Subscription Lifecycle)

```mermaid
flowchart TD
    User([Пользователь]) --> Auth{Авторизован?}
    
    Auth -->|Нет| Public[Публичные страницы]
    Public --> Landing[/ Landing]
    Public --> Register[/register]
    Public --> Login[/login]
    
    Auth -->|Да| Role{Роль?}
    
    Role -->|Client| CheckTargets{Есть цели<br/>в nutrition_targets?}
    CheckTargets -->|Нет| Onboarding[/onboarding]
    CheckTargets -->|Да| CheckSubscription{Check Subscription}
    
    CheckSubscription -->|Expired| ExpiredUser[Expired User<br/>Free Features Only]
    CheckSubscription -->|Active| ClientPages[Страницы клиента]
    
    Onboarding -->|After Setup| CheckSubscription
    
    ClientPages --> Dashboard[/app/dashboard]
    ClientPages --> Nutrition[/app/nutrition]
    ClientPages --> Settings[/app/settings]
    ClientPages -->|Premium Only| Reports[/app/reports]
    
    ExpiredUser --> Dashboard
    ExpiredUser --> Nutrition
    ExpiredUser --> Settings
    
    Dashboard -->|Check-in| CheckIn[Daily Check-in]
    Dashboard -->|Read Note| CoachNote{Is Premium?}
    Dashboard -->|Notifications| NotificationSettings[Notification Settings]
    Settings -->|Recalculate| Recalc[Recalculate Targets]
    
    CoachNote -->|Yes| ShowNote[Show Coach Note]
    CoachNote -->|No| ShowPaywall[Show Paywall]
    
    Role -->|Coach| CoachPages[Страницы тренера]
    CoachPages --> CoachDash[/app/coach]
    CoachPages --> ClientView[/app/coach/clientId]
    ClientView -->|Write Note| SaveNote[Save Coach Note]
    ClientView -->|Update Targets| ValidateTargets[Validate Targets]
    
    Role -->|Super Admin| AdminPages[Страницы админа]
    AdminPages --> Admin[/admin]
    
    style Public fill:#e1f5ff
    style Onboarding fill:#ffebcc,stroke:#fd7e14,stroke-width:2px
    style ClientPages fill:#d4edda
    style ExpiredUser fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    style CoachPages fill:#cfe2ff
    style AdminPages fill:#f8d7da
    style CheckIn fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    style CoachNote fill:#cfe2ff,stroke:#0d6efd,stroke-dasharray: 5 5
    style ShowPaywall fill:#f8d7da
    style SaveNote fill:#cfe2ff,stroke:#0d6efd
    style ValidateTargets fill:#198754,stroke:#333,color:#fff
    style NotificationSettings fill:#e2e3e5
    style Recalc fill:#e2e3e5
```

---

## Детальный флоу: Валидация nutrition_targets (Полный цикл)

```mermaid
sequenceDiagram
    participant Coach as Тренер
    participant UI as ClientDashboardView
    participant ClientVal as Client Validation
    participant API as /api/nutrition-targets/update
    participant Zod as Zod Schema
    participant CustomVal as Custom Validation
    participant DB as Supabase
    participant Constraints as DB Constraints
    
    Coach->>UI: Редактирует цели клиента
    Coach->>UI: Вводит: calories = 800 (Ошибка)
    
    UI->>ClientVal: validateNutritionTargets({ calories: 800 })
    ClientVal-->>UI: { valid: false, errors: ["Минимум 1000 ккал"] }
    UI->>Coach: Show ValidationWarning (Red border on input)
    UI->>UI: Disable Save Button
    
    Coach->>UI: Исправляет: calories = 1200
    UI->>ClientVal: validateNutritionTargets({ calories: 1200 })
    ClientVal-->>UI: { valid: true, warnings: ["Низкая норма"] }
    UI->>Coach: Show ValidationWarning (Yellow warning)
    UI->>UI: Enable Save Button
    
    Coach->>UI: Нажимает "Сохранить"
    UI->>API: POST /api/nutrition-targets/update<br/>{ targetId, clientId, calories: 1200, ... }
    
    API->>API: Check Auth (Coach)
    API->>Zod: nutritionTargetsSchema.parse(body)
    
    alt Zod Failed
        Zod-->>API: ValidationError
        API-->>UI: 400 { error: "Invalid input", details: [...] }
        UI->>Coach: Show Error Toast
    else Zod Passed
        API->>CustomVal: validateNutritionTargets(input)
        
        alt Custom Failed
            CustomVal-->>API: { valid: false, errors: [...] }
            API-->>UI: 400 { error: "Unsafe values detected" }
            UI->>Coach: Show Error Toast
        else Custom Passed
            API->>DB: UPDATE nutrition_targets SET ...
            DB->>Constraints: Check Constraints
            
            alt Constraint Failed
                Constraints-->>DB: Error (constraint violation)
                DB-->>API: Error
                API-->>UI: 500 Internal Server Error
                UI->>Coach: Show Error Toast
            else Constraint Passed
                DB-->>API: Success
                API-->>UI: 200 OK { success: true }
                UI->>Coach: Show Success Toast
                UI->>UI: Update Local State
            end
        end
    end
```

---

## Детальный флоу: Notification Queue (Будущий Cron Worker)

```mermaid
sequenceDiagram
    participant Coach as Тренер
    participant CoachUI as /app/coach/clientId
    participant DB as Supabase
    participant Queue as pending_notifications
    participant CronWorker as Future Cron Worker
    participant EmailAPI as Edge Function
    participant Client as Клиент
    
    Coach->>CoachUI: Пишет заметку клиенту
    CoachUI->>DB: Check notification_settings
    DB-->>CoachUI: { email_daily_digest: true, email_realtime_alerts: false }
    
    CoachUI->>DB: Save coach_notes
    DB-->>CoachUI: Success
    
    CoachUI->>Queue: Insert pending_notification<br/>{ type: 'coach_note', content: {...} }
    Queue-->>CoachUI: Success
    
    Note over Queue: Notification queued for digest
    
    %% Future Cron Worker (Not implemented yet)
    CronWorker->>Queue: Select unsent notifications<br/>(sent_at IS NULL)
    Queue-->>CronWorker: List of notifications
    
    loop For Each Notification
        CronWorker->>DB: Get user notification_settings
        DB-->>CronWorker: Settings
        
        alt Daily Digest Enabled
            CronWorker->>CronWorker: Group by user_id
            CronWorker->>EmailAPI: Send daily digest email
            EmailAPI->>Client: Email sent
            CronWorker->>Queue: Update sent_at = NOW()
        else Digest Disabled
            CronWorker->>Queue: Delete notification
        end
    end
```

---

## Флоу блокировки Premium функций

```mermaid
sequenceDiagram
    participant User as Пользователь (Expired)
    participant Banner as SubscriptionBanner
    participant Dashboard as /app/dashboard
    participant CoachNote as Coach Note Widget
    participant Paywall as Paywall Block
    
    User->>Dashboard: Заходит на дашборд
    Dashboard->>Banner: Check subscription status
    Banner->>User: Show Yellow Banner "Подписка истекла"
    
    Dashboard->>Dashboard: Check isPremium (false)
    Dashboard->>User: Hide Coach Note Widget
    
    User->>Dashboard: Просматривает дашборд
    Dashboard->>Paywall: Show "Заметки от тренера" Paywall
    
    User->>Paywall: Клик "Продлить подписку"
    Paywall->>Dashboard: Navigate to /app/settings?tab=subscription
    
    User->>Dashboard: Пытается открыть /app/reports
    Dashboard->>Dashboard: Check isPremium (false)
    Dashboard->>User: Show Paywall или Redirect
```

---

*Документ создан: 17 декабря 2025 (на основе текущей реализации в коде v3.4)*

