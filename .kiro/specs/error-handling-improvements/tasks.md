# Implementation Plan: Error Handling Improvements

## Overview

Исправление критических ошибок в обработке запросов, RLS политиках и сетевых ошибках для улучшения стабильности и пользовательского опыта.

**Branch:** `feature/fatsecret-support`
**Repository:** https://github.com/toffguy77/my-fitness-app/tree/feature/fatsecret-support

## Tasks

- [x] 1. Создание утилиты для обработки запросов с AbortController
  - Создать `src/utils/request-handler.ts` с функцией `fetchWithAbort`
  - Реализовать функцию `isAbortError` для определения типа ошибки
  - Реализовать функцию `shouldLogError` для фильтрации ошибок
  - Добавить поддержку retry логики с экспоненциальной задержкой
  - _Requirements: 1.1, 1.2, 1.3, 3.3_

- [x] 1.1 Написать unit тесты для request handler
  - Тестировать определение AbortError
  - Тестировать фильтрацию логирования
  - Тестировать retry механизм
  - _Requirements: 1.1, 1.2, 1.3, 3.3_

- [x] 1.2 Написать property тест для AbortError фильтрации
  - **Property 1: AbortError Silent Cancellation**
  - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 2. Создание React hook для управления AbortController
  - Создать `src/hooks/useAbortController.ts`
  - Реализовать автоматическую очистку при размонтировании
  - Экспортировать signal и abort функцию
  - _Requirements: 1.4_

- [x] 2.1 Написать unit тесты для useAbortController hook
  - Тестировать создание AbortController
  - Тестировать очистку при unmount
  - _Requirements: 1.4_

- [x] 2.2 Написать property тест для component cleanup
  - **Property 2: Component Cleanup**
  - **Validates: Requirements 1.4**

- [x] 3. Checkpoint - Проверка AbortError handling
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Исправление RLS политик для products таблицы
  - Создать миграцию `migrations/fix_products_rls.sql`
  - Удалить старые ограничительные политики
  - Создать новую INSERT политику для authenticated пользователей
  - Создать новую SELECT политику для authenticated пользователей
  - Применить миграцию к базе данных
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4.1 Написать integration тесты для RLS политик
  - Тестировать INSERT операции от client пользователей
  - Тестировать SELECT операции от client пользователей
  - Проверять HTTP 200 ответы
  - _Requirements: 2.1, 2.2, 2.5_

- [x] 4.2 Написать property тест для Products INSERT
  - **Property 3: Products INSERT Permission**
  - **Validates: Requirements 2.1, 2.3, 2.5**

- [x] 4.3 Написать property тест для Products SELECT
  - **Property 4: Products SELECT Permission**
  - **Validates: Requirements 2.2, 2.4, 2.5**

- [x] 5. Checkpoint - Проверка RLS политик
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Создание image loader с fallback
  - Создать `src/utils/image-loader.ts`
  - Реализовать функцию `loadImage` с fallback
  - Добавить placeholder изображение в `/public/images/`
  - Реализовать функцию `getPlaceholder`
  - _Requirements: 3.2_

- [x] 6.1 Написать unit тесты для image loader
  - Тестировать успешную загрузку изображений
  - Тестировать fallback при ошибке
  - Тестировать использование placeholder
  - _Requirements: 3.2_

- [x] 6.2 Написать property тест для image fallback
  - **Property 5: Image Fallback**
  - **Validates: Requirements 3.2**

- [x] 7. Улучшение обработки сетевых ошибок
  - Добавить определение network errors в request handler
  - Реализовать retry логику с экспоненциальной задержкой (1s, 2s, 4s)
  - Добавить пользовательские уведомления после исчерпания попыток
  - Добавить структурированное логирование с контекстом
  - _Requirements: 3.1, 3.3, 3.4, 3.5_

- [x] 7.1 Написать unit тесты для network error handling
  - Тестировать определение network errors
  - Тестировать retry с правильными задержками
  - Тестировать пользовательские уведомления
  - _Requirements: 3.1, 3.3, 3.4_

- [x] 7.2 Написать property тест для retry механизма
  - **Property 6: Retry with Exponential Backoff**
  - **Validates: Requirements 3.3**

- [x] 7.3 Написать property тест для error logging
  - **Property 7: Network Error Logging**
  - **Validates: Requirements 3.5**

- [x] 8. Checkpoint - Проверка network error handling
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Реализация graceful degradation для Prometheus метрик
  - Обновить `src/utils/metrics/prometheus-collector.ts`
  - Добавить проверку доступности Pushgateway при старте
  - Реализовать silent failure режим для недоступного Pushgateway
  - Добавить retry механизм каждые 60 секунд
  - Логировать только первую ошибку и успешное восстановление
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 9.1 Написать unit тесты для Prometheus graceful degradation
  - Тестировать silent failure при недоступности
  - Тестировать retry механизм
  - Тестировать восстановление подключения
  - Тестировать логирование только первой ошибки
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 9.2 Написать property тест для Prometheus silent failure
  - **Property 8: Prometheus Silent Failure**
  - **Validates: Requirements 4.2**

- [x] 9.3 Написать property тест для Prometheus connection recovery
  - **Property 9: Prometheus Connection Recovery**
  - **Validates: Requirements 4.4, 4.5**

- [x] 10. Checkpoint - Проверка Prometheus graceful degradation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Обновление существующих компонентов
  - Обновить Header компонент для использования useAbortController
  - Обновить Dashboard компонент для использования useAbortController
  - Обновить GlobalChatWidget для использования useAbortController
  - Обновить SubscriptionBanner для использования useAbortController
  - Обновить Products компонент для использования image loader
  - _Requirements: 1.4, 3.2_

- [x] 11.1 Написать integration тесты для обновленных компонентов
  - Тестировать отмену запросов при навигации
  - Тестировать fallback изображений в Products
  - Тестировать отсутствие AbortError в логах
  - _Requirements: 1.1, 1.4, 3.2_

- [x] 12. Добавление мониторинга и метрик
  - Добавить метрику для AbortError occurrence rate
  - Добавить метрику для RLS policy violations
  - Добавить метрику для network retry success rate
  - Добавить метрику для image fallback usage
  - Добавить метрику для Prometheus connection status
  - _Requirements: 3.5, 4.5_

- [x] 12.1 Написать unit тесты для метрик
  - Тестировать запись метрик
  - Тестировать агрегацию метрик
  - _Requirements: 3.5_

- [x] 13. Final checkpoint - Comprehensive testing
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Документация и deployment
  - Обновить README с информацией о новых утилитах
  - Создать migration guide для RLS политик
  - Добавить примеры использования в документацию
  - Документировать Prometheus graceful degradation
  - Подготовить release notes

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Critical fixes (Tasks 1, 4, 7, 9) should be prioritized
- RLS migration (Task 4) requires database access and should be tested in staging first
- Prometheus graceful degradation (Task 9) prevents log spam in production
