# Справочник API My Fitness App

**Версия документа:** 1.0  
**Дата создания:** Январь 2025  
**Статус:** Актуальная реализация v4.0+

---

## Обзор

Этот документ описывает все API My Fitness App, включая Supabase Edge Functions, Database Functions, Client-side API и внешние интеграции.

---

## Supabase Edge Functions

### 1. send-notification

**Путь:** `/functions/v1/send-notification`

**Описание:** Отправка email уведомлений через Resend API

**Метод:** POST

**Заголовки:**
```
Authorization: Bearer {SUPABASE_ANON_KEY}
Content-Type: application/json
```

**Тело запроса:**
```typescript
{
  userId: string
  template: 'reminder_data_entry' | 'coach_note_notification' | 'subscription_expiring' | 'subscription_expired'
  data?: Record<string, any>
}
```

**Примеры:**

#### Уведомление о заметке тренера
```json
{
  "userId": "uuid",
  "template": "coach_note_notification",
  "data": {
    "date": "2025-01-20",
    "noteContent": "Отличная работа!",
    "coachName": "Иван Иванов"
  }
}
```

#### Уведомление об истекающей подписке
```json
{
  "userId": "uuid",
  "template": "subscription_expiring",
  "data": {
    "daysRemaining": 3
  }
}
```

**Ответ:**
```json
{
  "success": true,
  "emailId": "resend_email_id"
}
```

**Ошибки:**
- `400` - Неверный запрос
- `404` - Пользователь не найден
- `500` - Ошибка сервера

---

### 2. check-expired-subscriptions

**Путь:** `/functions/v1/check-expired-subscriptions`

**Описание:** Проверка и деактивация истекших подписок

**Метод:** POST

**Заголовки:**
```
Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
Content-Type: application/json
```

**Тело запроса:**
```json
{}
```

**Функциональность:**
1. Вызывает `get_expired_subscriptions()` для получения истекших подписок
2. Вызывает `deactivate_expired_subscriptions()` для деактивации
3. Отправляет уведомления об истечении подписки

**Ответ:**
```json
{
  "success": true,
  "deactivatedCount": 5,
  "notificationsSent": 5
}
```

**Использование:**
- Вызывается через cron job ежедневно в 00:00

---

### 3. check-expiring-subscriptions

**Путь:** `/functions/v1/check-expiring-subscriptions`

**Описание:** Проверка подписок, истекающих в ближайшие дни

**Метод:** POST

**Заголовки:**
```
Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
Content-Type: application/json
```

**Тело запроса:**
```json
{
  "daysAhead": 3
}
```

**Функциональность:**
1. Вызывает `get_expiring_subscriptions(daysAhead)` для получения подписок
2. Отправляет уведомления о скором истечении

**Ответ:**
```json
{
  "success": true,
  "expiringCount": 3,
  "notificationsSent": 3
}
```

**Использование:**
- Вызывается через cron job ежедневно в 00:00

---

### 4. update-product-cache

**Путь:** `/functions/v1/update-product-cache`

**Описание:** Обновление кэша популярных продуктов

**Метод:** POST

**Функциональность:**
1. Получает популярные продукты из Open Food Facts API
2. Обновляет таблицу `products`
3. Обновляет счетчики использования

**Использование:**
- Вызывается через cron job еженедельно

---

## Next.js API Routes

### 1. /api/nutrition-targets/update

**Описание:** Обновление целей питания (только для тренеров)

**Метод:** POST

**Авторизация:** Требуется (JWT токен)

**Тело запроса:**
```typescript
{
  targetId: string // UUID
  calories: number // 1000-6000
  protein: number // 20-500
  fats: number // 20-200
  carbs: number // 20-500
  clientId: string // UUID
}
```

**Валидация:**
- Zod схема для валидации типов
- Проверка прав (только тренер или super_admin)
- Проверка доступа к клиенту
- Дополнительная валидация через `validateNutritionTargets()`

**Ответ:**
```json
{
  "success": true
}
```

**Ошибки:**
- `400` - Неверные данные
- `401` - Не авторизован
- `403` - Нет прав
- `500` - Ошибка сервера

---

### 2. /api/achievements/check

**Описание:** Проверка и присвоение достижений

**Метод:** POST

**Авторизация:** Требуется

**Тело запроса:**
```typescript
{
  triggerType: 'streak_days' | 'total_meals' | 'ocr_used' | 'weight_logged' | 'days_active'
  triggerData?: Record<string, any>
}
```

**Ответ:**
```json
{
  "achievements": [
    {
      "achievement_id": "uuid",
      "achievement_code": "7_days_streak",
      "achievement_name": "Неделя подряд"
    }
  ]
}
```

---

### 3. /api/invite-codes/create

**Описание:** Создание нового инвайт-кода (только для тренеров)

**Метод:** POST

**Авторизация:** Требуется (тренер)

**Тело запроса:**
```typescript
{
  maxUses?: number
  expiresAt?: string
}
```

**Ответ:**
```json
{
  "code": "ABC12345",
  "id": "uuid"
}
```

---

### 4. /api/invite-codes/validate

**Описание:** Валидация инвайт-кода

**Метод:** POST

**Тело запроса:**
```typescript
{
  code: string
}
```

**Ответ:**
```json
{
  "valid": true,
  "coachId": "uuid",
  "coachName": "Иван Иванов"
}
```

---

### 5. /api/ocr/save

**Описание:** Сохранение результатов OCR сканирования

**Метод:** POST

**Авторизация:** Требуется

**Тело запроса:**
```typescript
{
  imageHash: string
  ocrProvider: string
  modelName?: string
  confidence: number
  success: boolean
  extractedData: Record<string, any>
  processingTimeMs: number
  costUsd?: number
}
```

**Ответ:**
```json
{
  "success": true,
  "scanId": "uuid"
}
```

---

## Database Functions (PostgreSQL)

### 1. check_achievements

**Описание:** Проверка и присвоение достижений пользователю

**Сигнатура:**
```sql
check_achievements(
  user_id_param UUID,
  trigger_type_param TEXT,
  trigger_data_param JSONB DEFAULT '{}'::jsonb
) RETURNS TABLE(achievement_id UUID, achievement_code TEXT, achievement_name TEXT)
```

**Параметры:**
- `user_id_param` — ID пользователя
- `trigger_type_param` — тип триггера (streak_days, total_meals, ocr_used, weight_logged, days_active)
- `trigger_data_param` — дополнительные данные (опционально)

**Возвращает:**
- Таблицу с полученными достижениями

**Пример:**
```sql
SELECT * FROM check_achievements(
  'user-uuid'::UUID,
  'streak_days',
  '{}'::jsonb
);
```

---

### 2. use_invite_code

**Описание:** Использование инвайт-кода и возврат ID тренера

**Сигнатура:**
```sql
use_invite_code(
  code_param TEXT,
  user_id_param UUID
) RETURNS UUID
```

**Параметры:**
- `code_param` — код инвайта
- `user_id_param` — ID пользователя

**Возвращает:**
- ID тренера для назначения клиенту

**Пример:**
```sql
SELECT use_invite_code('ABC12345', 'user-uuid'::UUID);
```

---

### 3. validate_calories_match_macros

**Описание:** Валидация соответствия калорий макронутриентам

**Сигнатура:**
```sql
validate_calories_match_macros(
  calories INTEGER,
  protein INTEGER,
  fats INTEGER,
  carbs INTEGER
) RETURNS BOOLEAN
```

**Логика:**
- Рассчитывает калории из макронутриентов: `(protein * 4) + (fats * 9) + (carbs * 4)`
- Проверяет разницу с указанными калориями (допустимая разница: ≤ 50 ккал)

**Возвращает:**
- `true` если соответствует, `false` если нет

---

### 4. validate_nutrition_limits

**Описание:** Валидация лимитов КБЖУ

**Сигнатура:**
```sql
validate_nutrition_limits(
  calories INTEGER,
  protein INTEGER,
  fats INTEGER,
  carbs INTEGER
) RETURNS BOOLEAN
```

**Лимиты:**
- Калории: ≤ 10000 ккал
- Белки: ≤ 1000 г
- Жиры: ≤ 500 г
- Углеводы: ≤ 1500 г

---

### 5. get_expired_subscriptions

**Описание:** Получение списка истекших подписок

**Сигнатура:**
```sql
get_expired_subscriptions() RETURNS TABLE(
  id UUID,
  email TEXT,
  full_name TEXT,
  subscription_end_date TIMESTAMPTZ
)
```

**Условия:**
- `subscription_status = 'active'`
- `subscription_tier = 'premium'`
- `subscription_end_date < NOW()`

---

### 6. get_expiring_subscriptions

**Описание:** Получение списка подписок, истекающих через N дней

**Сигнатура:**
```sql
get_expiring_subscriptions(days_ahead INTEGER) RETURNS TABLE(
  id UUID,
  email TEXT,
  full_name TEXT,
  subscription_end_date TIMESTAMPTZ,
  days_remaining INTEGER
)
```

**Параметры:**
- `days_ahead` — количество дней вперед для проверки

---

### 7. deactivate_expired_subscriptions

**Описание:** Деактивация истекших подписок

**Сигнатура:**
```sql
deactivate_expired_subscriptions() RETURNS INTEGER
```

**Функциональность:**
- Обновляет `subscription_status = 'cancelled'` для истекших подписок
- Возвращает количество обновленных записей

---

### 8. update_product_usage_count

**Описание:** Обновление счетчика использования продукта

**Тип:** Триггерная функция

**Использование:**
- Автоматически вызывается при добавлении записи в `product_usage_history`
- Увеличивает `usage_count` в таблице `products`

---

## Client-side API (Utils)

### Supabase Client

**Файл:** `src/utils/supabase/client.ts`

**Описание:** Клиент для работы с Supabase на клиенте

**Функции:**
```typescript
createClient() // Создает Supabase клиент
```

---

### Supabase Server

**Файл:** `src/utils/supabase/server.ts`

**Описание:** Клиент для работы с Supabase на сервере

**Функции:**
```typescript
createClient() // Создает Supabase клиент для сервера
```

---

### Profile Utils

**Файл:** `src/utils/supabase/profile.ts`

**Функции:**
```typescript
getUserProfile(user: User): Promise<UserProfile | null>
getCoachClients(coachId: string): Promise<UserProfile[]>
isSuperAdmin(userId: string): Promise<boolean>
isPremium(userId: string): Promise<boolean>
hasActiveSubscription(profile: UserProfile | null): boolean
```

---

### Export Utils

**Файл:** `src/utils/export.ts`

**Функции:**
```typescript
exportToCSV(data: DailyLog[], filename?: string): void
exportToJSON(data: DailyLog[], filename?: string): void
exportToPDF(
  dailyLogs: DailyLog[],
  nutritionTargets?: NutritionTarget[],
  filename?: string
): void
```

---

### Validation Utils

**Файл:** `src/utils/validation/nutrition.ts`

**Функции:**
```typescript
validateCaloriesMatchMacros(
  calories: number,
  protein: number,
  fats: number,
  carbs: number
): { valid: boolean; error?: string }

validateNutritionValues(
  value: number,
  limit: number,
  label: string
): { valid: boolean; warning?: string }

validateNutritionLimits(
  calories: number,
  protein: number,
  fats: number,
  carbs: number
): { valid: boolean; errors?: string[] }

calculateCaloriesFromMacros(
  protein: number,
  fats: number,
  carbs: number
): number
```

**Константы:**
```typescript
NUTRITION_LIMITS = {
  MAX_CALORIES_PER_DAY: 10000,
  MAX_CALORIES_PER_MEAL: 5000,
  MAX_PROTEIN_PER_DAY: 1000,
  MAX_FATS_PER_DAY: 500,
  MAX_CARBS_PER_DAY: 1500,
  MAX_WEIGHT: 500
}
```

---

### Products API

**Файл:** `src/utils/products/api.ts`

**Функции:**
```typescript
searchProducts(query: string): Promise<Product[]>
getProductByBarcode(barcode: string): Promise<Product | null>
```

---

### Products Cache

**Файл:** `src/utils/products/cache.ts`

**Функции:**
```typescript
getCachedProducts(query: string): Promise<Product[]>
cacheProduct(product: Product): Promise<void>
```

---

### OCR Utils

**Файл:** `src/utils/ocr/`

**Функции:**
```typescript
// Tesseract.js
extractWithTesseract(imageFile: File): Promise<OCRResult>

// OpenRouter API
extractWithOpenRouter(imageFile: File, model: string): Promise<OCRResult>

// Гибридный подход
extractWithHybrid(imageFile: File): Promise<OCRResult>
```

---

### Chat Realtime

**Файл:** `src/utils/chat/realtime.ts`

**Функции:**
```typescript
subscribeToMessages(
  userId: string,
  otherUserId: string,
  callback: (message: Message) => void
): RealtimeChannel

sendMessage(
  senderId: string,
  receiverId: string,
  content: string
): Promise<Message>
```

---

### Invites Utils

**Файл:** `src/utils/invites/generate.ts`

**Функции:**
```typescript
generateInviteCode(): string // Генерирует 8-символьный код
```

---

### Achievements Utils

**Файл:** `src/utils/achievements/check.ts`

**Функции:**
```typescript
checkAchievements(
  userId: string,
  triggerType: string,
  triggerData?: Record<string, any>
): Promise<Achievement[]>
```

---

## Внешние API

### Resend API

**Описание:** Отправка email уведомлений

**Endpoint:** `https://api.resend.com/emails`

**Метод:** POST

**Заголовки:**
```
Authorization: Bearer {RESEND_API_KEY}
Content-Type: application/json
```

**Тело запроса:**
```json
{
  "from": "Fitness App <noreply@yourdomain.com>",
  "to": "user@example.com",
  "subject": "Subject",
  "html": "<html>...</html>",
  "text": "Plain text"
}
```

**Шаблоны:**
- `coach_note_notification` — уведомление о заметке тренера
- `subscription_expiring` — уведомление об истекающей подписке
- `subscription_expired` — уведомление об истекшей подписке
- `reminder_data_entry` — напоминание о вводе данных

---

### Open Food Facts API

**Описание:** База продуктов для автозаполнения

**Endpoint:** `https://world.openfoodfacts.org/cgi/search.pl`

**Метод:** GET

**Параметры:**
- `search_terms` — поисковый запрос
- `page_size` — количество результатов
- `json` — формат ответа

**Пример:**
```
GET https://world.openfoodfacts.org/cgi/search.pl?search_terms=молоко&page_size=10&json=1
```

**Ответ:**
```json
{
  "products": [
    {
      "product_name": "Молоко",
      "nutriments": {
        "energy-kcal_100g": 64,
        "proteins_100g": 3.2,
        "fat_100g": 3.2,
        "carbohydrates_100g": 4.7
      }
    }
  ]
}
```

---

### OpenRouter API

**Описание:** OCR распознавание через AI модели

**Endpoint:** `https://openrouter.ai/api/v1/chat/completions`

**Метод:** POST

**Заголовки:**
```
Authorization: Bearer {OPENROUTER_API_KEY}
Content-Type: application/json
```

**Тело запроса:**
```json
{
  "model": "lighton/lightonocr-1b",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,..."
          }
        },
        {
          "type": "text",
          "text": "Extract nutrition information from this product label"
        }
      ]
    }
  ]
}
```

**Поддерживаемые модели:**
- `lighton/lightonocr-1b`
- `deepseek/deepseek-ocr`
- `paddleocr/paddleocr-vl`
- `qwen/qwen-2-vl-7b-instruct`
- `google/gemma-2-27b-it`

---

## Supabase Realtime

### Подписка на сообщения

**Описание:** Real-time обновления для чата

**Использование:**
```typescript
const channel = supabase
  .channel('messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `sender_id=eq.${userId} OR receiver_id=eq.${userId}`
  }, (payload) => {
    // Обработка нового сообщения
  })
  .subscribe()
```

---

## Аутентификация

### Supabase Auth

**Методы:**
```typescript
// Регистрация
supabase.auth.signUp({ email, password })

// Авторизация
supabase.auth.signInWithPassword({ email, password })

// Выход
supabase.auth.signOut()

// Получение текущего пользователя
supabase.auth.getUser()
```

**JWT токены:**
- Автоматическое управление через Supabase
- Обновление токенов
- Хранение в cookies

---

## Обработка ошибок

### Стандартные коды ошибок

- `400` — Неверный запрос
- `401` — Не авторизован
- `403` — Нет прав доступа
- `404` — Ресурс не найден
- `500` — Ошибка сервера

### Формат ошибок

```json
{
  "error": "Error message",
  "details": {
    "field": "Additional information"
  }
}
```

---

## Rate Limiting

### Ограничения

- **Supabase:** Зависит от плана
- **Resend:** 100 emails/день (free plan)
- **OpenRouter:** Зависит от плана
- **Open Food Facts:** Нет ограничений

---

## Связанные документы

- [Technical_Architecture.md](./Technical_Architecture.md) - Техническая архитектура
- [Database_Schema.md](./Database_Schema.md) - Схема базы данных
- [Implementation_Guide.md](./Implementation_Guide.md) - Руководство по реализации

---

**Последнее обновление:** Январь 2025  
**Версия документа:** 1.0
