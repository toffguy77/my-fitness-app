# FatSecret Multi-Strategy Search Implementation

## Проблема

FatSecret API базовая подписка не поддерживает кириллицу. Запросы типа "оладьи", "молоко" возвращали пустые результаты, что приводило к постоянному fallback на OpenFoodFacts.

## Решение

Реализован multi-strategy подход для русскоязычных запросов:

### 1. Dictionary Translation (Приоритет 1)
- Словарь ~100 популярных продуктов
- `молоко` → `milk`
- `курица` → `chicken`
- `оладьи` → `pancakes`

### 2. Transliteration (Приоритет 2)
- Транслитерация кириллицы в латиницу
- `гречка` → `grechka`
- `борщ` → `borsch`

### 3. Sequential Search
- Пробует каждый вариант последовательно
- Возвращает первый успешный результат
- Fallback на OpenFoodFacts только если все варианты не дали результатов

## Файлы

### Новые
- `src/utils/products/language.ts` - утилиты перевода/транслитерации
- `src/__tests__/language-utils.test.ts` - тесты
- `docs/FatSecret_Localization.md` - документация

### Изменённые
- `src/config/fatsecret.ts` - добавлены region/language параметры
- `src/utils/products/fatsecret.ts` - multi-strategy search
- `.env.local` - FATSECRET_REGION=US, FATSECRET_LANGUAGE=en
- `env.example` - обновлена документация

## Конфигурация

```bash
# .env.local
FATSECRET_REGION=US      # US для базовой подписки
FATSECRET_LANGUAGE=en    # English
```

**Note**: `region=RU` и `language=ru` требуют Premium подписку

## Примеры работы

### Запрос: "молоко"
```
1. Определяет кириллицу
2. Генерирует варианты: ['milk', 'moloko']
3. Ищет 'milk' → Успех! ✓
4. Возвращает результаты
```

### Запрос: "оладьи"
```
1. Определяет кириллицу
2. Генерирует варианты: ['pancakes', 'oladi']
3. Ищет 'pancakes' → Успех! ✓
4. Возвращает результаты
```

### Запрос: "chicken"
```
1. Латиница - используется как есть
2. Ищет 'chicken' → Успех! ✓
3. Возвращает результаты
```

## Логирование

Система логирует каждый шаг:

```
[DEBUG] Language: detected Cyrillic query
[DEBUG] Language: found dictionary translation: молоко → milk
[DEBUG] FatSecret: trying search variant: milk (1/2)
[INFO] FatSecret: foods found successfully (used translation)
```

## Метрики

Отслеживаются через существующую систему метрик:
- `fatsecret_api_calls_total` - количество запросов
- `fatsecret_fallback_activations_total` - активации fallback
- Ожидаемое снижение fallback: с ~100% до <10%

## Тестирование

```bash
# Запустить тесты
npm test language-utils.test.ts

# Запустить dev сервер
npm run dev

# Попробовать поиск:
# - молоко
# - курица  
# - оладьи
# - гречка
```

## Будущее: Premium Upgrade

При переходе на Premium:

1. Обновить `.env.local`:
```bash
FATSECRET_REGION=RU
FATSECRET_LANGUAGE=ru
```

2. Система автоматически будет использовать нативную кириллицу
3. Multi-strategy останется как fallback для неизвестных терминов

## Преимущества

✅ Работает с базовой подпиской FatSecret  
✅ Высокий процент успешных запросов для популярных продуктов  
✅ Автоматический fallback для неизвестных терминов  
✅ Снижение нагрузки на OpenFoodFacts API  
✅ Детальное логирование для отладки  
✅ Готовность к Premium upgrade  

## Ограничения

- Словарь покрывает ~100 популярных продуктов
- Неизвестные термины используют транслитерацию (менее точно)
- Для полной поддержки кириллицы нужна Premium подписка
