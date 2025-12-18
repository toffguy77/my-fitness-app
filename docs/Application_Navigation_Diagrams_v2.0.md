# Диаграммы навигации My Fitness App v1.1

## Общая навигация
Добавлен раздел настроек и уточнены переходы.

```mermaid
flowchart TD
    Start([Пользователь]) --> Landing[/ Landing Page]
    
    %% Auth Flow
    Landing -->|Guest| Login[/login]
    Landing -->|Guest| Register[/register]
    
    %% Role Based Redirects
    Login -->|Client| Dashboard[/app/dashboard]
    Login -->|Coach| CoachList[/app/coach]
    Login -->|Admin| AdminPanel[/admin]
    
    %% Client Zone
    subgraph Client App
        Dashboard -->|Ввод еды| Nutrition[/app/nutrition]
        Dashboard -->|Аналитика| Reports[/app/reports]
        Dashboard -->|Профиль| Settings[/app/settings]
        
        Nutrition -->|Save/Cancel| Dashboard
        Reports -->|Back| Dashboard
        Settings -->|Logout| Login
    end
    
    %% Coach Zone
    subgraph Coach App
        CoachList -->|Select Client| ClientView[/app/coach/:id]
        CoachList -->|Logout| Login
        ClientView -->|Back| CoachList
        ClientView -->|Edit Targets| ClientSettings[Client Targets]
    end
    
    %% Admin Zone
    subgraph Admin Area
        AdminPanel -->|Manage Users| UserEdit[Edit User / Assign Coach]
        AdminPanel -->|Logout| Login
    end

    style Landing fill:#f9f9f9,stroke:#333
    style Dashboard fill:#d4edda,stroke:#28a745
    style Nutrition fill:#d4edda,stroke:#28a745
    style Settings fill:#e2e3e5,stroke:#333
    style CoachList fill:#cfe2ff,stroke:#0d6efd
    style AdminPanel fill:#f8d7da,stroke:#dc3545
```

## Детальный флоу: Ввод питания (Client)

```mermaid
sequenceDiagram
    participant User
    participant UI as Nutrition Page
    participant DB as Supabase

    User->>UI: Открывает /app/nutrition
    UI->>DB: Fetch Logs (Today) & Targets (both types)
    DB-->>UI: Data (logs, training targets, rest targets)
    
    User->>UI: Меняет тип дня (Rest/Training)
    UI->>UI: Переключение таргетов (Reactive)
    UI->>UI: Пересчет прогресс-баров (Reactive)
    
    User->>UI: Вводит еду и вес
    User->>UI: Нажимает "Сохранить"
    
    UI->>DB: Upsert Daily Log (with current dayType)
    DB-->>UI: Success
    UI->>User: Redirect to Dashboard
```

## Детальный флоу: Настройки профиля (Client)

```mermaid
sequenceDiagram
    participant User
    participant UI as Settings Page
    participant DB as Supabase
    participant Auth as Supabase Auth

    User->>UI: Открывает /app/settings
    UI->>DB: Fetch Profile Data
    DB-->>UI: Profile (name, phone, subscription, coach)
    
    User->>UI: Редактирует имя/телефон
    User->>UI: Нажимает "Сохранить"
    UI->>DB: Update Profile
    DB-->>UI: Success
    
    User->>UI: Меняет пароль
    User->>UI: Вводит старый и новый пароль
    User->>UI: Нажимает "Изменить пароль"
    UI->>Auth: Update Password
    Auth-->>UI: Success
    
    User->>UI: Нажимает "Выйти"
    UI->>Auth: Sign Out
    Auth-->>UI: Success
    UI->>User: Redirect to /login
```

## Детальный флоу: Кабинет тренера (Coach)

```mermaid
sequenceDiagram
    participant Coach
    participant UI as Coach Dashboard
    participant DB as Supabase

    Coach->>UI: Открывает /app/coach
    UI->>DB: Fetch Clients List
    DB-->>UI: Clients with statuses
    
    UI->>UI: Приоритетная сортировка (Red > Grey > Green)
    UI->>Coach: Отображает отсортированный список
    
    Coach->>UI: Выбирает клиента (Red status)
    UI->>DB: Fetch Client Dashboard Data
    DB-->>UI: Client logs, targets, metrics
    
    Coach->>UI: Редактирует цели питания
    UI->>DB: Update Nutrition Targets
    DB-->>UI: Success
    UI->>Coach: Обновленные цели отображаются
```

## Система приоритетов для тренера (Traffic Light Logic)

```mermaid
flowchart TD
    Start([Клиент в списке]) --> CheckData{Есть данные<br/>за сегодня?}
    
    CheckData -->|Нет| CheckLast{Последний<br/>чекин > 24ч?}
    CheckLast -->|Да| Red[🔴 RED<br/>Требует внимания]
    CheckLast -->|Нет| Grey[⚪ GREY<br/>Нет данных]
    
    CheckData -->|Да| CheckCalories{Перебор<br/>ккал > 15%?}
    CheckCalories -->|Да| Red
    CheckCalories -->|Нет| CheckWeight{Отклонение<br/>веса > 2%?}
    CheckWeight -->|Да| Red
    CheckWeight -->|Нет| Green[🟢 GREEN<br/>Все ок]
    
    Red --> Priority1[Приоритет 1<br/>Сверху списка]
    Grey --> Priority2[Приоритет 2<br/>Середина списка]
    Green --> Priority3[Приоритет 3<br/>Внизу списка]
    
    style Red fill:#fee,stroke:#c33
    style Green fill:#efe,stroke:#3c3
    style Grey fill:#eee,stroke:#999
```

## Динамическое переключение типа дня

```mermaid
flowchart LR
    Start([Пользователь на /nutrition]) --> Load[Загрузить оба<br/>набора таргетов]
    Load --> Training[Training Targets<br/>2100 / 100 / 40 / 500]
    Load --> Rest[Rest Targets<br/>1800 / 100 / 30 / 400]
    
    Training --> Toggle{Переключатель<br/>Тип дня}
    Rest --> Toggle
    
    Toggle -->|Выбрано Training| UseTraining[Использовать<br/>Training Targets]
    Toggle -->|Выбрано Rest| UseRest[Использовать<br/>Rest Targets]
    
    UseTraining --> Recalc[Пересчитать<br/>прогресс-бары]
    UseRest --> Recalc
    
    Recalc --> Display[Отобразить<br/>обновленные бары]
    
    style Training fill:#d4edda
    style Rest fill:#fff3cd
    style Recalc fill:#cfe2ff
```