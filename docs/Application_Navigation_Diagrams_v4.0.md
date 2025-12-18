# Диаграммы навигации My Fitness App v4.0

Документация v4.0 отражает **планируемые изменения** навигации с добавлением функций **UX улучшений и визуализации данных**: Toast-уведомления, графики, прогресс-бары, улучшенные отчеты и экспорт данных.

---

## Общая навигация приложения (с UX улучшениями)

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
    subgraph ClientApp["/app/*"]
        Dashboard -->|Change Date| Dashboard
        Dashboard -->|Input| Nutrition[/app/nutrition]
        Dashboard -->|Add Meal| AddMealModal[AddMealModal]
        Dashboard -->|Check-in| CheckIn{Validate & Save}
        Dashboard -->|Read Note| CoachNote[Coach Note Widget]
        Dashboard -->|Settings| Settings[/app/settings]
        Dashboard -->|Reports| Reports[/app/reports]
        
        Nutrition -->|Save| ToastSuccess[Toast: Success]
        Nutrition -->|Error| ToastError[Toast: Error]
        AddMealModal -->|Save| ToastSuccess
        CheckIn -->|Free| SuccessModal[Success: Streak]
        CheckIn -->|Premium| NotifyCoach[Notify Coach]
        
        Reports -->|Tabs| ReportsTabs[Графики / Таблица / Статистика]
        ReportsTabs -->|Graphs| WeightChart[WeightChart]
        ReportsTabs -->|Graphs| MacrosChart[MacrosChart]
        ReportsTabs -->|Export| ExportMenu[Export: CSV/JSON/PDF]
        ReportsTabs -->|Filters| ReportFilters[Date Range / Type / Sort]
        
        Reports -->|Back| Dashboard
        Settings -->|Recalculate| RecalcTargets[Update Targets]
        Settings -->|Notifications| NotificationSettings[Notification Settings]
        Settings -->|Export| ExportData[Export All Data]
        Settings -->|Back| Dashboard
        Settings -->|Logout| Login
        
        %% Toast System (Global)
        ToastProvider[ToastProvider] -.->|Shows| ToastSuccess
        ToastProvider -.->|Shows| ToastError
        ToastProvider -.->|Shows| ToastWarning[Toast: Warning]
        ToastProvider -.->|Shows| ToastInfo[Toast: Info]
        
        %% Loading States
        Dashboard -.->|Loading| SkeletonLoader[SkeletonLoader]
        Reports -.->|Loading| SkeletonLoader
        Nutrition -.->|Loading| LoadingSpinner[LoadingSpinner]
    end
    
    %% Coach Zone
    subgraph CoachApp["/app/coach"]
        CoachList -->|Traffic Light Sort| ClientView[/app/coach/clientId]
        CoachList -->|Logout| Login
        ClientView -->|Write Note| SaveNote[Save Coach Note]
        ClientView -->|Update Targets| ValidateTargets[Validate & Save]
        ClientView -->|Back| CoachList
        SaveNote -.->|Success| ToastSuccess
        SaveNote -.->|Error| ToastError
        ValidateTargets -->|API| ValidateAPI[/api/nutrition-targets/update]
        ValidateAPI -->|Zod + Custom| ValidationResult{Valid?}
        ValidationResult -->|Error| ToastError
        ValidationResult -->|Success| DB[(Database)]
    end
    
    %% Admin Zone
    subgraph AdminArea["/admin"]
        AdminPanel -->|Manage Users| AdminPanel
        AdminPanel -->|Pagination| Pagination[Pagination Component]
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
    style ToastProvider fill:#28a745,stroke:#333,color:#fff,stroke-width:2px
    style ToastSuccess fill:#28a745,stroke:#333,color:#fff
    style ToastError fill:#dc3545,stroke:#333,color:#fff
    style ToastWarning fill:#ffc107,stroke:#333
    style ToastInfo fill:#0d6efd,stroke:#333,color:#fff
    style LoadingSpinner fill:#6c757d,stroke:#333,color:#fff
    style SkeletonLoader fill:#e9ecef,stroke:#333
    style WeightChart fill:#17a2b8,stroke:#333,color:#fff
    style MacrosChart fill:#17a2b8,stroke:#333,color:#fff
    style ExportMenu fill:#6c757d,stroke:#333,color:#fff
    style ReportFilters fill:#e2e3e5,stroke:#333
    style Pagination fill:#e2e3e5,stroke:#333
```

**Легенда цветов:**
- 🔵 Голубой — публичные страницы
- 🟠 Оранжевый — Onboarding
- 🟢 Зеленый — страницы клиентов
- 🟡 Желтый — Premium функции / Модальные окна / Check-in
- 🔵 Синий — функции тренера
- 🔴 Красный — админ панель
- 🟢 Зеленый (Toast) — успешные операции
- 🔴 Красный (Toast) — ошибки
- 🟡 Желтый (Toast) — предупреждения
- 🔵 Синий (Toast) — информация
- ⚪ Серый — утилиты (Loading, Skeleton, Pagination)
- 🔵 Голубой (Charts) — графики и визуализация

---

## Детальный флоу: Toast-уведомления

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant UI as UI Component
    participant ToastProvider as ToastProvider
    participant Toast as Toast Notification
    
    User->>UI: Выполняет действие (сохранение)
    UI->>UI: Оптимистичное обновление UI
    UI->>ToastProvider: toast.success("Данные сохранены")
    ToastProvider->>Toast: Создать toast
    Toast->>User: Показать уведомление (top-right)
    
    alt Успешная операция
        UI->>UI: Подтверждение от сервера
        Toast->>User: Автоматически скрыть через 3 сек
    else Ошибка
        UI->>UI: Откат изменений
        UI->>ToastProvider: toast.error("Ошибка сохранения")
        ToastProvider->>Toast: Создать error toast
        Toast->>User: Показать красное уведомление
        Toast->>User: Автоматически скрыть через 5 сек
    end
    
    User->>Toast: Может закрыть вручную (X)
    Toast->>ToastProvider: Удалить из очереди
```

---

## Детальный флоу: Просмотр графиков в отчетах

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant ReportsPage as /app/reports
    participant ChartsTab as Вкладка "Графики"
    participant WeightChart as WeightChart
    participant MacrosChart as MacrosChart
    participant DB as Supabase DB
    
    User->>ReportsPage: Открывает страницу отчетов
    ReportsPage->>DB: Загрузить daily_logs
    DB-->>ReportsPage: Данные загружены
    ReportsPage->>User: Показать вкладки (Графики/Таблица/Статистика)
    
    User->>ChartsTab: Переходит на вкладку "Графики"
    ChartsTab->>User: Показать выбор графика (Вес/КБЖУ)
    ChartsTab->>User: Показать выбор периода (7д/30д/3мес/все)
    
    alt Выбор графика веса
        User->>WeightChart: Выбирает "Вес" + период
        WeightChart->>DB: Запросить данные за период
        DB-->>WeightChart: Данные веса
        WeightChart->>WeightChart: Рассчитать трендовую линию
        WeightChart->>User: Отобразить график с трендом
        
        User->>WeightChart: Наводит курсор на точку
        WeightChart->>User: Показать tooltip (дата, вес)
    else Выбор графика КБЖУ
        User->>MacrosChart: Выбирает "КБЖУ" + период
        MacrosChart->>DB: Запросить данные за период
        DB-->>MacrosChart: Данные КБЖУ + цели
        MacrosChart->>MacrosChart: Построить графики
        MacrosChart->>User: Отобразить графики калорий и макронутриентов
        
        User->>MacrosChart: Наводит курсор на точку
        MacrosChart->>User: Показать tooltip (дата, КБЖУ, цели)
    end
```

---

## Детальный флоу: Экспорт данных

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant ReportsPage as /app/reports
    participant ExportButton as ExportButton
    participant ExportUtils as export.ts
    participant Browser as Браузер
    
    User->>ReportsPage: Открывает страницу отчетов
    ReportsPage->>User: Показать кнопку "Экспорт"
    
    User->>ExportButton: Нажимает "Экспорт"
    ExportButton->>User: Показать меню (CSV/JSON/PDF)
    ExportButton->>User: Показать выбор периода
    
    User->>ExportButton: Выбирает формат (CSV) + период
    User->>ExportButton: Нажимает "Скачать"
    
    alt Экспорт CSV
        ExportButton->>ExportUtils: exportToCSV(data, period)
        ExportUtils->>ExportUtils: Форматировать данные в CSV
        ExportUtils->>Browser: Создать blob и скачать
        Browser->>User: Файл скачивается
    else Экспорт JSON
        ExportButton->>ExportUtils: exportToJSON(data, period)
        ExportUtils->>ExportUtils: Форматировать данные в JSON
        ExportUtils->>Browser: Создать blob и скачать
        Browser->>User: Файл скачивается
    else Экспорт PDF
        ExportButton->>ExportUtils: exportToPDF(data, targets)
        ExportUtils->>ExportUtils: Генерировать PDF с графиками
        ExportUtils->>Browser: Создать blob и скачать
        Browser->>User: Файл скачивается
    end
    
    ExportButton->>User: Показать toast.success("Данные экспортированы")
```

---

## Детальный флоу: Оптимистичные обновления

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant NutritionPage as /app/nutrition
    participant UI as UI State
    participant Toast as Toast
    participant API as Supabase API
    participant DB as Database
    
    User->>NutritionPage: Вводит данные о приеме пищи
    User->>NutritionPage: Нажимает "Сохранить"
    
    Note over NutritionPage,UI: Оптимистичное обновление
    NutritionPage->>UI: Обновить meals сразу (до ответа сервера)
    NutritionPage->>UI: Пересчитать totals
    NutritionPage->>UI: Обновить отображение
    NutritionPage->>Toast: toast.loading("Сохранение...")
    
    NutritionPage->>API: Отправить запрос на сервер
    API->>DB: Сохранить данные
    
    alt Успех
        DB-->>API: Данные сохранены
        API-->>NutritionPage: Success response
        NutritionPage->>Toast: toast.success("Данные сохранены")
        NutritionPage->>UI: Подтвердить изменения (уже отображены)
    else Ошибка
        DB-->>API: Ошибка сохранения
        API-->>NutritionPage: Error response
        NutritionPage->>UI: Откатить изменения (вернуть предыдущее состояние)
        NutritionPage->>Toast: toast.error("Ошибка сохранения")
        NutritionPage->>User: Показать ошибку
    end
```

---

## Детальный флоу: Прогресс-бары на дашборде

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Dashboard as /app/dashboard
    participant ProgressBar as ProgressBar
    participant Targets as Nutrition Targets
    participant Logs as Daily Logs
    
    User->>Dashboard: Открывает дашборд
    Dashboard->>Targets: Загрузить цели питания
    Dashboard->>Logs: Загрузить лог за сегодня
    
    Dashboard->>Dashboard: Рассчитать прогресс (current / target)
    
    loop Для каждого макронутриента
        Dashboard->>ProgressBar: Отобразить прогресс
        ProgressBar->>ProgressBar: Рассчитать процент
        ProgressBar->>ProgressBar: Определить цвет (зеленый/желтый/красный)
        ProgressBar->>User: Отобразить прогресс-бар с анимацией
        
        alt Прогресс >= 80%
            ProgressBar->>User: Зеленый цвет
        else Прогресс >= 50%
            ProgressBar->>User: Желтый цвет
        else Прогресс < 50%
            ProgressBar->>User: Красный цвет
        end
    end
    
    User->>ProgressBar: Наводит курсор
    ProgressBar->>User: Показать tooltip (текущее значение / цель / процент)
```

---

## Детальный флоу: Пагинация в отчетах

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant ReportsPage as /app/reports
    participant Pagination as Pagination Component
    participant DB as Supabase DB
    
    User->>ReportsPage: Открывает страницу отчетов
    ReportsPage->>DB: Запросить первую страницу (limit: 20)
    DB-->>ReportsPage: Данные (20 записей) + total count
    ReportsPage->>Pagination: Передать total count и current page
    ReportsPage->>User: Отобразить данные + пагинацию
    
    User->>Pagination: Нажимает "Следующая страница"
    Pagination->>ReportsPage: onPageChange(2)
    ReportsPage->>DB: Запросить страницу 2 (offset: 20, limit: 20)
    DB-->>ReportsPage: Данные (20 записей)
    ReportsPage->>User: Отобразить новые данные
    
    User->>Pagination: Нажимает номер страницы (5)
    Pagination->>ReportsPage: onPageChange(5)
    ReportsPage->>DB: Запросить страницу 5 (offset: 80, limit: 20)
    DB-->>ReportsPage: Данные (20 записей)
    ReportsPage->>User: Отобразить новые данные
    
    User->>Pagination: Нажимает "Последняя страница"
    Pagination->>ReportsPage: onPageChange(lastPage)
    ReportsPage->>DB: Запросить последнюю страницу
    DB-->>ReportsPage: Данные последней страницы
    ReportsPage->>User: Отобразить данные
```

---

## Детальный флоу: Фильтрация в отчетах

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant ReportsPage as /app/reports
    participant Filters as ReportFilters
    participant DB as Supabase DB
    
    User->>ReportsPage: Открывает страницу отчетов
    ReportsPage->>User: Показать фильтры (дата, тип дня, сортировка)
    
    User->>Filters: Выбирает диапазон дат (01.01 - 31.01)
    Filters->>ReportsPage: Обновить фильтр дат
    ReportsPage->>DB: Запросить данные с фильтром дат
    DB-->>ReportsPage: Отфильтрованные данные
    ReportsPage->>User: Отобразить отфильтрованные данные
    
    User->>Filters: Выбирает тип дня "training"
    Filters->>ReportsPage: Обновить фильтр типа дня
    ReportsPage->>DB: Запросить данные с фильтрами (дата + тип)
    DB-->>ReportsPage: Отфильтрованные данные
    ReportsPage->>User: Отобразить отфильтрованные данные
    
    User->>Filters: Выбирает сортировку "по калориям (убывание)"
    Filters->>ReportsPage: Обновить сортировку
    ReportsPage->>DB: Запросить данные с сортировкой
    DB-->>ReportsPage: Отсортированные данные
    ReportsPage->>User: Отобразить отсортированные данные
    
    User->>Filters: Нажимает "Сбросить фильтры"
    Filters->>ReportsPage: Сбросить все фильтры
    ReportsPage->>DB: Запросить все данные
    DB-->>ReportsPage: Все данные
    ReportsPage->>User: Отобразить все данные
```

---

*Документ создан: Январь 2025 (планируемые изменения для Phase 4)*

