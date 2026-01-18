# Requirements Document: Error Handling Improvements

## Introduction

Исправление критических ошибок в обработке запросов и RLS политиках, которые приводят к AbortError, 403/406 ошибкам и потере данных.

## Glossary

- **Request_Handler**: Обработчик HTTP запросов к Supabase
- **RLS_Policy**: Row Level Security политика в PostgreSQL
- **AbortController**: Механизм отмены HTTP запросов
- **Products_Table**: Таблица продуктов в базе данных
- **Client_User**: Пользователь с ролью client

## Requirements

### Requirement 1: Исправление AbortError при навигации

**User Story:** Как пользователь, я хочу, чтобы запросы корректно отменялись при навигации, чтобы не видеть ошибки в консоли.

#### Acceptance Criteria

1. WHEN пользователь переходит на другую страницу до завершения запроса, THE Request_Handler SHALL корректно отменить запрос без логирования ошибки
2. WHEN запрос отменяется через AbortController, THE Request_Handler SHALL проверять тип ошибки перед логированием
3. THE Request_Handler SHALL логировать только неожиданные ошибки, исключая AbortError
4. WHEN компонент размонтируется, THE Request_Handler SHALL очистить все активные запросы
5. THE Request_Handler SHALL использовать AbortController для всех fetch запросов

### Requirement 2: Исправление RLS политик для products

**User Story:** Как клиент, я хочу сохранять найденные продукты в базу данных, чтобы использовать их позже.

#### Acceptance Criteria

1. WHEN Client_User сохраняет продукт из внешнего API, THE Products_Table SHALL разрешить INSERT операцию
2. WHEN Client_User читает продукты, THE Products_Table SHALL разрешить SELECT операцию
3. THE RLS_Policy SHALL разрешать всем аутентифицированным пользователям создавать продукты
4. THE RLS_Policy SHALL разрешать всем аутентифицированным пользователям читать продукты
5. THE Products_Table SHALL возвращать HTTP 200 вместо 403/406 для разрешенных операций

### Requirement 3: Улучшение обработки сетевых ошибок

**User Story:** Как пользователь, я хочу видеть понятные сообщения об ошибках, чтобы понимать, что происходит.

#### Acceptance Criteria

1. WHEN происходит потеря сетевого соединения, THE Request_Handler SHALL показать пользователю уведомление о проблеме с сетью
2. WHEN запрос изображения не удается, THE Request_Handler SHALL использовать placeholder изображение
3. THE Request_Handler SHALL повторять неудачные запросы максимум 3 раза с экспоненциальной задержкой
4. WHEN все попытки исчерпаны, THE Request_Handler SHALL показать пользователю сообщение об ошибке
5. THE Request_Handler SHALL логировать сетевые ошибки с контекстом для отладки

### Requirement 4: Graceful degradation для Prometheus метрик

**User Story:** Как системный администратор, я хочу, чтобы приложение работало без Prometheus Pushgateway, чтобы избежать засорения логов ошибками.

#### Acceptance Criteria

1. WHEN Prometheus Pushgateway недоступен, THE Metrics_Collector SHALL логировать ошибку один раз при старте приложения
2. WHEN Prometheus Pushgateway недоступен, THE Metrics_Collector SHALL переключиться в режим silent failure для последующих попыток
3. THE Metrics_Collector SHALL повторять попытку подключения к Prometheus Pushgateway каждые 60 секунд
4. WHEN Prometheus Pushgateway становится доступным, THE Metrics_Collector SHALL возобновить отправку метрик
5. THE Metrics_Collector SHALL логировать успешное восстановление подключения к Prometheus Pushgateway

### Requirement 5: Автоматизированное тестирование обработки ошибок

**User Story:** Как QA инженер, я хочу иметь автоматические тесты для обработки ошибок, чтобы предотвратить регрессии.

#### Acceptance Criteria

1. THE Request_Handler SHALL иметь автоматические тесты для проверки корректной обработки AbortError
2. THE RLS_Policy SHALL иметь автоматические тесты для проверки разрешений на INSERT и SELECT
3. THE Request_Handler SHALL иметь автоматические тесты для проверки retry механизма
4. THE Request_Handler SHALL иметь автоматические тесты для проверки обработки сетевых ошибок
5. THE Products_Table SHALL иметь автоматические тесты для проверки сохранения продуктов клиентами
6. THE Metrics_Collector SHALL иметь автоматические тесты для проверки graceful degradation при недоступности Prometheus
