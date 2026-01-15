# Диаграммы состояний My Fitness App

**Версия документа:** 1.0  
**Дата создания:** Январь 2025  
**Статус:** Актуальная реализация v4.0+

---

## Состояния подписки

```mermaid
stateDiagram-v2
    [*] --> Free: Регистрация
    Free --> Active: Super Admin активирует
    Active --> Expiring: За 3 дня до окончания
    Expiring --> Active: Продление
    Expiring --> Expired: Истечение срока
    Active --> Cancelled: Отмена
    Cancelled --> Active: Возобновление
    Expired --> Free: Автоматическая деактивация
    Expired --> Active: Продление
    
    note right of Free
        subscription_status = 'free'
        subscription_tier = 'basic'
        coach_id = NULL
    end note
    
    note right of Active
        subscription_status = 'active'
        subscription_tier = 'premium'
        coach_id != NULL
        subscription_end_date > NOW()
    end note
    
    note right of Expiring
        subscription_status = 'active'
        subscription_tier = 'premium'
        subscription_end_date - NOW() <= 3 days
    end note
    
    note right of Expired
        subscription_status = 'cancelled'
        subscription_tier = 'premium'
        subscription_end_date < NOW()
    end note
```

---

## Состояния дня (is_completed)

```mermaid
stateDiagram-v2
    [*] --> NotStarted: Создание записи
    NotStarted --> InProgress: Ввод данных
    InProgress --> InProgress: Редактирование
    InProgress --> Validating: Нажатие "Завершить день"
    Validating --> Completed: Валидация успешна
    Validating --> InProgress: Валидация не прошла
    Completed --> [*]: День завершен
    
    note right of NotStarted
        is_completed = false
        completed_at = NULL
        actual_calories = 0
    end note
    
    note right of InProgress
        is_completed = false
        completed_at = NULL
        actual_calories > 0
    end note
    
    note right of Completed
        is_completed = true
        completed_at = NOW()
        Редактирование заблокировано
    end note
```

---

## Состояния онбординга

```mermaid
stateDiagram-v2
    [*] --> CheckTargets: Проверка целей
    CheckTargets --> HasTargets: Цели есть
    CheckTargets --> NoTargets: Целей нет
    NoTargets --> Step1: Шаг 1: Биометрия
    Step1 --> Step2: Шаг 2: Активность
    Step2 --> Step3: Шаг 3: Цель
    Step3 --> Calculating: Расчет BMR/TDEE
    Calculating --> Creating: Создание целей
    Creating --> HasTargets: Сохранение
    HasTargets --> Dashboard: Редирект на дашборд
    
    note right of Step1
        Ввод пола, даты рождения, роста
    end note
    
    note right of Step2
        Выбор уровня активности
    end note
    
    note right of Step3
        Выбор цели (похудение/поддержание/набор)
    end note
```

---

## Состояния сообщений в чате

```mermaid
stateDiagram-v2
    [*] --> Composing: Ввод сообщения
    Composing --> Sending: Нажатие "Отправить"
    Sending --> Sent: Сохранение в БД
    Sending --> Error: Ошибка отправки
    Error --> Composing: Повторная попытка
    Sent --> Delivered: Получение получателем
    Delivered --> Read: Прочтение получателем
    
    note right of Composing
        content.length > 0
        content.length <= 1000
    end note
    
    note right of Sent
        created_at = NOW()
        is_deleted = false
    end note
    
    note right of Read
        read_at = NOW()
    end note
```

---

## Состояния OCR обработки

```mermaid
stateDiagram-v2
    [*] --> Uploading: Загрузка фото
    Uploading --> Processing: Обработка
    Processing --> Tesseract: Tesseract.js
    Processing --> OpenRouter: OpenRouter API
    Tesseract --> Extracting: Извлечение данных
    OpenRouter --> Extracting: Извлечение данных
    Extracting --> Showing: Отображение результатов
    Showing --> Confirming: Подтверждение пользователем
    Confirming --> Editing: Редактирование
    Editing --> Confirming: Повторное подтверждение
    Confirming --> Saving: Сохранение
    Saving --> Saved: Сохранено в ocr_scans
    Saved --> Filling: Заполнение формы питания
    Filling --> [*]
    
    note right of Processing
        Выбор метода:
        - Tesseract.js (клиент)
        - OpenRouter (облако)
    end note
    
    note right of Saved
        success = true
        extracted_data сохранен
    end note
```

---

## Состояния достижений

```mermaid
stateDiagram-v2
    [*] --> NotStarted: Достижение не начато
    NotStarted --> InProgress: Начало прогресса
    InProgress --> InProgress: Увеличение прогресса
    InProgress --> Completed: Прогресс = 100%
    Completed --> [*]: Достижение получено
    
    note right of NotStarted
        progress = 0
        unlocked_at = NULL
    end note
    
    note right of InProgress
        0 < progress < 100
        unlocked_at = NULL
    end note
    
    note right of Completed
        progress = 100
        unlocked_at = NOW()
        Показывается уведомление
    end note
```

---

## Связанные документы

- [Functional_Specification.md](./Functional_Specification.md) - Функциональная спецификация
- [Database_Schema.md](./Database_Schema.md) - Схема базы данных
- [Diagrams_Index.md](./Diagrams_Index.md) - Индекс всех диаграмм

---

**Последнее обновление:** Январь 2025  
**Версия документа:** 1.0
