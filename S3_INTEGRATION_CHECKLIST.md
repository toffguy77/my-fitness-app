# Yandex Cloud S3 Integration - Checklist

## ✅ Что уже сделано

- [x] Создан S3 клиент (`apps/api/internal/shared/storage/s3.go`)
- [x] Обновлен Dashboard Service для работы с S3
- [x] Добавлена конфигурация S3 в Config
- [x] Установлены зависимости AWS SDK v2
- [x] Написаны unit тесты
- [x] Создана документация (EN + RU)
- [x] Код успешно компилируется

## 📋 Что нужно сделать для запуска

### 1. Получить ключи доступа Yandex Cloud

- [ ] Зайти в [Yandex Cloud Console](https://console.yandex.cloud)
- [ ] Перейти в раздел "Сервисные аккаунты"
- [ ] Выбрать аккаунт: `ajetieia8uunpq733f9t`
- [ ] Создать статические ключи доступа:
  - Нажать "Создать новый ключ"
  - Выбрать "Создать статический ключ доступа"
  - **Сохранить Access Key ID и Secret Access Key**

⚠️ **Важно**: Секретный ключ показывается только один раз!

### 2. Настроить переменные окружения

- [ ] Открыть файл `apps/api/.env`
- [ ] Добавить следующие строки:

```bash
# Yandex Cloud S3
S3_ACCESS_KEY_ID=ваш-access-key-id
S3_SECRET_ACCESS_KEY=ваш-secret-access-key
S3_BUCKET=weekly-progress-photos
S3_REGION=ru-central1
S3_ENDPOINT=https://storage.yandexcloud.net
```

### 3. Установить зависимости

- [ ] Выполнить команды:

```bash
cd apps/api
go mod tidy
```

### 4. Создать handler для загрузки фото

- [ ] Создать или обновить `apps/api/internal/modules/dashboard/handler.go`
- [ ] Добавить методы:
  - `UploadPhoto(c *gin.Context)` - для загрузки фото
  - `GetPhotoSignedURL(c *gin.Context)` - для получения временной ссылки
- [ ] См. пример в `apps/api/PHOTO_UPLOAD_HANDLER_EXAMPLE.md`

### 5. Добавить роуты в main.go

- [ ] Открыть `apps/api/cmd/server/main.go`
- [ ] Инициализировать S3 клиент:

```go
s3Config := &storage.S3Config{
    AccessKeyID:     cfg.S3AccessKeyID,
    SecretAccessKey: cfg.S3SecretAccessKey,
    Bucket:          cfg.S3Bucket,
    Region:          cfg.S3Region,
    Endpoint:        cfg.S3Endpoint,
}
s3Client, err := storage.NewS3Client(s3Config, log)
```

- [ ] Передать s3Client в dashboard service:

```go
dashboardService := dashboard.NewService(db, log, s3Client)
```

- [ ] Добавить роуты:

```go
dashboardRoutes.POST("/photo-upload", dashboardHandler.UploadPhoto)
dashboardRoutes.GET("/photos/:id/signed-url", dashboardHandler.GetPhotoSignedURL)
```

### 6. Запустить и протестировать

- [ ] Запустить сервер:

```bash
cd apps/api
go run cmd/server/main.go
```

- [ ] Протестировать загрузку:

```bash
curl -X POST http://localhost:4000/api/dashboard/photo-upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "week_identifier=2024-W01" \
  -F "photo=@test-photo.jpg"
```

- [ ] Проверить, что фото появилось в бакете:
  - Открыть [Yandex Cloud Console](https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/storage/buckets/weekly-progress-photos)
  - Проверить наличие файла в папке `weekly-photos/{userID}/{weekIdentifier}/`

### 7. Интегрировать с фронтендом

- [ ] Создать компонент для загрузки фото
- [ ] Добавить валидацию на клиенте (размер, формат)
- [ ] Реализовать отображение загруженных фото
- [ ] Добавить индикатор прогресса загрузки

## 📚 Документация

### Основная документация
- `apps/api/S3_INTEGRATION.md` - Полная документация (EN)
- `apps/api/S3_SETUP_RU.md` - Быстрый старт (RU)
- `S3_INTEGRATION_SUMMARY.md` - Сводка изменений

### Примеры и руководства
- `apps/api/PHOTO_UPLOAD_HANDLER_EXAMPLE.md` - Пример handler'а
- `apps/api/internal/shared/storage/README.md` - API документация

## 🔍 Проверка работы

### Проверить конфигурацию
```bash
cd apps/api
go run -c 'import "github.com/burcev/api/internal/config"; cfg, _ := config.Load(); println(cfg.S3Bucket)'
```

### Проверить компиляцию
```bash
cd apps/api
go build ./internal/shared/storage/
go build ./internal/modules/dashboard/
```

### Запустить тесты
```bash
cd apps/api
go test ./internal/shared/storage/ -v
```

## 🐛 Решение проблем

### Ошибка "S3 credentials are required"
- Проверьте наличие `S3_ACCESS_KEY_ID` и `S3_SECRET_ACCESS_KEY` в `.env`
- Убедитесь, что файл `.env` загружается (используется `godotenv`)

### Ошибка "Failed to upload file to S3"
- Проверьте доступ к `storage.yandexcloud.net`
- Убедитесь, что ключи доступа действительны
- Проверьте права сервисного аккаунта на запись в бакет

### Ошибка "Bucket not found"
- Убедитесь, что бакет `weekly-progress-photos` существует
- Проверьте права доступа сервисного аккаунта к бакету

### Фото не отображается
- Проверьте, что используется signed URL (не прямая ссылка)
- Убедитесь, что URL не истёк (15 минут)
- Проверьте CORS настройки бакета

## 📞 Контакты и ресурсы

- **Бакет**: https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/storage/buckets/weekly-progress-photos
- **Документация Yandex Cloud**: https://yandex.cloud/ru/docs/storage/
- **AWS SDK v2 Docs**: https://aws.github.io/aws-sdk-go-v2/

## ✨ Дополнительные улучшения (опционально)

- [ ] Добавить сжатие изображений перед загрузкой
- [ ] Реализовать генерацию thumbnails
- [ ] Добавить прогресс-бар загрузки
- [ ] Реализовать batch upload (несколько фото)
- [ ] Добавить возможность удаления фото
- [ ] Настроить CDN для быстрой доставки
- [ ] Добавить watermark на фото
- [ ] Реализовать автоматическую ротацию по EXIF

## 🎯 Следующие шаги после интеграции

1. Протестировать на staging окружении
2. Настроить мониторинг загрузок
3. Добавить метрики (размер файлов, время загрузки)
4. Настроить алерты на ошибки
5. Документировать API для фронтенда
6. Провести нагрузочное тестирование
