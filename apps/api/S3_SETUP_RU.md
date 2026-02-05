# Настройка Yandex Cloud S3 для загрузки фото

## Быстрый старт

### 1. Получение ключей доступа

1. Откройте [Yandex Cloud Console](https://console.yandex.cloud)
2. Перейдите в раздел "Сервисные аккаунты"
3. Выберите аккаунт: `ajetieia8uunpq733f9t`
4. Создайте статические ключи доступа:
   - Нажмите "Создать новый ключ"
   - Выберите "Создать статический ключ доступа"
   - **Сохраните Access Key ID и Secret Access Key**

⚠️ **Важно**: Секретный ключ показывается только один раз!

### 2. Настройка переменных окружения

Добавьте в файл `apps/api/.env`:

```bash
# Yandex Cloud S3
S3_ACCESS_KEY_ID=ваш-access-key-id
S3_SECRET_ACCESS_KEY=ваш-secret-access-key
S3_BUCKET=weekly-progress-photos
S3_REGION=ru-central1
S3_ENDPOINT=https://storage.yandexcloud.net
```

### 3. Установка зависимостей

```bash
cd apps/api
go mod tidy
```

### 4. Проверка работы

```bash
# Запустите сервер
go run cmd/server/main.go

# В другом терминале загрузите тестовое фото
curl -X POST http://localhost:4000/api/dashboard/photo-upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "week_identifier=2024-W01" \
  -F "photo=@test-photo.jpg"
```

## Структура хранения

Фото сохраняются по пути:
```
weekly-photos/{userID}/{weekIdentifier}/{uuid}.{ext}
```

Пример:
```
weekly-photos/123/2024-W01/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg
```

## Поддерживаемые форматы

- JPEG (`.jpg`)
- PNG (`.png`)
- WebP (`.webp`)

## Ограничения

- Максимальный размер файла: 10 МБ
- Только изображения

## Ресурсы

- **Бакет**: [weekly-progress-photos](https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/storage/buckets/weekly-progress-photos)
- **Сервисный аккаунт**: `ajetieia8uunpq733f9t`
- **Документация**: [Yandex Cloud Object Storage](https://yandex.cloud/ru/docs/storage/)

## Решение проблем

### Ошибка "S3 credentials are required"
- Проверьте наличие переменных `S3_ACCESS_KEY_ID` и `S3_SECRET_ACCESS_KEY` в `.env`

### Ошибка "Failed to upload file to S3"
- Проверьте доступ к `storage.yandexcloud.net`
- Убедитесь, что ключи доступа действительны
- Проверьте права сервисного аккаунта

### Ошибка "Bucket not found"
- Убедитесь, что бакет `weekly-progress-photos` существует
- Проверьте права доступа сервисного аккаунта к бакету

## Дополнительная информация

Полная документация: `apps/api/S3_INTEGRATION.md`
