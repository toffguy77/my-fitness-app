/**
 * Tests for dashboard validation utilities
 */

import {
    validateWeight,
    validateSteps,
    validateCalories,
    validatePhoto,
    type ValidationResult,
} from '../validation'

describe('Dashboard Validation Utilities', () => {
    describe('validateWeight', () => {
        describe('valid inputs', () => {
            it('accepts valid weight with no decimals', () => {
                const result = validateWeight(75)
                expect(result.isValid).toBe(true)
                expect(result.error).toBeUndefined()
            })

            it('accepts valid weight with 1 decimal place', () => {
                const result = validateWeight(75.5)
                expect(result.isValid).toBe(true)
                expect(result.error).toBeUndefined()
            })

            it('accepts minimum valid weight', () => {
                const result = validateWeight(0.1)
                expect(result.isValid).toBe(true)
            })

            it('accepts maximum valid weight', () => {
                const result = validateWeight(500)
                expect(result.isValid).toBe(true)
            })
        })

        describe('invalid inputs', () => {
            it('rejects non-number input', () => {
                const result = validateWeight('75')
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Вес должен быть числом')
            })

            it('rejects NaN', () => {
                const result = validateWeight(NaN)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Вес должен быть корректным числом')
            })

            it('rejects zero weight', () => {
                const result = validateWeight(0)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Вес должен быть положительным')
            })

            it('rejects negative weight', () => {
                const result = validateWeight(-10)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Вес должен быть положительным')
            })

            it('rejects weight exceeding maximum', () => {
                const result = validateWeight(501)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Вес должен быть не более 500 кг')
            })

            it('rejects weight with more than 1 decimal place', () => {
                const result = validateWeight(75.55)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Вес может иметь не более 1 знака после запятой')
            })

            it('rejects null', () => {
                const result = validateWeight(null)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Вес должен быть числом')
            })

            it('rejects undefined', () => {
                const result = validateWeight(undefined)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Вес должен быть числом')
            })

            it('rejects object', () => {
                const result = validateWeight({})
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Вес должен быть числом')
            })

            it('rejects array', () => {
                const result = validateWeight([75])
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Вес должен быть числом')
            })
        })
    })

    describe('validateSteps', () => {
        describe('valid inputs', () => {
            it('accepts valid step count', () => {
                const result = validateSteps(10000)
                expect(result.isValid).toBe(true)
                expect(result.error).toBeUndefined()
            })

            it('accepts zero steps', () => {
                const result = validateSteps(0)
                expect(result.isValid).toBe(true)
            })

            it('accepts maximum valid steps', () => {
                const result = validateSteps(100000)
                expect(result.isValid).toBe(true)
            })

            it('accepts single step', () => {
                const result = validateSteps(1)
                expect(result.isValid).toBe(true)
            })
        })

        describe('invalid inputs', () => {
            it('rejects non-number input', () => {
                const result = validateSteps('10000')
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Шаги должны быть числом')
            })

            it('rejects NaN', () => {
                const result = validateSteps(NaN)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Шаги должны быть корректным числом')
            })

            it('rejects negative steps', () => {
                const result = validateSteps(-100)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Шаги не могут быть отрицательными')
            })

            it('rejects decimal steps', () => {
                const result = validateSteps(10000.5)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Шаги должны быть целым числом')
            })

            it('rejects steps exceeding maximum', () => {
                const result = validateSteps(100001)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Шаги должны быть не более 100,000')
            })

            it('rejects null', () => {
                const result = validateSteps(null)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Шаги должны быть числом')
            })

            it('rejects undefined', () => {
                const result = validateSteps(undefined)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Шаги должны быть числом')
            })
        })
    })

    describe('validateCalories', () => {
        describe('valid inputs', () => {
            it('accepts valid calorie count', () => {
                const result = validateCalories(2000)
                expect(result.isValid).toBe(true)
                expect(result.error).toBeUndefined()
            })

            it('accepts zero calories', () => {
                const result = validateCalories(0)
                expect(result.isValid).toBe(true)
            })

            it('accepts decimal calories', () => {
                const result = validateCalories(2000.5)
                expect(result.isValid).toBe(true)
            })

            it('accepts maximum valid calories', () => {
                const result = validateCalories(10000)
                expect(result.isValid).toBe(true)
            })

            it('accepts small calorie values', () => {
                const result = validateCalories(0.1)
                expect(result.isValid).toBe(true)
            })
        })

        describe('invalid inputs', () => {
            it('rejects non-number input', () => {
                const result = validateCalories('2000')
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Калории должны быть числом')
            })

            it('rejects NaN', () => {
                const result = validateCalories(NaN)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Калории должны быть корректным числом')
            })

            it('rejects negative calories', () => {
                const result = validateCalories(-100)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Калории не могут быть отрицательными')
            })

            it('rejects calories exceeding maximum', () => {
                const result = validateCalories(10001)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Калории должны быть не более 10,000')
            })

            it('rejects null', () => {
                const result = validateCalories(null)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Калории должны быть числом')
            })

            it('rejects undefined', () => {
                const result = validateCalories(undefined)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Калории должны быть числом')
            })
        })
    })

    describe('validatePhoto', () => {
        describe('valid inputs', () => {
            it('accepts valid JPEG file', () => {
                const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(true)
                expect(result.error).toBeUndefined()
            })

            it('accepts valid PNG file', () => {
                const file = new File(['content'], 'photo.png', { type: 'image/png' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(true)
            })

            it('accepts valid WebP file', () => {
                const file = new File(['content'], 'photo.webp', { type: 'image/webp' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(true)
            })

            it('accepts file at maximum size', () => {
                const content = new Array(10 * 1024 * 1024).fill('a').join('')
                const file = new File([content], 'photo.jpg', { type: 'image/jpeg' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(true)
            })

            it('accepts small file', () => {
                const file = new File(['small'], 'photo.jpg', { type: 'image/jpeg' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(true)
            })
        })

        describe('invalid inputs', () => {
            it('rejects unsupported file type', () => {
                const file = new File(['content'], 'photo.gif', { type: 'image/gif' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Фото должно быть в формате JPEG, PNG или WebP')
            })

            it('rejects PDF file', () => {
                const file = new File(['content'], 'document.pdf', { type: 'application/pdf' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Фото должно быть в формате JPEG, PNG или WebP')
            })

            it('rejects file exceeding maximum size', () => {
                const content = new Array(11 * 1024 * 1024).fill('a').join('')
                const file = new File([content], 'photo.jpg', { type: 'image/jpeg' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Фото должно быть не более 10 МБ')
            })

            it('rejects empty file', () => {
                const file = new File([], 'photo.jpg', { type: 'image/jpeg' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Файл фото пустой')
            })

            it('rejects text file with image extension', () => {
                const file = new File(['content'], 'photo.jpg', { type: 'text/plain' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(false)
                expect(result.error).toBe('Фото должно быть в формате JPEG, PNG или WebP')
            })
        })

        describe('edge cases', () => {
            it('handles file with uppercase extension', () => {
                const file = new File(['content'], 'PHOTO.JPG', { type: 'image/jpeg' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(true)
            })

            it('handles file with no extension', () => {
                const file = new File(['content'], 'photo', { type: 'image/jpeg' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(true)
            })

            it('validates based on MIME type, not extension', () => {
                const file = new File(['content'], 'photo.txt', { type: 'image/jpeg' })
                const result = validatePhoto(file)
                expect(result.isValid).toBe(true)
            })
        })
    })

    describe('ValidationResult type', () => {
        it('returns correct structure for valid input', () => {
            const result: ValidationResult = validateWeight(75)
            expect(result).toHaveProperty('isValid')
            expect(typeof result.isValid).toBe('boolean')
            expect(result.error).toBeUndefined()
        })

        it('returns correct structure for invalid input', () => {
            const result: ValidationResult = validateWeight(-10)
            expect(result).toHaveProperty('isValid')
            expect(result).toHaveProperty('error')
            expect(typeof result.isValid).toBe('boolean')
            expect(typeof result.error).toBe('string')
        })
    })
})
