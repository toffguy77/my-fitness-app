# План реализации: Рефакторинг Coach → Curator

## Обзор

Рефакторинг терминологии с "coach" на "curator" во всех компонентах системы BURCEV. Выполняется последовательно: миграция БД → Backend → Frontend → Документация.

## Задачи

- [x] 1. Создать миграцию базы данных
  - [x] 1.1 Создать файл `apps/api/migrations/010_rename_coach_to_curator_up.sql`
    - Переименовать таблицу `coach_client_relationships` → `curator_client_relationships`
    - Переименовать колонки `coach_id` → `curator_id` во всех таблицах
    - Переименовать колонку `coach_feedback` → `curator_feedback` в `weekly_reports`
    - Удалить старые индексы и создать новые с "curator"
    - Удалить старые RLS-политики и создать новые с "Curator"
    - Обновить комментарии к таблицам
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 1.2 Создать файл `apps/api/migrations/010_rename_coach_to_curator_down.sql`
    - Обратные операции для отката миграции
    - _Requirements: 2.7_
  
  - [x] 1.3 Создать скрипт запуска миграции `apps/api/run-curator-migration.go`
    - Скрипт для применения миграции с проверкой результата
    - _Requirements: 2.6_

- [x] 2. Checkpoint - Применить миграцию
  - Применить миграцию к базе данных
  - Проверить, что таблицы и колонки переименованы
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Обновить Backend типы (Go)
  - [x] 3.1 Обновить `apps/api/internal/modules/dashboard/types.go`
    - Переименовать `CoachID` → `CuratorID` в структурах `WeeklyPlan`, `Task`, `WeeklyReport`
    - Переименовать `CoachFeedback` → `CuratorFeedback` в `WeeklyReport`
    - Обновить JSON-теги: `coach_id` → `curator_id`, `coach_feedback` → `curator_feedback`
    - Обновить DB-теги: `coach_id` → `curator_id`, `coach_feedback` → `curator_feedback`
    - Обновить сообщения валидации
    - _Requirements: 1.2_
  
  - [x] 3.2 Написать property-тест для валидации структур
    - **Property 1: Отсутствие "coach" в Go-коде**
    - **Validates: Requirements 1.1, 1.3, 1.4, 1.5**

- [x] 4. Обновить Backend сервис (Go)
  - [x] 4.1 Обновить `apps/api/internal/modules/dashboard/service.go`
    - Переименовать функцию `validateCoachClientRelationship` → `validateCuratorClientRelationship`
    - Переименовать параметры `coachID` → `curatorID` во всех функциях
    - Обновить SQL-запросы: `coach_id` → `curator_id`, `coach_client_relationships` → `curator_client_relationships`
    - Обновить комментарии
    - _Requirements: 1.1, 1.3, 1.4_

- [x] 5. Обновить Backend хендлер (Go)
  - [x] 5.1 Обновить `apps/api/internal/modules/dashboard/handler.go`
    - Изменить проверку роли: `"coach"` → `"curator"`
    - Обновить сообщения об ошибках: `"Only coaches can..."` → `"Only curators can..."`
    - Переименовать переменные `coachID` → `curatorID`
    - Обновить комментарии
    - _Requirements: 1.5, 1.6_
  
  - [x] 5.2 Написать property-тест для проверки роли curator
    - **Property 2: Корректность проверки роли curator**
    - **Validates: Requirements 1.6**

- [x] 6. Обновить Backend тесты (Go)
  - [x] 6.1 Обновить `apps/api/internal/modules/dashboard/handler_test.go`
    - Переименовать mock-методы с `coach` на `curator`
    - Обновить тестовые данные: `CoachID` → `CuratorID`
    - Изменить проверку роли в тестах: `"coach"` → `"curator"`
    - Переименовать тесты: `TestCreateWeeklyPlan_NotCoach` → `TestCreateWeeklyPlan_NotCurator`
    - _Requirements: 5.1, 5.3, 5.4_
  
  - [x] 6.2 Обновить `apps/api/internal/modules/dashboard/properties_test.go`
    - Обновить комментарии и названия property-тестов
    - Переименовать переменные `coachID` → `curatorID`
    - Обновить SQL-запросы в mock expectations
    - _Requirements: 5.2_
  
  - [x] 6.3 Обновить `apps/api/run-dashboard-migrations.go`
    - Обновить списки таблиц и индексов с "coach" на "curator"
    - _Requirements: 5.1_

- [x] 7. Checkpoint - Запустить Backend тесты
  - Запустить `make test-api`
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Обновить Frontend типы (TypeScript)
  - [x] 8.1 Обновить `apps/web/src/features/dashboard/types.ts`
    - Переименовать поля интерфейсов: `coachId` → `curatorId`, `coachFeedback` → `curatorFeedback`
    - Обновить Zod-схемы: `coachId` → `curatorId`, `coachFeedback` → `curatorFeedback`
    - Обновить комментарии
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 8.2 Написать property-тест для TypeScript типов
    - **Property 5: Отсутствие "coach" в TypeScript-коде**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [x] 9. Обновить Frontend тесты (TypeScript)
  - [x] 9.1 Обновить `apps/web/src/features/dashboard/__tests__/types.test.ts`
    - Обновить тестовые данные: `coachId` → `curatorId`
    - _Requirements: 3.5, 5.1_
  
  - [x] 9.2 Обновить `apps/web/src/features/dashboard/store/__tests__/*.ts`
    - Обновить тестовые данные во всех файлах тестов store
    - `coachId` → `curatorId`, `createdBy` с "coach" → "curator"
    - _Requirements: 3.5, 5.1_

- [x] 10. Checkpoint - Запустить Frontend тесты
  - Запустить `make test-web`
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Обновить документацию
  - [x] 11.1 Обновить steering файлы
    - `.kiro/steering/database-migrations.md`: заменить "coach" → "curator", "Coaches" → "Curators"
    - `.kiro/steering/structure.md`: обновить примеры кода
    - `.kiro/steering/tech.md`: обновить примеры
    - `.kiro/steering/product.md`: заменить "тренер" → "куратор" если есть
    - _Requirements: 4.2_
  
  - [x] 11.2 Обновить спецификации
    - `.kiro/specs/comprehensive-requirements/`: проверить и обновить файлы
    - `.kiro/specs/dashboard/`: обновить design.md, requirements.md
    - _Requirements: 4.3_
  
  - [x] 11.3 Обновить документацию API
    - `apps/api/migrations/TEST_MIGRATIONS.md`
    - `apps/api/migrations/DASHBOARD_MIGRATIONS_SUMMARY.md`
    - `apps/api/S3_INTEGRATION.md`
    - _Requirements: 4.1_
  
  - [x] 11.4 Обновить README
    - `README.md`: заменить "coaching" на подходящий термин
    - _Requirements: 4.4_
  
  - [x] 11.5 Написать property-тест для документации
    - **Property 6: Отсутствие "coach" в документации**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 12. Обновить coverage файлы
  - [x] 12.1 Удалить устаревшие coverage HTML файлы
    - `apps/api/coverage-migrations.html`
    - `apps/api/coverage-dashboard.html`
    - Эти файлы будут перегенерированы при следующем запуске тестов
    - _Requirements: 1.4_

- [x] 13. Финальная проверка
  - [x] 13.1 Запустить полный набор тестов
    - `make test`
    - Убедиться, что все тесты проходят
    - _Requirements: 5.5_
  
  - [x] 13.2 Проверить отсутствие "coach" в коде
    - Выполнить grep-поиск по всему проекту
    - Убедиться, что "coach" не встречается (кроме исторических ссылок)
    - _Requirements: 1.1, 3.1, 4.1_
  
  - [x] 13.3 Написать property-тест для API
    - **Property 7: Корректность JSON API**
    - **Validates: Requirements 6.1, 6.2**

- [x] 14. Checkpoint - Финальная проверка
  - Ensure all tests pass, ask the user if questions arise.

## Примечания

- Задачи с `*` являются опциональными и могут быть пропущены для ускорения MVP
- Каждая задача ссылается на конкретные требования для трассируемости
- Checkpoints обеспечивают инкрементальную валидацию
- Property-тесты валидируют универсальные свойства корректности
- Unit-тесты валидируют конкретные примеры и edge cases
