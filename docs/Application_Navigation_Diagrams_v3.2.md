# Диаграммы навигации My Fitness App v3.2

Документация v3.2 отражает **текущую реализацию** навигации в коде (по состоянию на 17 декабря 2025) с добавлением **Feedback Loop** (петли обратной связи): Daily Check-in, Coach Feedback, улучшенный Coach Dashboard и пересчет целей.

---

## Общая навигация приложения (с Feedback Loop)

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
        Settings -->|Back| Dashboard
        Settings -->|Logout| Login
    end
    
    %% Coach Zone
    subgraph Coach App["/app/coach"]
        CoachList -->|Traffic Light Sort| ClientView[/app/coach/clientId]
        CoachList -->|Logout| Login
        ClientView -->|Write Note| SaveNote[Save Coach Note]
        ClientView -->|Back| CoachList
        SaveNote -.->|Realtime| CoachNote
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
```

**Легенда цветов:**
- 🔵 Голубой — публичные страницы
- 🟠 Оранжевый — Onboarding
- 🟢 Зеленый — страницы клиентов
- 🟡 Желтый — Premium функции / Модальные окна / Check-in
- 🔵 Синий — страницы тренеров / Coach Feedback
- 🔴 Красный — админ-панель
- ⚪ Серый — настройки

---

## Детальный флоу: Daily Check-in

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant DB as Supabase
    participant CoachUI as Coach Dashboard
    
    User->>Dashboard: Просматривает данные за день
    Dashboard->>DB: Load daily_logs (selectedDate)
    DB-->>Dashboard: Log Data (is_completed, weight, meals)
    
    alt Day Not Completed
        User->>Dashboard: Нажимает "Завершить день"
        Dashboard->>Dashboard: Validate (weight && calories > 0)
        
        alt Validation Failed
            Dashboard->>User: Alert "Введите вес" или "Добавьте прием пищи"
        else Validation Success
            Dashboard->>DB: Update daily_logs<br/>(is_completed=true, completed_at=NOW())
            DB-->>Dashboard: Success
            
            alt Premium User
                Dashboard->>User: Alert "Тренер получит уведомление"
                Dashboard->>CoachUI: Status Update (Green)
            else Free User
                Dashboard->>DB: Calculate Streak (consecutive days)
                DB-->>Dashboard: Streak Count
                Dashboard->>User: Alert "Стрик: N дней"
            end
            
            Dashboard->>Dashboard: Block Editing (hide buttons)
            Dashboard->>Dashboard: Show "День завершен" indicator
        end
    else Day Already Completed
        Dashboard->>User: Show "День завершен" (read-only)
    end
```

---

## Детальный флоу: Coach Feedback (Асинхронный чат)

```mermaid
sequenceDiagram
    participant Coach as Тренер
    participant CoachUI as /app/coach/clientId
    participant DB as Supabase (coach_notes)
    participant ClientUI as /app/dashboard
    participant Client as Клиент
    
    %% Coach writes note
    Coach->>CoachUI: Открывает профиль клиента
    CoachUI->>DB: Load existing note (selectedDate)
    DB-->>CoachUI: Note or null
    
    Coach->>CoachUI: Выбирает дату (Date Picker)
    CoachUI->>DB: Load note for date
    DB-->>CoachUI: Existing note or empty
    
    Coach->>CoachUI: Вводит текст заметки
    Coach->>CoachUI: Нажимает "Сохранить заметку"
    CoachUI->>DB: Upsert coach_notes<br/>(client_id, coach_id, date, content)
    DB-->>CoachUI: Success
    CoachUI->>Coach: Alert "Заметка сохранена!"
    
    %% Client receives feedback
    Client->>ClientUI: Заходит на дашборд
    ClientUI->>DB: Check Premium & coach_id
    ClientUI->>DB: Load coach_notes (selectedDate)
    DB-->>ClientUI: Note Content
    
    alt Note Exists
        ClientUI->>Client: Show "Сообщение от тренера" Widget
    else No Note
        ClientUI->>Client: Hide Widget
    end
    
    Client->>ClientUI: Меняет дату (Date Navigation)
    ClientUI->>DB: Load coach_notes (new date)
    DB-->>ClientUI: Note for new date
    ClientUI->>Client: Update Widget (or hide)
```

---

## Детальный флоу: Coach Dashboard v2 (Traffic Light System)

```mermaid
sequenceDiagram
    participant Coach as Тренер
    participant CoachUI as /app/coach
    participant DB as Supabase
    
    Coach->>CoachUI: Открывает кабинет тренера
    CoachUI->>DB: Load Coach Clients
    DB-->>CoachUI: List of Clients
    
    loop For Each Client
        CoachUI->>DB: Load todayLog (date=today)
        CoachUI->>DB: Load nutrition_targets
        CoachUI->>DB: Load lastLog (date)
        DB-->>CoachUI: Log Data (is_completed, calories, etc.)
        
        CoachUI->>CoachUI: Calculate Status:
        Note over CoachUI: if (todayLog && target):<br/>  if (is_completed && diff <= 15%): Green<br/>  else if (is_completed && diff > 15%): Yellow<br/>  else if (!is_completed && diff > 15%): Red<br/>  else: Yellow<br/>else if (!todayLog):<br/>  if (hours > 48): Red<br/>  else if (hours > 24): Yellow<br/>  else: Grey
    end
    
    CoachUI->>CoachUI: Sort by Status Priority:<br/>Red (1) > Yellow (2) > Grey (3) > Green (4)
    CoachUI->>Coach: Display Sorted List
    
    Coach->>CoachUI: Filter by Status (Red/Yellow/Green/Grey)
    CoachUI->>Coach: Show Filtered List
    
    Coach->>CoachUI: Click Client
    CoachUI->>Coach: Navigate to /app/coach/clientId
```

---

## Детальный флоу: Target Recalculation

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Settings as /app/settings
    participant DB as Supabase
    
    User->>Settings: Открывает настройки
    Settings->>DB: Load nutrition_targets (rest & training)
    DB-->>Settings: Current Targets
    
    Settings->>User: Display Current Targets
    
    User->>Settings: Нажимает "Пересчитать по текущему весу"
    Settings->>Settings: Validate Biometric Data<br/>(height, birth_date, gender, activity_level)
    
    alt Missing Data
        Settings->>User: Alert "Пройдите onboarding"
        Settings->>User: Redirect to /onboarding
    else Data Exists
        Settings->>DB: Get Last Weight from daily_logs
        DB-->>Settings: Last Weight
        
        Settings->>Settings: Calculate Age from birth_date
        Settings->>Settings: Calculate BMR<br/>(Harris-Benedict Formula)
        Settings->>Settings: Calculate TDEE<br/>(BMR × Activity Multiplier)
        Settings->>Settings: Determine Goal Multiplier<br/>(from current targets)
        Settings->>Settings: Calculate Target Calories<br/>(TDEE × Goal Multiplier)
        Settings->>Settings: Calculate Macros<br/>(30% Protein, 25% Fats, 45% Carbs)
        
        Settings->>DB: Update nutrition_targets (rest)
        Settings->>DB: Update nutrition_targets (training, +200 kcal)
        DB-->>Settings: Success
        
        Settings->>Settings: Update Local State
        Settings->>User: Alert "Цели успешно пересчитаны!"
    end
```

---

## Навигация для клиентов (Client Flow) с Check-in

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
    Dashboard -->|Завершить день| CheckIn[Check-in]
    Dashboard -->|Прочитать заметку| CoachNote[Coach Note]
    Dashboard -->|Отчеты Premium| Reports[/app/reports]
    Dashboard -->|Настройки| Settings[/app/settings]
    
    AddMealModal -->|Save| Dashboard
    Nutrition -->|Save| Dashboard
    CheckIn -->|Validate| CheckIn
    CheckIn -->|Success| Dashboard
    CheckIn -->|Block Editing| Dashboard
    
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
```

---

## Навигация для тренеров (Coach Flow) с Feedback

```mermaid
flowchart LR
    Start([Тренер входит]) --> Login[/login]
    Login --> CoachList[/app/coach]
    
    CoachList -->|Traffic Light Sort| CoachList
    CoachList -->|Filter by Status| CoachList
    CoachList -->|Select Client| ClientView[/app/coach/clientId]
    
    ClientView -->|Select Date| ClientView
    ClientView -->|Write Note| SaveNote[Save Note]
    ClientView -->|Back| CoachList
    
    SaveNote -.->|Realtime| ClientDashboard[Client Dashboard]
    
    style CoachList fill:#cfe2ff
    style ClientView fill:#cfe2ff
    style SaveNote fill:#cfe2ff
    style ClientDashboard fill:#d4edda,stroke-dasharray: 5 5
```

---

## Детальный флоу: Блокировка редактирования завершенных дней

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant Nutrition as /app/nutrition
    participant DB as Supabase
    
    User->>Dashboard: Выбирает дату
    Dashboard->>DB: Load daily_logs (selectedDate)
    DB-->>Dashboard: Log Data (is_completed=true)
    
    Dashboard->>Dashboard: Check is_completed
    Dashboard->>User: Hide/Disable Edit Buttons
    Dashboard->>User: Show "День завершен" indicator
    
    User->>Dashboard: Клик "Редактировать" (hidden)
    Note over Dashboard: Button is hidden
    
    User->>Dashboard: Клик "Добавить прием пищи" (hidden)
    Note over Dashboard: Button is hidden
    
    User->>Nutrition: Direct URL /nutrition?date=completedDate
    Nutrition->>DB: Load daily_logs (date)
    DB-->>Nutrition: Log Data (is_completed=true)
    Nutrition->>Nutrition: Check is_completed
    Nutrition->>User: Alert "День завершен. Редактирование недоступно."
    Nutrition->>Dashboard: Redirect /dashboard?date=completedDate
```

---

## Система ролей и доступа (с Feedback Loop)

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
    
    Dashboard -->|Check-in| CheckIn[Daily Check-in]
    Dashboard -->|Read Note| CoachNote[Coach Feedback]
    Settings -->|Recalculate| Recalc[Recalculate Targets]
    
    Role -->|Coach| CoachPages[Страницы тренера]
    CoachPages --> CoachDash[/app/coach]
    CoachPages --> ClientView[/app/coach/clientId]
    ClientView -->|Write Note| SaveNote[Save Coach Note]
    
    Role -->|Super Admin| AdminPages[Страницы админа]
    AdminPages --> Admin[/admin]
    
    style Public fill:#e1f5ff
    style Onboarding fill:#ffebcc,stroke:#fd7e14,stroke-width:2px
    style ClientPages fill:#d4edda
    style CoachPages fill:#cfe2ff
    style AdminPages fill:#f8d7da
    style CheckIn fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    style CoachNote fill:#cfe2ff,stroke:#0d6efd,stroke-dasharray: 5 5
    style SaveNote fill:#cfe2ff,stroke:#0d6efd
    style Recalc fill:#e2e3e5
```

---

## Детальный флоу: Ежедневное использование с Check-in

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant Nutrition as /app/nutrition
    participant DB as Supabase
    participant Coach as Тренер
    
    User->>Dashboard: Вход (Login)
    Dashboard->>DB: Check Targets
    alt No Targets
        Dashboard->>User: Redirect /onboarding
    end
    
    User->>Dashboard: Просмотр "Сегодня"
    Dashboard->>DB: Load Logs (selectedDate)
    DB-->>Dashboard: Log Data (is_completed, meals, weight)
    
    opt Day Not Completed
        User->>Dashboard: Вводит вес
        User->>Dashboard: Добавляет приемы пищи
        User->>Dashboard: Нажимает "Завершить день"
        
        Dashboard->>Dashboard: Validate (weight && calories > 0)
        Dashboard->>DB: Update (is_completed=true, completed_at=NOW())
        DB-->>Dashboard: Success
        
        alt Premium
            Dashboard->>Coach: Status Update (Green)
            Dashboard->>User: "Тренер получит уведомление"
        else Free
            Dashboard->>DB: Calculate Streak
            Dashboard->>User: "Стрик: N дней"
        end
        
        Dashboard->>Dashboard: Block All Editing
    end
    
    opt Coach Reviews
        Coach->>DB: Sees Status (Green)
        Coach->>Coach: Opens Client Profile
        Coach->>DB: Writes Note
        DB-->>User: Note Available
    end
    
    User->>Dashboard: Next Day
    Dashboard->>DB: Load Coach Note (Yesterday)
    DB-->>Dashboard: Note Content
    Dashboard->>User: Shows Note Widget
```

---

## Детальный флоу: Пересчет целей в настройках

```mermaid
flowchart TD
    Start([Пользователь в настройках]) --> LoadTargets[Загрузить текущие цели]
    LoadTargets --> DisplayTargets[Отобразить цели<br/>Rest & Training]
    
    DisplayTargets --> UserClick[Пользователь нажимает<br/>"Пересчитать по текущему весу"]
    
    UserClick --> ValidateBio{Есть биометрические<br/>данные?}
    ValidateBio -->|Нет| RedirectOnboarding[Редирект на /onboarding]
    ValidateBio -->|Да| GetWeight[Получить последний вес<br/>из daily_logs]
    
    GetWeight --> CheckWeight{Вес найден?}
    CheckWeight -->|Нет| AlertWeight[Alert: "Введите вес"]
    CheckWeight -->|Да| CalcAge[Рассчитать возраст<br/>из birth_date]
    
    CalcAge --> CalcBMR[Calculate BMR<br/>Harris-Benedict]
    CalcBMR --> CalcTDEE[Calculate TDEE<br/>BMR × Activity]
    
    CalcTDEE --> GetGoalMultiplier[Определить Goal Multiplier<br/>из текущих целей]
    GetGoalMultiplier --> CalcTargetCal[Calculate Target Calories<br/>TDEE × Goal Multiplier]
    
    CalcTargetCal --> CalcMacros[Calculate Macros<br/>30% Protein, 25% Fats, 45% Carbs]
    
    CalcMacros --> UpdateRest[Update nutrition_targets<br/>day_type: 'rest']
    CalcMacros --> UpdateTraining[Update nutrition_targets<br/>day_type: 'training'<br/>+200 kcal]
    
    UpdateRest --> UpdateState[Update Local State]
    UpdateTraining --> UpdateState
    UpdateState --> ShowSuccess[Alert: "Цели успешно пересчитаны!"]
    
    style ValidateBio fill:#fff3cd
    style CalcBMR fill:#cfe2ff
    style CalcTDEE fill:#cfe2ff
    style CalcMacros fill:#d4edda
    style UpdateRest fill:#d4edda
    style UpdateTraining fill:#d4edda
```

---

## Детальный флоу: Coach Dashboard v2 - Определение статуса

```mermaid
flowchart TD
    Start([Загрузка клиента]) --> LoadData[Загрузить:<br/>todayLog, target, lastLog]
    
    LoadData --> CheckTodayLog{Есть todayLog?}
    
    CheckTodayLog -->|Да| CheckTarget{Есть target?}
    CheckTarget -->|Да| CalcDiff[Рассчитать отклонение<br/>diff = |actual - target| / target]
    
    CalcDiff --> CheckCompleted{is_completed?}
    CheckCompleted -->|Да| CheckDiffCompleted{diff <= 15%?}
    CheckDiffCompleted -->|Да| StatusGreen[🟢 Green:<br/>День закрыт, в норме]
    CheckDiffCompleted -->|Нет| StatusYellow1[🟡 Yellow:<br/>День закрыт, отклонение > 15%]
    
    CheckCompleted -->|Нет| CheckDiffNotCompleted{diff > 15%?}
    CheckDiffNotCompleted -->|Да| StatusRed1[🔴 Red:<br/>День не закрыт, отклонение > 15%]
    CheckDiffNotCompleted -->|Нет| StatusYellow2[🟡 Yellow:<br/>День не закрыт, в пределах нормы]
    
    CheckTarget -->|Нет| StatusGrey1[⚪ Grey:<br/>Нет цели]
    
    CheckTodayLog -->|Нет| CheckHours[Рассчитать hoursSinceLastCheckin]
    CheckHours --> CheckHours48{hours > 48?}
    CheckHours48 -->|Да| StatusRed2[🔴 Red:<br/>Нет отчета > 48 часов]
    CheckHours48 -->|Нет| CheckHours24{hours > 24?}
    CheckHours24 -->|Да| StatusYellow3[🟡 Yellow:<br/>Нет отчета > 24 часов]
    CheckHours24 -->|Нет| StatusGrey2[⚪ Grey:<br/>Нет данных, но недавно был чекин]
    
    StatusGreen --> Sort[Сортировка по приоритету:<br/>Red (1) > Yellow (2) > Grey (3) > Green (4)]
    StatusYellow1 --> Sort
    StatusRed1 --> Sort
    StatusYellow2 --> Sort
    StatusGrey1 --> Sort
    StatusRed2 --> Sort
    StatusYellow3 --> Sort
    StatusGrey2 --> Sort
    
    Sort --> Display[Отображение в списке]
    
    style StatusRed1 fill:#f8d7da
    style StatusRed2 fill:#f8d7da
    style StatusYellow1 fill:#fff3cd
    style StatusYellow2 fill:#fff3cd
    style StatusYellow3 fill:#fff3cd
    style StatusGreen fill:#d4edda
    style StatusGrey1 fill:#e2e3e5
    style StatusGrey2 fill:#e2e3e5
```

---

## Флоу блокировки редактирования завершенных дней

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant Nutrition as /app/nutrition
    participant DB as Supabase
    
    User->>Dashboard: Выбирает дату
    Dashboard->>DB: Fetch daily_logs (selectedDate)
    DB-->>Dashboard: { is_completed: true, ... }
    
    Dashboard->>Dashboard: Check is_completed
    Dashboard->>User: Hide "Редактировать" button
    Dashboard->>User: Hide "Добавить прием пищи" buttons
    Dashboard->>User: Disable meal edit buttons
    Dashboard->>User: Show "День завершен" indicator
    
    opt User tries to edit
        User->>Nutrition: Direct URL /nutrition?date=completedDate
        Nutrition->>DB: Fetch daily_logs (date)
        DB-->>Nutrition: { is_completed: true, ... }
        Nutrition->>Nutrition: Check is_completed
        Nutrition->>User: Alert "День завершен. Редактирование недоступно."
        Nutrition->>Dashboard: Redirect /dashboard?date=completedDate
    end
```

---

## Флоу Coach Feedback (Полный цикл)

```mermaid
sequenceDiagram
    participant Client as Клиент (Premium)
    participant Dashboard as /app/dashboard
    participant DB as Supabase
    participant Coach as Тренер
    participant CoachUI as /app/coach/clientId
    
    %% Client finishes day
    Client->>Dashboard: Завершает день (Check-in)
    Dashboard->>DB: Update (is_completed=true)
    DB-->>Coach: Status Update (Green)
    
    %% Coach reviews
    Coach->>CoachUI: Видит клиента в топе списка
    Coach->>CoachUI: Открывает профиль
    CoachUI->>DB: Fetch Logs (selectedDate)
    DB-->>CoachUI: Client Data
    
    Coach->>CoachUI: Выбирает дату (Date Picker)
    CoachUI->>DB: Load existing note (date)
    DB-->>CoachUI: Note or null
    
    Coach->>CoachUI: Вводит текст: "Много жиров, убери орехи"
    Coach->>CoachUI: Нажимает "Сохранить заметку"
    CoachUI->>DB: Upsert coach_notes<br/>(client_id, coach_id, date, content)
    DB-->>CoachUI: Success
    CoachUI->>Coach: Alert "Заметка сохранена!"
    
    %% Client receives feedback
    Client->>Dashboard: Заходит на следующий день
    Client->>Dashboard: Меняет дату на вчера
    Dashboard->>DB: Check Premium & coach_id
    Dashboard->>DB: Fetch coach_notes (yesterday)
    DB-->>Dashboard: Note Content
    
    Dashboard->>Client: Shows "Сообщение от тренера" Widget
    Client->>Client: Reads Feedback
```

---

*Документ создан: 17 декабря 2025 (на основе текущей реализации в коде v3.2)*


