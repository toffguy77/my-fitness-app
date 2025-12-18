# Диаграммы навигации My Fitness App v3.0

Документация v3.0 отражает **текущую реализацию** навигации в коде (по состоянию на 17 декабря 2025).

---

## Общая навигация приложения

```mermaid
flowchart TD
    Start([Пользователь]) --> Landing[/ Landing Page]
    
    %% Auth Flow
    Landing -->|Guest| Login[/login]
    Landing -->|Guest| Register[/register]
    Landing -->|Auth: Client| Dashboard[/app/dashboard]
    Landing -->|Auth: Coach| CoachList[/app/coach]
    Landing -->|Auth: Admin| AdminPanel[/admin]
    
    %% Registration
    Register -->|Success| Dashboard
    
    %% Login Flow
    Login -->|Client| Dashboard
    Login -->|Coach| CoachList
    Login -->|Super Admin| AdminPanel
    Login -->|No Account| Register
    
    %% Client Zone
    subgraph Client App["/app/*"]
        Dashboard -->|Ввод питания| Nutrition[/app/nutrition]
        Dashboard -->|Редактировать прием| Nutrition
        Dashboard -->|Добавить прием| Nutrition
        Dashboard -->|Отчеты Premium| Reports[/app/reports]
        Dashboard -->|Настройки| Settings[/app/settings]
        
        Nutrition -->|Save/Cancel| Dashboard
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
    style Dashboard fill:#d4edda,stroke:#28a745
    style Nutrition fill:#d4edda,stroke:#28a745
    style Reports fill:#fff3cd,stroke:#ffc107
    style Settings fill:#e2e3e5,stroke:#333
    style CoachList fill:#cfe2ff,stroke:#0d6efd
    style ClientView fill:#cfe2ff,stroke:#0d6efd
    style AdminPanel fill:#f8d7da,stroke:#dc3545
```

**Легенда цветов:**
- 🔵 Голубой — публичные страницы
- 🟢 Зеленый — страницы клиентов
- 🟡 Желтый — Premium функции
- 🔵 Синий — страницы тренеров
- 🔴 Красный — админ-панель
- ⚪ Серый — настройки

---

## Навигация для клиентов (Client Flow)

```mermaid
flowchart LR
    Start([Клиент входит]) --> Login[/login]
    Login --> Dashboard[/app/dashboard]
    
    Dashboard -->|Ввести питание| Nutrition[/app/nutrition]
    Dashboard -->|Добавить прием| AddMeal[AddMealModal]
    Dashboard -->|Редактировать прием| Nutrition
    Dashboard -->|Отчеты Premium| Reports[/app/reports]
    Dashboard -->|Настройки| Settings[/app/settings]
    
    AddMeal -->|Save| Dashboard
    Nutrition -->|Save| Dashboard
    Nutrition -->|Cancel| Dashboard
    Reports -->|Back| Dashboard
    Settings -->|Back| Dashboard
    Settings -->|Logout| Login
    
    style Dashboard fill:#d4edda
    style Nutrition fill:#d4edda
    style Reports fill:#fff3cd
    style Settings fill:#e2e3e5
    style AddMeal fill:#fff9c4
```

**Описание:**
- Клиент начинает с дашборда после входа
- Может переходить на ввод питания и обратно
- Premium клиенты имеют доступ к отчетам
- Настройки доступны всем клиентам
- Модальное окно для добавления приемов пищи доступно с дашборда

---

## Навигация для тренеров (Coach Flow)

```mermaid
flowchart LR
    Start([Тренер входит]) --> Login[/login]
    Login --> Coach[/app/coach]
    
    Coach -->|Выбрать клиента| ClientView[/app/coach/clientId]
    ClientView -->|Back| Coach
    ClientView -->|Edit Targets| ClientView
    Coach -->|Logout| Login
    
    style Coach fill:#cfe2ff
    style ClientView fill:#cfe2ff
```

**Описание:**
- Тренер видит список клиентов с приоритетной сортировкой
- Может просматривать детальный дашборд каждого клиента
- Может редактировать цели по питанию для клиентов
- Все действия в режиме только для чтения, кроме редактирования целей

---

## Навигация для супер-администраторов (Admin Flow)

```mermaid
flowchart LR
    Start([Админ входит]) --> Login[/login]
    Login --> Admin[/admin]
    
    Admin -->|Edit User| EditModal[Edit User Modal]
    EditModal -->|Save| Admin
    EditModal -->|Cancel| Admin
    Admin -->|Logout| Login
    
    style Admin fill:#f8d7da
    style EditModal fill:#fff9c4
```

**Описание:**
- Админ работает в одной панели управления
- Все операции выполняются в рамках админ-панели
- Модальное окно для редактирования пользователей

---

## Система ролей и доступа

```mermaid
flowchart TD
    User([Пользователь]) --> Auth{Авторизован?}
    
    Auth -->|Нет| Public[Публичные страницы]
    Public --> Landing[/ Landing]
    Public --> Register[/register]
    Public --> Login[/login]
    
    Auth -->|Да| Role{Роль?}
    
    Role -->|Client| ClientPages[Страницы клиента]
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
    style ClientPages fill:#d4edda
    style CoachPages fill:#cfe2ff
    style AdminPages fill:#f8d7da
```

**Описание:**
- Показывает, как система определяет доступ на основе авторизации и роли
- Разные роли получают доступ к разным наборам страниц
- Premium функции доступны только клиентам с активной подпиской

---

## Защита маршрутов (Middleware Logic)

```mermaid
flowchart TD
    Request([Запрос]) --> CheckAuth{Авторизован?}
    
    CheckAuth -->|Нет| PublicRoute{Публичный<br/>маршрут?}
    PublicRoute -->|Да| Allow[Разрешить доступ]
    PublicRoute -->|Нет| RedirectLogin[Редирект на /login]
    
    CheckAuth -->|Да| GetRole[Получить роль и<br/>статус из profiles]
    GetRole --> CheckRoute{Тип маршрута?}
    
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
```

**Описание:**
- Показывает логику проверки доступа в middleware
- Разные маршруты требуют разных проверок (авторизация, роль, Premium статус)
- Автоматические редиректы на основе роли для главной страницы

---

## Детальный флоу: Dashboard → Nutrition

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant Nutrition as /app/nutrition
    participant DB as Supabase
    
    User->>Dashboard: Открыть дашборд
    Dashboard->>DB: Загрузить данные за сегодня<br/>(daily_logs, nutrition_targets)
    DB-->>Dashboard: Данные (КБЖУ, вес, приемы пищи, цели)
    Dashboard-->>User: Отобразить сводку
    
    User->>Dashboard: Нажать "Ввести данные"<br/>или "Редактировать"
    Dashboard->>Nutrition: Переход на /app/nutrition<br/>(или /app/nutrition?edit=mealId)
    
    User->>Nutrition: Загружаются данные за сегодня<br/>и цели для обоих типов дней
    Nutrition->>DB: Fetch Logs (Today) & Targets<br/>(training + rest)
    DB-->>Nutrition: Data (logs, training targets, rest targets)
    
    User->>Nutrition: Меняет тип дня (Rest/Training)
    Nutrition->>Nutrition: Переключение таргетов (Reactive)
    Nutrition->>Nutrition: Пересчет прогресс-баров (useMemo)
    
    User->>Nutrition: Вводит еду и вес
    User->>Nutrition: Нажимает "Сохранить"
    
    Nutrition->>DB: Получить существующий лог<br/>(meals, target_type)
    DB-->>Nutrition: Existing log
    
    Nutrition->>Nutrition: Объединить meals<br/>(merge по id)
    Nutrition->>Nutrition: Пересчитать totals<br/>из всех meals
    
    Nutrition->>DB: Upsert Daily Log<br/>(with current dayType)
    DB-->>Nutrition: Success
    
    Nutrition->>Dashboard: Redirect + Refresh
    Dashboard->>DB: Обновить данные
    DB-->>Dashboard: Новые данные
    Dashboard-->>User: Обновленная сводка
```

---

## Детальный флоу: Dashboard → Add Meal Modal

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant Modal as AddMealModal
    participant DB as Supabase
    
    User->>Dashboard: Нажать "Добавить прием пищи"
    Dashboard->>Modal: Открыть модальное окно
    
    User->>Modal: Ввести данные приема пищи<br/>(название, дата, КБЖУ)
    User->>Modal: Нажать "Сохранить"
    
    Modal->>DB: Получить существующий лог<br/>за выбранную дату
    DB-->>Modal: Existing log (meals)
    
    Modal->>Modal: Добавить новый meal<br/>к существующим
    
    Modal->>DB: Upsert Daily Log<br/>(merge meals)
    DB-->>Modal: Success
    
    Modal->>Dashboard: Закрыть модальное окно
    Dashboard->>DB: Обновить данные
    DB-->>Dashboard: Новые данные
    Dashboard-->>User: Обновленная сводка
```

---

## Детальный флоу: Настройки профиля (Settings)

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Settings as /app/settings
    participant DB as Supabase
    participant Auth as Supabase Auth
    
    User->>Settings: Открыть /app/settings
    Settings->>DB: Fetch Profile Data
    DB-->>Settings: Profile (name, phone, subscription, coach)
    
    alt Редактирование профиля
        User->>Settings: Редактирует имя/телефон
        User->>Settings: Нажимает "Сохранить изменения"
        Settings->>DB: Update Profile<br/>(full_name, phone)
        DB-->>Settings: Success
        Settings-->>User: Сообщение об успехе
    end
    
    alt Смена пароля
        User->>Settings: Вводит старый и новый пароль
        User->>Settings: Нажимает "Изменить пароль"
        Settings->>Auth: Update Password<br/>(updateUser)
        Auth-->>Settings: Success
        Settings-->>User: Сообщение об успехе
    end
    
    alt Выход из системы
        User->>Settings: Нажимает "Выйти"
        Settings->>Auth: Sign Out
        Auth-->>Settings: Success
        Settings->>Login: Redirect to /login
    end
```

---

## Детальный флоу: Кабинет тренера (Coach)

```mermaid
sequenceDiagram
    participant Coach as Тренер
    participant CoachDash as /app/coach
    participant ClientView as /app/coach/clientId
    participant DB as Supabase
    
    Coach->>CoachDash: Открыть /app/coach
    CoachDash->>DB: Fetch Clients List<br/>(where coach_id = current_user)
    DB-->>CoachDash: Clients
    
    CoachDash->>DB: Для каждого клиента:<br/>Fetch Today Log & Last Checkin
    DB-->>CoachDash: Client data with statuses
    
    CoachDash->>CoachDash: Приоритетная сортировка<br/>(Red > Grey > Green)
    CoachDash-->>Coach: Отображает отсортированный список
    
    Coach->>CoachDash: Выбирает клиента (Red status)
    CoachDash->>ClientView: Переход на /app/coach/clientId
    
    ClientView->>DB: Проверка прав<br/>(coach_id = current_user)
    DB-->>ClientView: Access granted
    
    ClientView->>DB: Fetch Client Dashboard Data<br/>(logs, targets, metrics)
    DB-->>ClientView: Client data
    
    ClientView-->>Coach: Отображает дашборд клиента<br/>(read-only)
    
    alt Редактирование целей
        Coach->>ClientView: Редактирует цели питания
        ClientView->>DB: Update Nutrition Targets
        DB-->>ClientView: Success
        ClientView-->>Coach: Обновленные цели отображаются
    end
```

---

## Система приоритетов для тренера (Traffic Light Logic)

```mermaid
flowchart TD
    Start([Клиент в списке]) --> CheckData{Есть данные<br/>за сегодня?}
    
    CheckData -->|Нет| CheckLast{Последний<br/>чекин > 24ч?}
    CheckLast -->|Да| Red[🔴 RED<br/>Требует внимания]
    CheckLast -->|Нет| Grey[⚪ GREY<br/>Нет данных]
    
    CheckData -->|Да| CheckCalories{Отклонение<br/>ккал > 15%?}
    CheckCalories -->|Да| Red
    CheckCalories -->|Нет| Green[🟢 GREEN<br/>Все ок]
    
    Red --> Priority1[Приоритет 1<br/>Сверху списка]
    Grey --> Priority2[Приоритет 2<br/>Середина списка]
    Green --> Priority3[Приоритет 3<br/>Внизу списка]
    
    style Red fill:#fee,stroke:#c33
    style Green fill:#efe,stroke:#3c3
    style Grey fill:#eee,stroke:#999
```

**Описание:**
- Показывает логику определения статуса клиента
- Приоритетная сортировка: Red (1) > Grey (2) > Green (3)
- Red клиенты всегда отображаются сверху списка

---

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
    
    UseTraining --> CheckTargets{Таргеты<br/>найдены?}
    UseRest --> CheckTargets
    
    CheckTargets -->|Да| Recalc[Пересчитать<br/>прогресс-бары]
    CheckTargets -->|Нет| Warning[Показать предупреждение:<br/>"Цели не установлены"]
    
    Recalc --> Display[Отобразить<br/>обновленные бары]
    Warning --> Display
    
    style Training fill:#d4edda
    style Rest fill:#fff3cd
    style Recalc fill:#cfe2ff
    style Warning fill:#fff3cd
```

**Описание:**
- Показывает логику динамического переключения типа дня
- Оба набора таргетов загружаются при открытии страницы
- При смене типа дня прогресс-бары пересчитываются автоматически
- Если таргеты не найдены, показывается предупреждение

---

## Флоу добавления приема пищи с дашборда

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant Modal as AddMealModal
    participant DB as Supabase
    
    User->>Dashboard: Нажать "Добавить прием пищи"
    Dashboard->>Modal: Открыть модальное окно
    
    User->>Modal: Ввести данные:<br/>- Дата приема пищи<br/>- Название<br/>- Вес, КБЖУ
    User->>Modal: Нажать "Сохранить"
    
    Modal->>DB: Получить существующий лог<br/>за выбранную дату
    DB-->>Modal: Existing log (meals array)
    
    Modal->>Modal: Добавить новый meal<br/>к существующим meals
    
    Modal->>DB: Upsert Daily Log<br/>(merge meals array)
    DB-->>Modal: Success
    
    Modal->>Dashboard: Закрыть модальное окно
    Dashboard->>DB: Refresh data
    DB-->>Dashboard: Updated data
    Dashboard-->>User: Обновленная сводка
```

---

## Флоу редактирования приема пищи

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant Nutrition as /app/nutrition
    participant DB as Supabase
    
    User->>Dashboard: Клик по приему пищи<br/>или иконка редактирования
    Dashboard->>Nutrition: Переход на<br/>/app/nutrition?edit=mealId
    
    Nutrition->>DB: Загрузить данные за сегодня
    DB-->>Nutrition: Log with meals array
    
    Nutrition->>Nutrition: Найти meal по id<br/>и установить в форму
    
    User->>Nutrition: Редактирует данные приема
    User->>Nutrition: Нажимает "Сохранить"
    
    Nutrition->>DB: Получить существующий лог
    DB-->>Nutrition: Existing meals
    
    Nutrition->>Nutrition: Обновить meal в массиве<br/>(по id)
    Nutrition->>Nutrition: Пересчитать totals
    
    Nutrition->>DB: Upsert Daily Log
    DB-->>Nutrition: Success
    
    Nutrition->>Dashboard: Redirect + Refresh
    Dashboard-->>User: Обновленная сводка
```

---

*Документ создан: 17 декабря 2025 (на основе текущей реализации в коде)*

