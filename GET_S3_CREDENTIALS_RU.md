# Получение ключей доступа для Yandex Cloud S3

## 📋 Что нужно

- Аккаунт в Yandex Cloud
- Доступ к сервисному аккаунту `ajetieia8uunpq733f9t`
- Права на создание статических ключей доступа

## 🔑 Пошаговая инструкция

### Способ 1: Через веб-консоль (рекомендуется)

#### Шаг 1: Открыть консоль Yandex Cloud

1. Перейдите на https://console.yandex.cloud
2. Войдите в свой аккаунт
3. Выберите нужный каталог (folder)

#### Шаг 2: Перейти к сервисным аккаунтам

1. В списке сервисов выберите **"Identity and Access Management"** (IAM)
2. В левой панели выберите **"Сервисные аккаунты"**
3. Найдите и выберите аккаунт: **`ajetieia8uunpq733f9t`**

Или перейдите напрямую:
https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/iam

#### Шаг 3: Создать статический ключ доступа

1. В верхней панели нажмите **"Создать новый ключ"**
2. Выберите **"Создать статический ключ доступа"**
3. (Опционально) Укажите описание ключа, например: "S3 access for weekly photos"
4. Нажмите **"Создать"**

#### Шаг 4: Сохранить ключи

⚠️ **ВАЖНО!** После закрытия окна секретный ключ больше не будет доступен!

В появившемся окне вы увидите:
- **Идентификатор ключа** (Access Key ID) - например: `YCAJEabcdefgh1234567`
- **Секретный ключ** (Secret Access Key) - например: `YCMabcdefghijklmnopqrstuvwxyz1234567890AB`

**Сохраните оба значения в безопасном месте!**

### Способ 2: Через CLI

Если у вас установлен Yandex Cloud CLI:

```bash
# Получить список сервисных аккаунтов
yc iam service-account list

# Создать статический ключ доступа
yc iam access-key create \
  --service-account-id ajetieia8uunpq733f9t \
  --description "S3 access for weekly photos"
```

Результат:
```yaml
access_key:
  id: aje6t3vsbj8l********
  service_account_id: ajetieia8uunpq733f9t
  created_at: "2026-01-29T11:37:51Z"
  key_id: YCAJEabcdefgh1234567
secret: YCMabcdefghijklmnopqrstuvwxyz1234567890AB
```

**Сохраните `key_id` и `secret`!**

## 📝 Добавление ключей в проект

### Шаг 1: Открыть файл .env

```bash
cd apps/api
nano .env  # или используйте любой редактор
```

### Шаг 2: Добавить ключи

Добавьте в конец файла:

```bash
# Yandex Cloud S3 (Object Storage)
S3_ACCESS_KEY_ID=YCAJEabcdefgh1234567
S3_SECRET_ACCESS_KEY=YCMabcdefghijklmnopqrstuvwxyz1234567890AB
S3_BUCKET=weekly-progress-photos
S3_REGION=ru-central1
S3_ENDPOINT=https://storage.yandexcloud.net
```

Замените значения на ваши реальные ключи!

### Шаг 3: Сохранить файл

```bash
# Ctrl+O, Enter, Ctrl+X (для nano)
# или :wq (для vim)
```

## ✅ Проверка

### Быстрая проверка конфигурации

```bash
cd apps/api
grep S3_ACCESS_KEY_ID .env
```

Должно вывести вашу строку с ключом.

### Полная проверка с тестом

```bash
cd apps/api
go run test-s3-upload.go
```

Ожидаемый результат:
```
=== Yandex Cloud S3 Integration Test ===

✓ S3 credentials found
  Bucket: weekly-progress-photos
  Region: ru-central1
  Endpoint: https://storage.yandexcloud.net
  Access Key ID: YCAJEabcde...

✓ S3 client initialized

Uploading test file to S3...
✓ File uploaded successfully!

✓ File exists in S3
✓ File size: 234 bytes
✓ Signed URL generated

=== Testing Image Upload ===
✓ Image uploaded successfully!

🎉 All tests passed! S3 integration is working correctly.
```

## 🔒 Безопасность

### ✅ Правильно:

- Хранить ключи в `.env` файле
- Добавить `.env` в `.gitignore` (уже сделано)
- Не коммитить ключи в Git
- Использовать разные ключи для dev/staging/prod

### ❌ Неправильно:

- Хранить ключи в коде
- Коммитить ключи в Git
- Делиться ключами публично
- Использовать одни ключи для всех окружений

## 🔄 Ротация ключей

Рекомендуется периодически обновлять ключи:

1. Создать новый статический ключ
2. Обновить `.env` с новыми значениями
3. Перезапустить приложение
4. Удалить старый ключ через консоль

## 🐛 Решение проблем

### Ошибка: "Access Denied"

**Причина**: Недостаточно прав у сервисного аккаунта

**Решение**:
1. Откройте https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/iam
2. Выберите сервисный аккаунт `ajetieia8uunpq733f9t`
3. Проверьте роли - должна быть `storage.editor` или `storage.admin`

### Ошибка: "SignatureDoesNotMatch"

**Причина**: Неверные ключи доступа

**Решение**:
1. Проверьте, что скопировали ключи полностью (без пробелов)
2. Убедитесь, что используете правильный Access Key ID и Secret Key
3. Попробуйте создать новые ключи

### Ошибка: "Bucket not found"

**Причина**: Бакет не существует или нет доступа

**Решение**:
1. Проверьте, что бакет `weekly-progress-photos` существует
2. Откройте https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/storage/buckets
3. Убедитесь, что сервисный аккаунт имеет доступ к бакету

### Ключи не сохранились

**Причина**: Окно закрыто до сохранения

**Решение**:
1. Удалите созданный ключ (если он отображается в списке)
2. Создайте новый ключ
3. Сразу сохраните оба значения

## 📚 Дополнительные ресурсы

- [Официальная документация Yandex Cloud IAM](https://yandex.cloud/ru/docs/iam/operations/authentication/manage-access-keys)
- [Документация Object Storage](https://yandex.cloud/ru/docs/storage/)
- [Управление доступом к бакетам](https://yandex.cloud/ru/docs/storage/operations/buckets/edit-acl)

## 📞 Контакты

- **Консоль Yandex Cloud**: https://console.yandex.cloud
- **Бакет**: https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/storage/buckets/weekly-progress-photos
- **Сервисный аккаунт**: `ajetieia8uunpq733f9t`

## ✨ Следующие шаги

После получения ключей:

1. ✅ Добавить ключи в `.env`
2. ✅ Запустить тест: `go run test-s3-upload.go`
3. ✅ Проверить загрузку в консоли Yandex Cloud
4. ✅ Создать handler для API
5. ✅ Интегрировать с фронтендом

Готово! 🎉
