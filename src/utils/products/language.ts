/**
 * Language utilities for product search
 *
 * Handles Russian-to-English translation and transliteration for FatSecret API.
 * Required because Cyrillic support is only available in Premium subscription.
 */

import { logger } from '@/utils/logger'

/**
 * Transliteration map: Cyrillic to Latin
 */
const TRANSLITERATION_MAP: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
    'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
    'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
    'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
    'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch',
    'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '',
    'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D',
    'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z', 'И': 'I',
    'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N',
    'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T',
    'У': 'U', 'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch',
    'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '', 'Ы': 'Y', 'Ь': '',
    'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
}

/**
 * Dictionary of common Russian food terms to English
 * Prioritized by popularity in Russian cuisine
 */
const FOOD_DICTIONARY: Record<string, string> = {
    // Dairy products
    'молоко': 'milk',
    'кефир': 'kefir',
    'йогурт': 'yogurt',
    'творог': 'cottage cheese',
    'сметана': 'sour cream',
    'сыр': 'cheese',
    'масло': 'butter',
    'сливки': 'cream',

    // Meat & Fish
    'курица': 'chicken',
    'говядина': 'beef',
    'свинина': 'pork',
    'рыба': 'fish',
    'лосось': 'salmon',
    'тунец': 'tuna',
    'индейка': 'turkey',
    'баранина': 'lamb',
    'колбаса': 'sausage',

    // Grains & Bread
    'хлеб': 'bread',
    'рис': 'rice',
    'гречка': 'buckwheat',
    'овсянка': 'oatmeal',
    'макароны': 'pasta',
    'каша': 'porridge',
    'мука': 'flour',

    // Vegetables
    'картофель': 'potato',
    'картошка': 'potato',
    'помидор': 'tomato',
    'огурец': 'cucumber',
    'морковь': 'carrot',
    'капуста': 'cabbage',
    'лук': 'onion',
    'чеснок': 'garlic',
    'перец': 'pepper',
    'свекла': 'beet',

    // Fruits
    'яблоко': 'apple',
    'банан': 'banana',
    'апельсин': 'orange',
    'груша': 'pear',
    'виноград': 'grape',
    'клубника': 'strawberry',
    'арбуз': 'watermelon',

    // Common dishes
    'борщ': 'borscht',
    'щи': 'shchi',
    'пельмени': 'dumplings',
    'блины': 'pancakes',
    'оладьи': 'pancakes',
    'котлета': 'cutlet',
    'салат': 'salad',
    'суп': 'soup',

    // Beverages
    'чай': 'tea',
    'кофе': 'coffee',
    'сок': 'juice',
    'вода': 'water',
    'квас': 'kvass',

    // Other
    'яйцо': 'egg',
    'яйца': 'eggs',
    'сахар': 'sugar',
    'соль': 'salt',
    'мед': 'honey',
    'орех': 'nut',
    'орехи': 'nuts',
    'шоколад': 'chocolate'
}

/**
 * Check if text contains Cyrillic characters
 */
export function isCyrillic(text: string): boolean {
    return /[а-яА-ЯёЁ]/.test(text)
}

/**
 * Transliterate Cyrillic text to Latin
 *
 * @param text - Text to transliterate
 * @returns Transliterated text
 *
 * @example
 * transliterate('молоко') // 'moloko'
 * transliterate('курица') // 'kuritsa'
 */
export function transliterate(text: string): string {
    return text
        .split('')
        .map(char => TRANSLITERATION_MAP[char] || char)
        .join('')
}

/**
 * Translate Russian food term to English using dictionary
 *
 * @param text - Russian text to translate
 * @returns English translation or null if not found
 *
 * @example
 * translateFood('молоко') // 'milk'
 * translateFood('курица') // 'chicken'
 */
export function translateFood(text: string): string | null {
    const normalized = text.toLowerCase().trim()

    // Direct match
    if (FOOD_DICTIONARY[normalized]) {
        return FOOD_DICTIONARY[normalized]
    }

    // Try to find partial match (for compound words)
    for (const [russian, english] of Object.entries(FOOD_DICTIONARY)) {
        if (normalized.includes(russian)) {
            return english
        }
    }

    return null
}

/**
 * Generate search query variants for FatSecret API
 *
 * Creates multiple search strategies:
 * 1. Original query (for English/Latin text)
 * 2. Dictionary translation (for known Russian terms)
 * 3. Transliteration (for unknown Russian terms)
 *
 * @param query - Original search query
 * @returns Array of query variants to try, ordered by priority
 *
 * @example
 * getSearchVariants('молоко') // ['milk', 'moloko']
 * getSearchVariants('chicken') // ['chicken']
 * getSearchVariants('оладьи') // ['pancakes', 'oladi']
 */
export function getSearchVariants(query: string): string[] {
    const variants: string[] = []
    const normalized = query.trim()

    // If query is already in Latin, use as-is
    if (!isCyrillic(normalized)) {
        logger.debug('Language: query is already in Latin', {
            query: normalized,
            context: 'language-utils'
        })
        return [normalized]
    }

    logger.debug('Language: detected Cyrillic query, generating variants', {
        query: normalized,
        context: 'language-utils'
    })

    // Strategy 1: Try dictionary translation (highest priority)
    const translation = translateFood(normalized)
    if (translation) {
        variants.push(translation)
        logger.debug('Language: found dictionary translation', {
            original: normalized,
            translation,
            context: 'language-utils'
        })
    }

    // Strategy 2: Transliteration (fallback)
    const transliterated = transliterate(normalized)
    if (transliterated !== normalized) {
        variants.push(transliterated)
        logger.debug('Language: generated transliteration', {
            original: normalized,
            transliterated,
            context: 'language-utils'
        })
    }

    // If no variants generated, return original (shouldn't happen for Cyrillic)
    if (variants.length === 0) {
        logger.warn('Language: no variants generated for Cyrillic query', {
            query: normalized,
            context: 'language-utils'
        })
        variants.push(normalized)
    }

    logger.info('Language: generated search variants', {
        original: normalized,
        variants,
        variantsCount: variants.length,
        context: 'language-utils'
    })

    return variants
}
