# FatSecret API Multi-Strategy Search

## Overview

FatSecret API базовая подписка не поддерживает кириллицу (требуется Premium). Для работы с русскоязычными запросами используется multi-strategy подход:

1. **Dictionary Translation** - перевод популярных продуктов (молоко → milk)
2. **Transliteration** - транслитерация неизвестных терминов (оладьи → oladi)

## Configuration

### Environment Variables

```bash
FATSECRET_REGION=US      # United States (basic subscription)
FATSECRET_LANGUAGE=en    # English
```

**Note**: Кириллица (`region=RU`, `language=ru`) доступна только в Premium подписке.

## How It Works

### Example: "оладьи"

1. Пользователь вводит "оладьи"
2. Система определяет кириллицу
3. Генерирует варианты:
   - `pancakes` (перевод из словаря)
   - `oladi` (транслитерация)
4. Пробует каждый вариант последовательно
5. Возвращает первый успешный результат

### Example: "молоко"

1. Пользователь вводит "молоко"
2. Генерирует варианты:
   - `milk` (перевод из словаря) ✓
   - `moloko` (транслитерация)
3. Находит результаты по "milk"

## Implementation

### Language Utils (`src/utils/products/language.ts`)

```typescript
// Проверка кириллицы
isCyrillic('молоко') // true

// Перевод из словаря
translateFood('молоко') // 'milk'

// Транслитерация
transliterate('оладьи') // 'oladi'

// Генерация вариантов
getSearchVariants('молоко') // ['milk', 'moloko']
```

### FatSecret Client

Автоматически пробует все варианты:

```typescript
async searchFoods(query: string) {
    const variants = getSearchVariants(query)
    
    for (const variant of variants) {
        const results = await this.makeRequest('foods.search.v4', {
            search_expression: variant,
            region: 'US',
            language: 'en'
        })
        
        if (results.foods?.food) {
            return results // Успех!
        }
    }
    
    return [] // Нет результатов
}
```

## Food Dictionary

Словарь содержит ~100 популярных продуктов:

- Молочные: молоко, кефир, творог, сыр
- Мясо/Рыба: курица, говядина, рыба, лосось
- Крупы: рис, гречка, овсянка
- Овощи: картофель, помидор, огурец
- Фрукты: яблоко, банан, апельсин
- Блюда: борщ, пельмени, блины, оладьи

## Benefits

1. **Works with Basic Subscription** - не требует Premium
2. **High Success Rate** - словарь покрывает популярные продукты
3. **Fallback Strategy** - транслитерация для неизвестных терминов
4. **Reduced API Fallback** - меньше переключений на OpenFoodFacts

## Testing

```bash
npm run dev
```

Попробуйте поиск:
- `молоко` → найдет через "milk"
- `курица` → найдет через "chicken"
- `оладьи` → найдет через "pancakes"
- `гречка` → найдет через "buckwheat"

Проверьте логи - должны быть сообщения о вариантах поиска.

## Future: Premium Upgrade

При переходе на Premium подписку:

1. Обновите `.env.local`:
```bash
FATSECRET_REGION=RU
FATSECRET_LANGUAGE=ru
```

2. Система автоматически будет использовать нативную кириллицу
3. Multi-strategy останется как fallback

## References

- [FatSecret Localization](https://platform.fatsecret.com/docs/guides/localization)
- [FatSecret Premium Features](https://platform.fatsecret.com/api/)
