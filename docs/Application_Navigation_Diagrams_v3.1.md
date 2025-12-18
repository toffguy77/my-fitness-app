# Диаграммы навигации My Fitness App v3.1

Документация v3.1 отражает **текущую реализацию** навигации в коде (по состоянию на 17 декабря 2025) с добавлением **Onboarding**, **навигации по датам** и **умного копирования приемов пищи**.

---

## Общая навигация приложения (с Onboarding)

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
        Dashboard -->|Settings| Settings[/app/settings]
        Dashboard -->|Reports| Reports[/app/reports]
        
        Nutrition -->|Save/Cancel| Dashboard
        AddMealModal -->|Save| Dashboard
        Reports -->|Back| Dashboard
        Settings -->|Back| Dashboard
        Settings -->|Logout| Login
    end
    
    %% Coach Zone
    subgraph Coach App["/app/coach"]
        CoachList -->|Select Client| ClientView[/app/coach/clientId]
        CoachList -->|Logout| Login
        ClientView -->|Back| CoachList
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
```

**Легенда цветов:**
- 🔵 Голубой — публичные страницы
- 🟠 Оранжевый — Onboarding (новый в v3.1)
- 🟢 Зеленый — страницы клиентов
- 🟡 Желтый — Premium функции / Модальные окна
- 🔵 Синий — страницы тренеров
- 🔴 Красный — админ-панель
- ⚪ Серый — настройки

---

## Детальный флоу: Регистрация и Onboarding

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Register as /register
    participant Dashboard as /app/dashboard
    participant Onboarding as /onboarding
    participant DB as Supabase
    
    User->>Register: Заполняет форму регистрации
    Register->>DB: Create User (Auth)
    Register->>DB: Create Profile (role: client, status: free)
    DB-->>Register: Success
    
    Register->>Dashboard: Redirect /app/dashboard
    
    Dashboard->>DB: Check Nutrition Targets
    DB-->>Dashboard: No targets found
    
    Dashboard->>Onboarding: Redirect /onboarding
    
    User->>Onboarding: Step 1: Биометрия<br/>(Пол, Дата рождения, Рост, Вес)
    User->>Onboarding: Step 2: Активность<br/>(Коэффициент 1.2-1.9)
    User->>Onboarding: Step 3: Цель<br/>(Похудеть/Поддержать/Набрать)
    
    Onboarding->>Onboarding: Calculate BMR<br/>(Harris-Benedict)
    Onboarding->>Onboarding: Calculate TDEE<br/>(BMR × Activity)
    Onboarding->>Onboarding: Calculate Target Calories<br/>(TDEE × Goal Multiplier)
    Onboarding->>Onboarding: Calculate Macros<br/>(30% Protein, 25% Fats, 45% Carbs)
    
    User->>Onboarding: Click "Завершить настройку"
    Onboarding->>DB: Update Profile<br/>(gender, birth_date, height, activity_level)
    Onboarding->>DB: Insert Nutrition Targets<br/>(rest: calculated, training: +200 kcal)
    Onboarding->>DB: Insert Daily Log<br/>(initial weight)
    DB-->>Onboarding: Success
    
    Onboarding->>Dashboard: Redirect /app/dashboard
    Dashboard->>DB: Load Data (targets, logs)
    DB-->>Dashboard: Data loaded
    Dashboard-->>User: Show Dashboard
```

---

## Детальный флоу: Ежедневное использование (The Loop)

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant Nutrition as /app/nutrition
    participant AddMealModal as AddMealModal
    participant DB as Supabase
    
    User->>Dashboard: Вход (Login)
    Dashboard->>DB: Check Targets
    alt No Targets
        Dashboard->>User: Redirect /onboarding
    end
    
    User->>Dashboard: Просмотр "Сегодня"
    
    opt Change Date
        User->>Dashboard: Click < Prev Day
        Dashboard->>DB: Fetch Logs (Selected Date)
        DB-->>Dashboard: Show Selected Date Data
    end
    
    User->>Dashboard: Click "Add Meal"
    Dashboard->>AddMealModal: Open Modal
    
    AddMealModal->>DB: Load Recent Meals<br/>(Last 7 days, unique)
    AddMealModal->>DB: Load Yesterday Meals
    DB-->>AddMealModal: Recent & Yesterday Data
    
    alt Select Recent/Yesterday
        User->>AddMealModal: Click "Недавние" or "Вчера"
        AddMealModal->>AddMealModal: Show List
        User->>AddMealModal: Select Meal
        AddMealModal->>AddMealModal: Fill Form (Switch to "Новый" tab)
    else Enter New
        User->>AddMealModal: Enter New Meal Data
    end
    
    User->>AddMealModal: Click "Сохранить"
    AddMealModal->>DB: Get Existing Log (Selected Date)
    AddMealModal->>DB: Merge Meals & Upsert
    DB-->>AddMealModal: Success
    
    AddMealModal->>Dashboard: Close Modal & Refresh
    Dashboard->>DB: Refresh Data
    DB-->>Dashboard: Updated Data
    Dashboard-->>User: Updated Summary
    
    opt Edit Meal
        User->>Dashboard: Click Meal Card
        Dashboard->>Nutrition: Navigate /nutrition?edit=mealId&date=selectedDate
        Nutrition->>DB: Load Meal by ID
        DB-->>Nutrition: Meal Data
        User->>Nutrition: Edit & Save
        Nutrition->>DB: Update Meal in Array
        Nutrition->>Dashboard: Redirect & Refresh
    end
```

---

## Навигация для клиентов (Client Flow) с Date Navigation

```mermaid
flowchart LR
    Start([Клиент входит]) --> Login[/login]
    Login --> CheckTargets{Есть цели?}
    CheckTargets -->|Нет| Onboarding[/onboarding]
    CheckTargets -->|Да| Dashboard[/app/dashboard]
    Onboarding --> Dashboard
    
    Dashboard -->|Change Date| Dashboard
    Dashboard -->|Ввести питание| Nutrition[/app/nutrition]
    Dashboard -->|Добавить прием| AddMealModal[AddMealModal]
    Dashboard -->|Редактировать прием| Nutrition
    Dashboard -->|Отчеты Premium| Reports[/app/reports]
    Dashboard -->|Настройки| Settings[/app/settings]
    
    AddMealModal -->|Select Recent| AddMealModal
    AddMealModal -->|Copy Yesterday| AddMealModal
    AddMealModal -->|Save| Dashboard
    
    Nutrition -->|Save| Dashboard
    Nutrition -->|Cancel| Dashboard
    Reports -->|Back| Dashboard
    Settings -->|Back| Dashboard
    Settings -->|Logout| Login
    
    style Onboarding fill:#ffebcc
    style Dashboard fill:#d4edda
    style Nutrition fill:#d4edda
    style Reports fill:#fff3cd
    style Settings fill:#e2e3e5
    style AddMealModal fill:#fff9c4
```

---

## Детальный флоу: Date Navigation

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant DB as Supabase
    
    User->>Dashboard: Открыть дашборд (Today)
    Dashboard->>DB: Fetch Logs (Today)
    DB-->>Dashboard: Today's Data
    
    opt Navigate to Previous Day
        User->>Dashboard: Click < Prev Day
        Dashboard->>Dashboard: Set selectedDate = Yesterday
        Dashboard->>DB: Fetch Logs (Yesterday)
        DB-->>Dashboard: Yesterday's Data
        Dashboard-->>User: Show Yesterday Summary
    end
    
    opt Open Date Picker
        User->>Dashboard: Click Date Button
        Dashboard->>User: Show Date Picker
        User->>Dashboard: Select Date (Past)
        Dashboard->>Dashboard: Set selectedDate = Selected
        Dashboard->>DB: Fetch Logs (Selected Date)
        DB-->>Dashboard: Selected Date Data
        Dashboard-->>User: Show Selected Date Summary
    end
    
    opt Edit Data for Selected Date
        User->>Dashboard: Click "Редактировать"
        Dashboard->>Nutrition: Navigate /nutrition?date=selectedDate
        Nutrition->>DB: Load Logs (Selected Date)
        DB-->>Nutrition: Selected Date Data
        User->>Nutrition: Edit & Save
        Nutrition->>DB: Upsert (Selected Date)
        Nutrition->>Dashboard: Redirect /dashboard?date=selectedDate
        Dashboard->>DB: Refresh (Selected Date)
        DB-->>Dashboard: Updated Data
    end
```

---

## Детальный флоу: Smart Copy (AddMealModal)

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant Modal as AddMealModal
    participant DB as Supabase
    
    User->>Dashboard: Click "Добавить прием пищи"
    Dashboard->>Modal: Open Modal
    
    Modal->>DB: Fetch Recent Meals<br/>(Last 7 days, unique by title)
    Modal->>DB: Fetch Yesterday Meals
    DB-->>Modal: Recent (10 max) & Yesterday Meals
    
    Modal-->>User: Show Tabs: Новый / Недавние / Вчера
    
    alt Select Recent Meal
        User->>Modal: Click "Недавние" Tab
        Modal-->>User: Show List of Recent Meals
        User->>Modal: Click Meal (e.g., "Овсянка")
        Modal->>Modal: Fill Form with Meal Data
        Modal->>Modal: Switch to "Новый" Tab
        Modal-->>User: Show Form (Pre-filled)
    else Copy from Yesterday
        User->>Modal: Click "Вчера" Tab
        Modal-->>User: Show List of Yesterday Meals
        User->>Modal: Click Meal (e.g., "Завтрак")
        Modal->>Modal: Fill Form with Meal Data
        Modal->>Modal: Switch to "Новый" Tab
        Modal-->>User: Show Form (Pre-filled)
    end
    
    User->>Modal: Adjust Data (Optional)
    User->>Modal: Click "Сохранить"
    
    Modal->>DB: Get Existing Log (Selected Date)
    DB-->>Modal: Existing Meals Array
    
    Modal->>Modal: Add New Meal to Array
    Modal->>Modal: Recalculate Totals
    
    Modal->>DB: Upsert Daily Log<br/>(with merged meals)
    DB-->>Modal: Success
    
    Modal->>Dashboard: Close Modal
    Dashboard->>DB: Refresh Data
    DB-->>Dashboard: Updated Data
    Dashboard-->>User: Updated Summary
```

---

## Детальный флоу: Onboarding Calculation

```mermaid
flowchart TD
    Start([Пользователь на Step 3]) --> Input[Введены данные:<br/>Пол, Возраст, Рост, Вес,<br/>Активность, Цель]
    
    Input --> CalcAge[Рассчитать возраст<br/>из birth_date]
    CalcAge --> CalcBMR[Calculate BMR<br/>Harris-Benedict Formula]
    
    CalcBMR -->|Male| BMR_Male[88.362 + 13.397×вес +<br/>4.799×рост - 5.677×возраст]
    CalcBMR -->|Female| BMR_Female[447.593 + 9.247×вес +<br/>3.098×рост - 4.330×возраст]
    
    BMR_Male --> CalcTDEE[Calculate TDEE<br/>BMR × Activity Multiplier]
    BMR_Female --> CalcTDEE
    
    CalcTDEE -->|sedentary| TDEE_1.2[BMR × 1.2]
    CalcTDEE -->|light| TDEE_1.375[BMR × 1.375]
    CalcTDEE -->|moderate| TDEE_1.55[BMR × 1.55]
    CalcTDEE -->|active| TDEE_1.725[BMR × 1.725]
    CalcTDEE -->|very_active| TDEE_1.9[BMR × 1.9]
    
    TDEE_1.2 --> ApplyGoal[Apply Goal Multiplier]
    TDEE_1.375 --> ApplyGoal
    TDEE_1.55 --> ApplyGoal
    TDEE_1.725 --> ApplyGoal
    TDEE_1.9 --> ApplyGoal
    
    ApplyGoal -->|lose| Target_0.85[TDEE × 0.85<br/>Дефицит -15%]
    ApplyGoal -->|maintain| Target_1.0[TDEE × 1.0<br/>Баланс]
    ApplyGoal -->|gain| Target_1.1[TDEE × 1.1<br/>Профицит +10%]
    
    Target_0.85 --> CalcMacros[Calculate Macros<br/>30% Protein, 25% Fats, 45% Carbs]
    Target_1.0 --> CalcMacros
    Target_1.1 --> CalcMacros
    
    CalcMacros --> SaveRest[Save Nutrition Target<br/>day_type: 'rest']
    CalcMacros --> SaveTraining[Save Nutrition Target<br/>day_type: 'training'<br/>+200 kcal]
    
    SaveRest --> SaveProfile[Save Profile<br/>gender, birth_date, height, activity_level]
    SaveTraining --> SaveProfile
    
    SaveProfile --> SaveWeight[Save Initial Weight<br/>in daily_logs]
    SaveWeight --> Redirect[Redirect to /app/dashboard]
    
    style CalcBMR fill:#cfe2ff
    style CalcTDEE fill:#cfe2ff
    style ApplyGoal fill:#fff3cd
    style CalcMacros fill:#d4edda
    style SaveRest fill:#d4edda
    style SaveTraining fill:#d4edda
```

---

## Система ролей и доступа (с Onboarding)

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
    CheckTargets -->|Да| ClientPages[Страницы клиента]
    
    Onboarding -->|After Setup| ClientPages
    
    ClientPages --> Dashboard[/app/dashboard]
    ClientPages --> Nutrition[/app/nutrition]
    ClientPages --> Settings[/app/settings]
    ClientPages -->|Premium| Reports[/app/reports]
    
    Role -->|Coach| CoachPages[Страницы тренера]
    CoachPages --> CoachDash[/app/coach]
    CoachPages --> ClientView[/app/coach/clientId]
    
    Role -->|Super Admin| AdminPages[Страницы админа]
    AdminPages --> Admin[/admin]
    
    style Public fill:#e1f5ff
    style Onboarding fill:#ffebcc,stroke:#fd7e14,stroke-width:2px
    style ClientPages fill:#d4edda
    style CoachPages fill:#cfe2ff
    style AdminPages fill:#f8d7da
```

---

## Защита маршрутов (Middleware Logic) v3.1

```mermaid
flowchart TD
    Request([Запрос]) --> CheckAuth{Авторизован?}
    
    CheckAuth -->|Нет| PublicRoute{Публичный<br/>маршрут?}
    PublicRoute -->|Да| Allow[Разрешить доступ]
    PublicRoute -->|Нет| CheckOnboarding{Маршрут<br/>/onboarding?}
    CheckOnboarding -->|Да| RedirectLogin[Редирект на /login]
    CheckOnboarding -->|Нет| RedirectLogin
    
    CheckAuth -->|Да| GetRole[Получить роль и<br/>статус из profiles]
    GetRole --> CheckRoute{Тип маршрута?}
    
    CheckRoute -->|/onboarding| Allow
    CheckRoute -->|/app/reports| CheckPremium{Premium?<br/>active + premium}
    CheckPremium -->|Да| Allow
    CheckPremium -->|Нет| RedirectDashboard[Редирект на<br/>/app/dashboard]
    
    CheckRoute -->|/app/coach| CheckCoach{Роль = Coach?}
    CheckCoach -->|Да| Allow
    CheckCoach -->|Нет| RedirectDashboard
    
    CheckRoute -->|/admin| CheckAdmin{Роль =<br/>Super Admin?}
    CheckAdmin -->|Да| Allow
    CheckAdmin -->|Нет| RedirectDashboard
    
    CheckRoute -->|/app/dashboard| Allow
    CheckRoute -->|/app/nutrition| Allow
    CheckRoute -->|/app/settings| Allow
    
    CheckRoute -->|/| RedirectByRole[Редирект по роли]
    RedirectByRole -->|Client| Dashboard
    RedirectByRole -->|Coach| CoachDash
    RedirectByRole -->|Admin| Admin
    
    style Allow fill:#d4edda
    style RedirectLogin fill:#f8d7da
    style RedirectDashboard fill:#fff3cd
    style CheckOnboarding fill:#ffebcc
```

---

## Флоу добавления приема пищи с копированием

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant Modal as AddMealModal
    participant DB as Supabase
    
    User->>Dashboard: Нажать "Добавить прием пищи"
    Dashboard->>Modal: Открыть модальное окно
    
    Modal->>DB: Загрузить логи за последние 7 дней
    DB-->>Modal: Logs with meals
    
    Modal->>Modal: Собрать уникальные приемы<br/>(по названию, lowercase)
    Modal->>Modal: Ограничить до 10 приемов
    
    Modal->>DB: Загрузить вчерашние приемы
    DB-->>Modal: Yesterday's meals
    
    Modal-->>User: Показать табы:<br/>Новый / Недавние / Вчера
    
    alt Выбрать недавний прием
        User->>Modal: Клик "Недавние"
        Modal-->>User: Список недавних приемов
        User->>Modal: Выбрать "Овсянка"
        Modal->>Modal: Заполнить форму данными
        Modal->>Modal: Переключить на таб "Новый"
    else Скопировать из вчера
        User->>Modal: Клик "Вчера"
        Modal-->>User: Список вчерашних приемов
        User->>Modal: Выбрать "Завтрак"
        Modal->>Modal: Заполнить форму данными
        Modal->>Modal: Переключить на таб "Новый"
    end
    
    User->>Modal: Скорректировать данные (опционально)
    User->>Modal: Нажать "Сохранить"
    
    Modal->>DB: Получить существующий лог<br/>за выбранную дату
    DB-->>Modal: Existing meals array
    
    Modal->>Modal: Добавить новый meal<br/>к существующим
    
    Modal->>DB: Upsert Daily Log<br/>(merge meals array)
    DB-->>Modal: Success
    
    Modal->>Dashboard: Закрыть модальное окно
    Dashboard->>DB: Refresh data
    DB-->>Dashboard: Updated data
    Dashboard-->>User: Обновленная сводка
```

---

## Флоу редактирования приема пищи с Date Navigation

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant Nutrition as /app/nutrition
    participant DB as Supabase
    
    User->>Dashboard: Выбрать дату (Date Navigation)
    Dashboard->>DB: Загрузить данные за выбранную дату
    DB-->>Dashboard: Selected date data
    
    User->>Dashboard: Клик по приему пищи<br/>или иконка редактирования
    Dashboard->>Nutrition: Переход на<br/>/app/nutrition?edit=mealId&date=selectedDate
    
    Nutrition->>DB: Загрузить данные за выбранную дату
    DB-->>Nutrition: Log with meals array
    
    Nutrition->>Nutrition: Найти meal по id<br/>и установить в форму
    
    User->>Nutrition: Редактирует данные приема
    User->>Nutrition: Нажимает "Сохранить"
    
    Nutrition->>DB: Получить существующий лог
    DB-->>Nutrition: Existing meals
    
    Nutrition->>Nutrition: Обновить meal в массиве<br/>(по id)
    Nutrition->>Nutrition: Пересчитать totals
    
    Nutrition->>DB: Upsert Daily Log<br/>(selected date)
    DB-->>Nutrition: Success
    
    Nutrition->>Dashboard: Redirect /dashboard?date=selectedDate
    Dashboard->>DB: Refresh (selected date)
    DB-->>Dashboard: Updated data
    Dashboard-->>User: Обновленная сводка
```

---

*Документ создан: 17 декабря 2025 (на основе текущей реализации в коде v3.1)*


