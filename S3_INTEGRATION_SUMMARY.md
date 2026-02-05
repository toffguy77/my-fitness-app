# Yandex Cloud S3 Integration - Summary

## Что было сделано

### 1. Создан S3 клиент
- **Файл**: `apps/api/internal/shared/storage/s3.go`
- **Функциональность**:
  - Загрузка файлов в S3
  - Удаление файлов из S3
  - Генерация подписанных URL (signed URLs)
  - Проверка существования файлов
  - Получение метаданных файлов
- **Технологии**: AWS SDK v2 для Go, совместимый с Yandex Cloud

### 2. Обновлен Dashboard Service
- **Файл**: `apps/api/internal/modules/dashboard/service.go`
- **Изменения**:
  - Добавлен S3Client в структуру Service
  - Обновлен метод `UploadPhoto()` для реальной загрузки в S3
  - Добавлен метод `GetPhotoSignedURL()` для получения временных ссылок
  - Реализован rollback: удаление из S3 при ошибке сохранения в БД
  - Добавлена функция `getFileExtension()` для определения расширения по MIME-типу

### 3. Добавлена конфигурация
- **Файл**: `apps/api/internal/config/config.go`
- **Переменные окружения**:
  - `S3_ACCESS_KEY_ID` - ID ключа доступа
  - `S3_SECRET_ACCESS_KEY` - Секретный ключ
  - `S3_BUCKET` - Имя бакета (weekly-progress-photos)
  - `S3_REGION` - Регион (ru-central1)
  - `S3_ENDPOINT` - Эндпоинт (https://storage.yandexcloud.net)

### 4. Обновлены зависимости
- **Файл**: `apps/api/go.mod`
- **Добавлено**:
  - `github.com/aws/aws-sdk-go-v2` v1.41.1
  - `github.com/aws/aws-sdk-go-v2/service/s3` v1.96.0
  - `github.com/aws/aws-sdk-go-v2/credentials` v1.19.7
  - `github.com/aws/aws-sdk-go-v2/config` v1.32.7

### 5. Создана документация
- **apps/api/S3_INTEGRATION.md** - Полная документация на английском
- **apps/api/S3_SETUP_RU.md** - Краткая инструкция на русском
- **apps/api/internal/shared/storage/README.md** - Документация по использованию пакета

### 6. Написаны тесты
- **Файл**: `apps/api/internal/shared/storage/s3_test.go`
- **Покрытие**:
  - Тесты инициализации клиента
  - Тесты валидации конфигурации
  - Тесты генерации ключей S3
  - Тесты генерации подписанных URL

## Структура хранения

Фото сохраняются по следующей структуре:

```
weekly-photos/{userID}/{weekIdentifier}/{uuid}.{ext}
```

**Пример**:
```
weekly-photos/123/2024-W01/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg
```

## Поддерживаемые форматы

- JPEG (`.jpg`) - `image/jpeg`
- PNG (`.png`) - `image/png`
- WebP (`.webp`) - `image/webp`

## Ограничения

- Максимальный размер файла: 10 МБ
- Минимальный размер: > 0 байт

## Безопасность

- Файлы хранятся с ACL `private`
- Доступ только через подписанные URL (срок действия 15 минут)
- Статические ключи доступа хранятся в переменных окружения
- RLS политики в БД для контроля доступа к метаданным

## Следующие шаги

### Для запуска:

1. **Получить ключи доступа**:
   - Зайти в [Yandex Cloud Console](https://console.yandex.cloud)
   - Перейти к сервисному аккаунту `ajetieia8uunpq733f9t`
   - Создать статические ключи доступа

2. **Настроить переменные окружения**:
   ```bash
   # В файле apps/api/.env
   S3_ACCESS_KEY_ID=ваш-ключ
   S3_SECRET_ACCESS_KEY=ваш-секретный-ключ
   S3_BUCKET=weekly-progress-photos
   S3_REGION=ru-central1
   S3_ENDPOINT=https://storage.yandexcloud.net
   ```

3. **Установить зависимости**:
   ```bash
   cd apps/api
   go mod tidy
   ```

4. **Запустить сервер**:
   ```bash
   go run cmd/server/main.go
   ```

### Для тестирования:

```bash
# Загрузить тестовое фото
curl -X POST http://localhost:4000/api/dashboard/photo-upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "week_identifier=2024-W01" \
  -F "photo=@test-photo.jpg"
```

## Ресурсы Yandex Cloud

- **Бакет**: [weekly-progress-photos](https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/storage/buckets/weekly-progress-photos)
- **Сервисный аккаунт**: `ajetieia8uunpq733f9t`
- **Регион**: `ru-central1`
- **Эндпоинт**: `https://storage.yandexcloud.net`

## Файлы проекта

### Новые файлы:
- `apps/api/internal/shared/storage/s3.go` - S3 клиент
- `apps/api/internal/shared/storage/s3_test.go` - Тесты
- `apps/api/internal/shared/storage/README.md` - Документация пакета
- `apps/api/S3_INTEGRATION.md` - Полная документация
- `apps/api/S3_SETUP_RU.md` - Краткая инструкция
- `S3_INTEGRATION_SUMMARY.md` - Эта сводка

### Измененные файлы:
- `apps/api/internal/modules/dashboard/service.go` - Интеграция S3
- `apps/api/internal/config/config.go` - Конфигурация S3
- `apps/api/.env.example` - Примеры переменных окружения
- `apps/api/go.mod` - Зависимости AWS SDK v2

## Дополнительная информация

Для получения подробной информации см.:
- `apps/api/S3_INTEGRATION.md` - полная документация
- `apps/api/S3_SETUP_RU.md` - быстрый старт на русском
- `apps/api/internal/shared/storage/README.md` - API документация
