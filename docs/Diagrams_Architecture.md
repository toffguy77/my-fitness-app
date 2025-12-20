# Архитектурные диаграммы My Fitness App

**Версия документа:** 1.0  
**Дата создания:** Январь 2025  
**Статус:** Актуальная реализация v4.0+

---

## Общая архитектура системы

```mermaid
graph TB
    subgraph Client["Client (Browser)"]
        NextJS[Next.js App<br/>React 19]
        Pages[Pages<br/>App Router]
        Components[Components<br/>React]
        Utils[Utils<br/>Helpers]
    end
    
    subgraph Supabase["Supabase (BaaS)"]
        Auth[Auth<br/>JWT]
        DB[(PostgreSQL<br/>Database)]
        Realtime[Realtime<br/>WebSocket]
        EdgeFunctions[Edge Functions<br/>Deno]
        Storage[Storage<br/>Files]
    end
    
    subgraph External["External Services"]
        Resend[Resend API<br/>Email]
        OpenFoodFacts[Open Food Facts<br/>Products]
        OpenRouter[OpenRouter API<br/>OCR]
    end
    
    NextJS --> Pages
    Pages --> Components
    Components --> Utils
    Utils --> Auth
    Utils --> DB
    Utils --> Realtime
    Pages --> EdgeFunctions
    EdgeFunctions --> Resend
    Utils --> OpenFoodFacts
    Utils --> OpenRouter
    EdgeFunctions --> DB
    Realtime --> DB
```

---

## Компонентная архитектура

```mermaid
graph TB
    subgraph App["App Layer"]
        Layout[App Layout]
        Middleware[Middleware<br/>Route Protection]
    end
    
    subgraph Pages["Pages"]
        Dashboard[Dashboard Page]
        Nutrition[Nutrition Page]
        Reports[Reports Page]
        Coach[Coach Page]
        Settings[Settings Page]
    end
    
    subgraph Components["Components"]
        UI[UI Components<br/>Toast, Spinner, etc.]
        Charts[Charts<br/>WeightChart, MacrosChart]
        Chat[Chat<br/>ChatWindow, MessageList]
        Products[Products<br/>ProductSearch, ProductCard]
        OCR[OCR<br/>OCRModal, PhotoUpload]
        ReportsComp[Reports<br/>ExportButton, ReportFilters]
    end
    
    subgraph Utils["Utils"]
        SupabaseUtils[Supabase Utils]
        Validation[Validation]
        Export[Export]
        ProductsUtils[Products Utils]
        OCRUtils[OCR Utils]
    end
    
    Layout --> Dashboard
    Layout --> Nutrition
    Layout --> Reports
    Layout --> Coach
    Layout --> Settings
    
    Dashboard --> UI
    Dashboard --> Charts
    Nutrition --> UI
    Nutrition --> Products
    Nutrition --> OCR
    Reports --> Charts
    Reports --> ReportsComp
    Coach --> Chat
    Settings --> UI
    
    Pages --> SupabaseUtils
    Components --> Utils
    Utils --> SupabaseUtils
```

---

## Диаграмма развертывания

```mermaid
graph TB
    subgraph Production["Production Environment"]
        subgraph Docker["Docker Container"]
            NextJSApp[Next.js App<br/>Port 3069]
        end
        
        subgraph SupabaseCloud["Supabase Cloud"]
            SupabaseDB[(PostgreSQL)]
            SupabaseAuth[Auth Service]
            SupabaseRealtime[Realtime Service]
            SupabaseEdge[Edge Functions]
        end
        
        subgraph ExternalServices["External Services"]
            ResendService[Resend API]
            OpenFoodFactsService[Open Food Facts]
            OpenRouterService[OpenRouter API]
        end
    end
    
    User[User Browser] --> NextJSApp
    NextJSApp --> SupabaseAuth
    NextJSApp --> SupabaseDB
    NextJSApp --> SupabaseRealtime
    NextJSApp --> SupabaseEdge
    SupabaseEdge --> ResendService
    NextJSApp --> OpenFoodFactsService
    NextJSApp --> OpenRouterService
```

---

## Схема взаимодействия Frontend-Backend-Database

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant Frontend as Next.js Frontend
    participant Middleware as Middleware
    participant Supabase as Supabase
    participant DB as PostgreSQL
    participant EdgeFunc as Edge Functions
    participant External as External APIs
    
    User->>Frontend: Запрос страницы
    Frontend->>Middleware: Проверка авторизации
    Middleware->>Supabase: Проверка JWT токена
    Supabase-->>Middleware: Токен валиден
    Middleware->>DB: Загрузка профиля
    DB-->>Middleware: Профиль пользователя
    Middleware->>Frontend: Разрешить доступ
    Frontend->>Supabase: Загрузка данных
    Supabase->>DB: SQL запрос
    DB-->>Supabase: Данные
    Supabase-->>Frontend: Данные
    Frontend->>User: Отображение страницы
    
    User->>Frontend: Действие (сохранение)
    Frontend->>Supabase: Upsert данные
    Supabase->>DB: INSERT/UPDATE
    DB-->>Supabase: Успех
    Supabase-->>Frontend: Подтверждение
    Frontend->>User: Toast уведомление
    
    Frontend->>EdgeFunc: Отправка уведомления
    EdgeFunc->>External: Resend API
    External-->>EdgeFunc: Email отправлен
    EdgeFunc-->>Frontend: Успех
```

---

## Связанные документы

- [Technical_Architecture.md](./Technical_Architecture.md) - Техническая архитектура
- [Diagrams_Index.md](./Diagrams_Index.md) - Индекс всех диаграмм

---

**Последнее обновление:** Январь 2025  
**Версия документа:** 1.0

