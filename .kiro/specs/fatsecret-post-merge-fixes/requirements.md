# Requirements Document

## Introduction

Исправление критических проблем после мержа FatSecret интеграции, включая ошибки RLS политик, проблемы с загрузкой данных на клиенте, и конфигурацию API credentials.

## Glossary

- **RLS**: Row Level Security - механизм безопасности PostgreSQL для контроля доступа к строкам таблиц
- **Product_Database**: Таблица products в PostgreSQL для хранения продуктов из внешних API
- **System_User**: Специальный пользователь системы для автоматических операций
- **API_Integration**: Серверный код, выполняющий запросы к внешним API
- **Client_Component**: React компонент на стороне клиента
- **Abort_Error**: Ошибка прерывания HTTP запроса на клиенте

## Requirements

### Requirement 1: RLS Policy для Products

**User Story:** Как система, я хочу сохранять продукты из внешних API в базу данных, чтобы кэшировать их для будущего использования.

#### Acceptance Criteria

1. WHEN API_Integration получает продукт из FatSecret или OpenFoodFacts, THEN THE System SHALL save the product to Product_Database without requiring super_admin privileges
2. THE System SHALL create a new RLS policy allowing INSERT operations for products with source 'fatsecret' or 'openfoodfacts'
3. THE System SHALL maintain existing RLS policy requiring super_admin for manual product management
4. WHEN a product already exists in Product_Database, THEN THE System SHALL update usage_count instead of creating duplicate
5. THE System SHALL log successful product saves with source attribution

### Requirement 2: Client Data Loading Errors

**User Story:** Как пользователь, я хочу видеть корректно загруженные данные на всех страницах, чтобы приложение работало без ошибок.

#### Acceptance Criteria

1. WHEN Client_Component loads data, THEN THE System SHALL handle AbortError gracefully without breaking UI
2. WHEN multiple components load simultaneously, THEN THE System SHALL prevent request cancellation conflicts
3. WHEN Header component loads user data, THEN THE System SHALL complete the request before component unmounts
4. WHEN SubscriptionBanner loads status, THEN THE System SHALL handle loading states properly
5. WHEN Dashboard loads logs, THEN THE System SHALL retry failed requests up to 2 times

### Requirement 3: Nutrition Targets Loading

**User Story:** Как пользователь, я хочу видеть свои цели по питанию, чтобы отслеживать прогресс.

#### Acceptance Criteria

1. WHEN Nutrition page loads, THEN THE System SHALL fetch nutrition_targets without 406 errors
2. WHEN nutrition_targets query fails, THEN THE System SHALL log the error with query details
3. THE System SHALL verify RLS policies for nutrition_targets table allow user access
4. WHEN user has no nutrition_targets, THEN THE System SHALL display appropriate empty state
5. THE System SHALL handle network errors gracefully with user-friendly messages

### Requirement 4: Daily Logs Access

**User Story:** Как пользователь, я хочу видеть свои записи дневника питания, чтобы отслеживать потребление КБЖУ.

#### Acceptance Criteria

1. WHEN Dashboard loads, THEN THE System SHALL fetch daily_logs without 406 errors
2. THE System SHALL verify RLS policies for daily_logs table allow user read access
3. WHEN daily_logs query fails with 406, THEN THE System SHALL log the RLS policy violation details
4. THE System SHALL ensure authenticated users can read their own daily_logs
5. WHEN user has no daily_logs, THEN THE System SHALL display appropriate empty state

### Requirement 5: FatSecret Credentials Configuration

**User Story:** Как администратор, я хочу настроить FatSecret API credentials, чтобы интеграция работала корректно.

#### Acceptance Criteria

1. THE System SHALL read FATSECRET_CLIENT_ID from environment variables
2. THE System SHALL read FATSECRET_CLIENT_SECRET from environment variables
3. WHEN credentials are missing, THEN THE System SHALL log a warning and disable FatSecret integration
4. WHEN credentials are present, THEN THE System SHALL enable FatSecret API client
5. THE System SHALL validate credentials format before attempting API calls
6. WHEN credentials are invalid, THEN THE System SHALL log the error and fall back to OpenFoodFacts only

### Requirement 6: Products API 403/406 Errors

**User Story:** Как пользователь, я хочу видеть продукты без ошибок доступа, чтобы добавлять их в дневник.

#### Acceptance Criteria

1. WHEN user queries products API, THEN THE System SHALL return results without 403 or 406 errors
2. THE System SHALL verify RLS policies allow authenticated users to read products
3. WHEN products query fails with 406, THEN THE System SHALL log the specific RLS policy causing the issue
4. THE System SHALL ensure products from all sources (fatsecret, openfoodfacts, user) are accessible
5. WHEN user searches products, THEN THE System SHALL return combined results from all sources

### Requirement 7: Error Logging Enhancement

**User Story:** Как разработчик, я хочу видеть детальные логи ошибок, чтобы быстро диагностировать проблемы.

#### Acceptance Criteria

1. WHEN RLS policy violation occurs, THEN THE System SHALL log the table name, operation, and user context
2. WHEN API request fails, THEN THE System SHALL log the endpoint, status code, and error message
3. WHEN AbortError occurs, THEN THE System SHALL log the component name and request URL
4. THE System SHALL include timestamp and user_id in all error logs
5. WHEN fallback mechanism activates, THEN THE System SHALL log the reason and fallback source

### Requirement 8: Database Migration

**User Story:** Как администратор, я хочу применить миграцию для исправления RLS политик, чтобы система работала корректно.

#### Acceptance Criteria

1. THE System SHALL provide a migration script to update products RLS policies
2. THE migration SHALL add policy allowing API_Integration to INSERT products
3. THE migration SHALL preserve existing super_admin management policy
4. THE migration SHALL be idempotent (safe to run multiple times)
5. THE migration SHALL include rollback instructions

### Requirement 9: Request Cancellation Handling

**User Story:** Как система, я хочу корректно обрабатывать отмену запросов, чтобы избежать AbortError в UI.

#### Acceptance Criteria

1. WHEN component unmounts, THEN THE System SHALL cancel pending requests gracefully
2. WHEN request is cancelled, THEN THE System SHALL not update component state
3. WHEN multiple requests are in flight, THEN THE System SHALL track each request separately
4. THE System SHALL use AbortController for all fetch requests
5. WHEN AbortError occurs, THEN THE System SHALL not log it as a critical error

### Requirement 10: Prometheus Metrics (Optional)

**User Story:** Как администратор, я хочу настроить Prometheus pushgateway, чтобы собирать метрики приложения.

#### Acceptance Criteria

1. WHEN pushgateway is unavailable, THEN THE System SHALL log a warning but continue operation
2. THE System SHALL make pushgateway configuration optional
3. WHEN PROMETHEUS_PUSHGATEWAY_URL is not set, THEN THE System SHALL disable metrics pushing
4. THE System SHALL not fail application startup if pushgateway is unreachable
5. WHEN metrics push fails, THEN THE System SHALL log the error at DEBUG level, not ERROR
