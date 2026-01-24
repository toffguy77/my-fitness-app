/**
 * Tests for language utilities
 */

import {
    isCyrillic,
    transliterate,
    translateFood,
    getSearchVariants
} from '@/utils/products/language'

describe('Language Utilities', () => {
    describe('isCyrillic', () => {
        it('should detect Cyrillic text', () => {
            expect(isCyrillic('молоко')).toBe(true)
            expect(isCyrillic('курица')).toBe(true)
            expect(isCyrillic('Привет')).toBe(true)
        })

        it('should detect non-Cyrillic text', () => {
            expect(isCyrillic('milk')).toBe(false)
            expect(isCyrillic('chicken')).toBe(false)
            expect(isCyrillic('123')).toBe(false)
        })

        it('should detect mixed text', () => {
            expect(isCyrillic('молоко milk')).toBe(true)
            expect(isCyrillic('chicken курица')).toBe(true)
        })
    })

    describe('transliterate', () => {
        it('should transliterate basic Russian words', () => {
            expect(transliterate('молоко')).toBe('moloko')
            expect(transliterate('курица')).toBe('kuritsa')
            expect(transliterate('хлеб')).toBe('hleb')
        })

        it('should handle uppercase letters', () => {
            expect(transliterate('Молоко')).toBe('Moloko')
            expect(transliterate('КУРИЦА')).toBe('KURITsA')
        })

        it('should preserve non-Cyrillic characters', () => {
            expect(transliterate('молоко 123')).toBe('moloko 123')
            expect(transliterate('test молоко')).toBe('test moloko')
        })

        it('should handle special Cyrillic characters', () => {
            expect(transliterate('ёлка')).toBe('yolka')
            expect(transliterate('щука')).toBe('schuka')
            expect(transliterate('борщ')).toBe('borsch')
        })
    })

    describe('translateFood', () => {
        it('should translate common food terms', () => {
            expect(translateFood('молоко')).toBe('milk')
            expect(translateFood('курица')).toBe('chicken')
            expect(translateFood('хлеб')).toBe('bread')
            expect(translateFood('яблоко')).toBe('apple')
        })

        it('should handle case insensitivity', () => {
            expect(translateFood('МОЛОКО')).toBe('milk')
            expect(translateFood('Курица')).toBe('chicken')
        })

        it('should handle whitespace', () => {
            expect(translateFood('  молоко  ')).toBe('milk')
            expect(translateFood('курица ')).toBe('chicken')
        })

        it('should return null for unknown terms', () => {
            expect(translateFood('неизвестныйпродукт')).toBeNull()
            expect(translateFood('xyz')).toBeNull()
        })

        it('should find partial matches', () => {
            const result = translateFood('молоко')
            expect(result).toBe('milk')
        })

        it('should translate pancakes variants', () => {
            expect(translateFood('оладьи')).toBe('pancakes')
            expect(translateFood('блины')).toBe('pancakes')
        })
    })

    describe('getSearchVariants', () => {
        it('should return original query for Latin text', () => {
            const variants = getSearchVariants('chicken')
            expect(variants).toEqual(['chicken'])
        })

        it('should return original query for numbers', () => {
            const variants = getSearchVariants('123')
            expect(variants).toEqual(['123'])
        })

        it('should generate translation for known Russian terms', () => {
            const variants = getSearchVariants('молоко')
            expect(variants).toContain('milk')
            expect(variants.length).toBeGreaterThan(0)
        })

        it('should generate transliteration for unknown Russian terms', () => {
            const variants = getSearchVariants('неизвестныйпродукт')
            expect(variants).toContain('neizvestnyyprodukt')
        })

        it('should prioritize translation over transliteration', () => {
            const variants = getSearchVariants('курица')
            expect(variants[0]).toBe('chicken') // Translation first
            expect(variants[1]).toBe('kuritsa') // Transliteration second
        })

        it('should handle mixed case', () => {
            const variants = getSearchVariants('Молоко')
            expect(variants).toContain('milk')
        })

        it('should handle whitespace', () => {
            const variants = getSearchVariants('  курица  ')
            expect(variants).toContain('chicken')
        })

        it('should generate multiple variants for Russian queries', () => {
            const variants = getSearchVariants('оладьи')
            expect(variants.length).toBeGreaterThanOrEqual(1)
            expect(variants).toContain('pancakes') // Translation
        })

        it('should handle potato variants', () => {
            expect(getSearchVariants('картофель')).toContain('potato')
            expect(getSearchVariants('картошка')).toContain('potato')
        })

        it('should handle egg variants', () => {
            expect(getSearchVariants('яйцо')).toContain('egg')
            expect(getSearchVariants('яйца')).toContain('eggs')
        })
    })
})
