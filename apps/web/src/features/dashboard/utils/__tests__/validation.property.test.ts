/**
 * Property-based tests for dashboard validation utilities
 * Feature: dashboard
 *
 * These tests validate universal properties that should hold for all inputs
 */

import fc from 'fast-check'
import {
    validateWeight,
    validateSteps,
    validateCalories,
    validatePhoto,
    validateWeeklyReport,
} from '../validation'

describe('Dashboard Validation - Property-Based Tests', () => {
    /**
     * Property 8: Weight Input Validation
     *
     * For any input, the weight validation should:
     * - Accept valid weights (positive numbers with ≤1 decimal, ≤500kg)
     * - Reject invalid inputs (negative, non-numeric, >500kg, >1 decimal place)
     * - Provide appropriate error messages
     *
     * Validates: Requirements 3.3, 3.7
     */
    describe('Property 8: Weight Input Validation', () => {
        it('Feature: dashboard, Property 8: accepts all valid weight values', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: Math.fround(0.1), max: Math.fround(500), noNaN: true })
                        .filter(n => {
                            // Only allow up to 1 decimal place
                            const decimalPlaces = (n.toString().split('.')[1] || '').length
                            return decimalPlaces <= 1
                        }),
                    (weight) => {
                        const result = validateWeight(weight)
                        expect(result.isValid).toBe(true)
                        expect(result.error).toBeUndefined()
                        return result.isValid === true
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 8: rejects negative weights', () => {
            fc.assert(
                fc.property(
                    fc.double({ max: Math.fround(0), noNaN: true }),
                    (weight) => {
                        const result = validateWeight(weight)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        expect(result.error).toContain('положительным')
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 8: rejects weights exceeding maximum', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: Math.fround(500.1), max: Math.fround(10000), noNaN: true }),
                    (weight) => {
                        const result = validateWeight(weight)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        expect(result.error).toContain('500')
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 8: rejects weights with more than 1 decimal place', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: Math.fround(0.1), max: Math.fround(500), noNaN: true })
                        .filter(n => {
                            const decimalPlaces = (n.toString().split('.')[1] || '').length
                            return decimalPlaces > 1
                        }),
                    (weight) => {
                        const result = validateWeight(weight)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        expect(result.error).toContain('запятой')
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 8: rejects non-numeric inputs', () => {
            fc.assert(
                fc.property(
                    fc.oneof(
                        fc.string(),
                        fc.constant(null),
                        fc.constant(undefined),
                        fc.object(),
                        fc.array(fc.anything())
                    ),
                    (input) => {
                        const result = validateWeight(input)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 8: rejects NaN', () => {
            const result = validateWeight(NaN)
            expect(result.isValid).toBe(false)
            expect(result.error).toBeDefined()
            expect(result.error).toContain('корректным')
        })

        it('Feature: dashboard, Property 8: always returns ValidationResult structure', () => {
            fc.assert(
                fc.property(
                    fc.anything(),
                    (input) => {
                        const result = validateWeight(input)
                        expect(result).toHaveProperty('isValid')
                        expect(typeof result.isValid).toBe('boolean')
                        if (!result.isValid) {
                            expect(result).toHaveProperty('error')
                            expect(typeof result.error).toBe('string')
                        }
                        return true
                    }
                ),
                { numRuns: 20 }
            )
        })
    })

    /**
     * Property 10: Steps Input Validation
     *
     * For any input, the steps validation should:
     * - Accept valid step counts (non-negative integers ≤100,000)
     * - Reject invalid inputs (negative, non-integer, >100,000)
     * - Provide appropriate error messages
     *
     * Validates: Requirements 4.4
     */
    describe('Property 10: Steps Input Validation', () => {
        it('Feature: dashboard, Property 10: accepts all valid step counts', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 100000 }),
                    (steps) => {
                        const result = validateSteps(steps)
                        expect(result.isValid).toBe(true)
                        expect(result.error).toBeUndefined()
                        return result.isValid === true
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 10: rejects negative step counts', () => {
            fc.assert(
                fc.property(
                    fc.integer({ max: -1 }),
                    (steps) => {
                        const result = validateSteps(steps)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        expect(result.error).toContain('отрицательными')
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 10: rejects step counts exceeding maximum', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 100001, max: 1000000 }),
                    (steps) => {
                        const result = validateSteps(steps)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        expect(result.error).toContain('100,000')
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 10: rejects non-integer step counts', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: Math.fround(0), max: Math.fround(100000), noNaN: true })
                        .filter(n => !Number.isInteger(n)),
                    (steps) => {
                        const result = validateSteps(steps)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        expect(result.error).toContain('целым')
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 10: rejects non-numeric inputs', () => {
            fc.assert(
                fc.property(
                    fc.oneof(
                        fc.string(),
                        fc.constant(null),
                        fc.constant(undefined),
                        fc.object(),
                        fc.array(fc.anything())
                    ),
                    (input) => {
                        const result = validateSteps(input)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 10: rejects NaN', () => {
            const result = validateSteps(NaN)
            expect(result.isValid).toBe(false)
            expect(result.error).toBeDefined()
            expect(result.error).toContain('корректным')
        })

        it('Feature: dashboard, Property 10: always returns ValidationResult structure', () => {
            fc.assert(
                fc.property(
                    fc.anything(),
                    (input) => {
                        const result = validateSteps(input)
                        expect(result).toHaveProperty('isValid')
                        expect(typeof result.isValid).toBe('boolean')
                        if (!result.isValid) {
                            expect(result).toHaveProperty('error')
                            expect(typeof result.error).toBe('string')
                        }
                        return true
                    }
                ),
                { numRuns: 20 }
            )
        })
    })

    /**
     * Additional property test for calories validation
     * Validates: Requirements 3.3, 3.7, 4.4
     */
    describe('Calories Input Validation Properties', () => {
        it('accepts all valid calorie values', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    (calories) => {
                        const result = validateCalories(calories)
                        expect(result.isValid).toBe(true)
                        expect(result.error).toBeUndefined()
                        return result.isValid === true
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('rejects negative calorie values', () => {
            fc.assert(
                fc.property(
                    fc.double({ max: Math.fround(-0.01), noNaN: true }),
                    (calories) => {
                        const result = validateCalories(calories)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        expect(result.error).toContain('отрицательными')
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('rejects calorie values exceeding maximum', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: Math.fround(10000.1), max: Math.fround(100000), noNaN: true }),
                    (calories) => {
                        const result = validateCalories(calories)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        expect(result.error).toContain('10,000')
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })
    })

    /**
     * Additional property test for photo validation
     * Validates: Requirements 7.3
     */
    describe('Photo File Validation Properties', () => {
        it('accepts all valid image files within size limit', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('image/jpeg', 'image/png', 'image/webp'),
                    fc.integer({ min: 1, max: 1 * 1024 * 1024 }), // 1 byte to 1 MB (reduced)
                    (mimeType, fileSize) => {
                        const content = new Array(fileSize).fill('a').join('')
                        const file = new File([content], 'photo.jpg', { type: mimeType })
                        const result = validatePhoto(file)
                        expect(result.isValid).toBe(true)
                        expect(result.error).toBeUndefined()
                        return result.isValid === true
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('rejects files exceeding size limit', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('image/jpeg', 'image/png', 'image/webp'),
                    fc.integer({ min: 10 * 1024 * 1024 + 1, max: 11 * 1024 * 1024 }), // > 10 MB (narrower range)
                    (mimeType, fileSize) => {
                        const content = new Array(fileSize).fill('a').join('')
                        const file = new File([content], 'photo.jpg', { type: mimeType })
                        const result = validatePhoto(file)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        expect(result.error).toContain('10 МБ')
                        return result.isValid === false
                    }
                ),
                { numRuns: 5 }
            )
        })

        it('rejects unsupported file types', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom(
                        'image/gif',
                        'image/bmp',
                        'image/svg+xml',
                        'application/pdf',
                        'text/plain',
                        'video/mp4'
                    ),
                    (mimeType) => {
                        const file = new File(['content'], 'file.ext', { type: mimeType })
                        const result = validatePhoto(file)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        expect(result.error).toContain('JPEG, PNG или WebP')
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('rejects empty files', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('image/jpeg', 'image/png', 'image/webp'),
                    (mimeType) => {
                        const file = new File([], 'photo.jpg', { type: mimeType })
                        const result = validatePhoto(file)
                        expect(result.isValid).toBe(false)
                        expect(result.error).toBeDefined()
                        expect(result.error).toContain('пустой')
                        return result.isValid === false
                    }
                ),
                { numRuns: 20 }
            )
        })
    })
})

/**
 * Property 20: Weekly Report Validation
 *
 * For any week's data, the weekly report submission should:
 * - Validate that required data exists (nutrition ≥5 days, weight ≥5 days, photo uploaded)
 * - Reject submission with specific error messages if requirements are not met
 * - Accept submission when all requirements are met
 *
 * Validates: Requirements 10.2, 10.3
 */
describe('Property 20: Weekly Report Validation', () => {
    // Generator for daily data with varying completeness
    const dailyDataGenerator = fc.record({
        date: fc.integer({ min: 1, max: 7 }).map(day => `2024-01-0${day}`),
        nutrition: fc.record({
            calories: fc.integer({ min: 0, max: 3000 })
        }),
        weight: fc.option(fc.double({ min: 40, max: 200, noNaN: true }), { nil: null })
    })

    // Generator for week data (7 days)
    const weekDataGenerator = fc.array(dailyDataGenerator, { minLength: 7, maxLength: 7 })

    it('Feature: dashboard, Property 20: accepts valid week data with all requirements met', () => {
        fc.assert(
            fc.property(
                // Generate week data with at least 5 days of nutrition and weight
                fc.tuple(
                    fc.array(dailyDataGenerator, { minLength: 5, maxLength: 7 }).map(days =>
                        days.map(day => ({
                            ...day,
                            nutrition: { calories: fc.sample(fc.integer({ min: 1, max: 3000 }), 1)[0] },
                            weight: fc.sample(fc.double({ min: 40, max: 200, noNaN: true }), 1)[0]
                        }))
                    ),
                    fc.constant(true) // has photo
                ).map(([validDays, hasPhoto]) => {
                    // Pad to 7 days if needed
                    while (validDays.length < 7) {
                        validDays.push({
                            date: `2024-01-0${validDays.length + 1}`,
                            nutrition: { calories: 0 },
                            weight: 0 // Use 0 instead of null for type compatibility
                        })
                    }
                    return { weekData: validDays, hasPhoto }
                }),
                ({ weekData, hasPhoto }) => {
                    const result = validateWeeklyReport(weekData, hasPhoto)

                    // Count actual valid days
                    const nutritionDays = weekData.filter(d => d.nutrition.calories > 0).length
                    const weightDays = weekData.filter(d => d.weight !== null && d.weight > 0).length

                    if (nutritionDays >= 5 && weightDays >= 5 && hasPhoto) {
                        expect(result.isValid).toBe(true)
                        expect(result.errors).toHaveLength(0)
                        expect(result.missingItems.nutrition).toBe(0)
                        expect(result.missingItems.weight).toBe(0)
                        expect(result.missingItems.photo).toBe(false)
                        return true
                    }

                    // If requirements not met, should be invalid
                    expect(result.isValid).toBe(false)
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    it('Feature: dashboard, Property 20: rejects week data with insufficient nutrition days', () => {
        fc.assert(
            fc.property(
                fc.tuple(
                    fc.integer({ min: 0, max: 4 }), // 0-4 days with nutrition
                    fc.boolean() // has photo
                ).map(([nutritionDays, hasPhoto]) => {
                    const weekData = []

                    // Add days with nutrition
                    for (let i = 0; i < nutritionDays; i++) {
                        weekData.push({
                            date: `2024-01-0${i + 1}`,
                            nutrition: { calories: fc.sample(fc.integer({ min: 1, max: 3000 }), 1)[0] },
                            weight: fc.sample(fc.double({ min: 40, max: 200, noNaN: true }), 1)[0]
                        })
                    }

                    // Fill remaining days with no nutrition but with weight
                    while (weekData.length < 7) {
                        weekData.push({
                            date: `2024-01-0${weekData.length + 1}`,
                            nutrition: { calories: 0 },
                            weight: fc.sample(fc.double({ min: 40, max: 200, noNaN: true }), 1)[0]
                        })
                    }

                    return { weekData, hasPhoto, expectedNutritionMissing: 5 - nutritionDays }
                }),
                ({ weekData, hasPhoto, expectedNutritionMissing }) => {
                    const result = validateWeeklyReport(weekData, hasPhoto)

                    expect(result.isValid).toBe(false)
                    expect(result.errors.length).toBeGreaterThan(0)
                    expect(result.missingItems.nutrition).toBe(expectedNutritionMissing)

                    // Should have nutrition error message
                    const nutritionError = result.errors.find(e => e.includes('питание'))
                    expect(nutritionError).toBeDefined()
                    expect(nutritionError).toContain(expectedNutritionMissing.toString())

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    it('Feature: dashboard, Property 20: rejects week data with insufficient weight days', () => {
        fc.assert(
            fc.property(
                fc.tuple(
                    fc.integer({ min: 0, max: 4 }), // 0-4 days with weight
                    fc.boolean() // has photo
                ).map(([weightDays, hasPhoto]) => {
                    const weekData = []

                    // Add days with weight
                    for (let i = 0; i < weightDays; i++) {
                        weekData.push({
                            date: `2024-01-0${i + 1}`,
                            nutrition: { calories: fc.sample(fc.integer({ min: 1, max: 3000 }), 1)[0] },
                            weight: fc.sample(fc.double({ min: 40, max: 200, noNaN: true }), 1)[0]
                        })
                    }

                    // Fill remaining days with nutrition but no weight
                    while (weekData.length < 7) {
                        weekData.push({
                            date: `2024-01-0${weekData.length + 1}`,
                            nutrition: { calories: fc.sample(fc.integer({ min: 1, max: 3000 }), 1)[0] },
                            weight: null
                        })
                    }

                    return { weekData, hasPhoto, expectedWeightMissing: 5 - weightDays }
                }),
                ({ weekData, hasPhoto, expectedWeightMissing }) => {
                    const result = validateWeeklyReport(weekData, hasPhoto)

                    expect(result.isValid).toBe(false)
                    expect(result.errors.length).toBeGreaterThan(0)
                    expect(result.missingItems.weight).toBe(expectedWeightMissing)

                    // Should have weight error message
                    const weightError = result.errors.find(e => e.includes('вес'))
                    expect(weightError).toBeDefined()
                    expect(weightError).toContain(expectedWeightMissing.toString())

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    it('Feature: dashboard, Property 20: rejects week data without photo', () => {
        fc.assert(
            fc.property(
                // Generate week data with sufficient nutrition and weight but no photo
                weekDataGenerator.map(weekData =>
                    weekData.map((day, index) => ({
                        ...day,
                        nutrition: { calories: index < 5 ? fc.sample(fc.integer({ min: 1, max: 3000 }), 1)[0] : 0 },
                        weight: index < 5 ? fc.sample(fc.double({ min: 40, max: 200, noNaN: true }), 1)[0] : null
                    }))
                ),
                (weekData) => {
                    const result = validateWeeklyReport(weekData, false) // no photo

                    expect(result.isValid).toBe(false)
                    expect(result.errors.length).toBeGreaterThan(0)
                    expect(result.missingItems.photo).toBe(true)

                    // Should have photo error message
                    const photoError = result.errors.find(e => e.includes('фото'))
                    expect(photoError).toBeDefined()

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    it('Feature: dashboard, Property 20: correctly counts missing items for any week data', () => {
        fc.assert(
            fc.property(
                fc.tuple(weekDataGenerator, fc.boolean()),
                ([weekData, hasPhoto]) => {
                    const result = validateWeeklyReport(weekData, hasPhoto)

                    // Manually count expected values
                    const actualNutritionDays = weekData.filter(d => d.nutrition.calories > 0).length
                    const actualWeightDays = weekData.filter(d => d.weight !== null && d.weight > 0).length

                    const expectedNutritionMissing = Math.max(0, 5 - actualNutritionDays)
                    const expectedWeightMissing = Math.max(0, 5 - actualWeightDays)

                    expect(result.missingItems.nutrition).toBe(expectedNutritionMissing)
                    expect(result.missingItems.weight).toBe(expectedWeightMissing)
                    expect(result.missingItems.photo).toBe(!hasPhoto)

                    // Validation should be true only if all requirements met
                    const shouldBeValid = expectedNutritionMissing === 0 && expectedWeightMissing === 0 && hasPhoto
                    expect(result.isValid).toBe(shouldBeValid)

                    if (!shouldBeValid) {
                        expect(result.errors.length).toBeGreaterThan(0)
                    } else {
                        expect(result.errors.length).toBe(0)
                    }

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    it('Feature: dashboard, Property 20: provides Russian error messages', () => {
        fc.assert(
            fc.property(
                fc.tuple(weekDataGenerator, fc.boolean()),
                ([weekData, hasPhoto]) => {
                    const result = validateWeeklyReport(weekData, hasPhoto)

                    // All error messages should be in Russian
                    result.errors.forEach(error => {
                        expect(typeof error).toBe('string')
                        expect(error.length).toBeGreaterThan(0)

                        // Check for Russian words/patterns
                        const hasRussianContent = /[а-яё]/i.test(error) ||
                            error.includes('Необходимо') ||
                            error.includes('питание') ||
                            error.includes('вес') ||
                            error.includes('фото')
                        expect(hasRussianContent).toBe(true)
                    })

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    it('Feature: dashboard, Property 20: always returns WeeklyReportValidationResult structure', () => {
        fc.assert(
            fc.property(
                fc.tuple(weekDataGenerator, fc.boolean()),
                ([weekData, hasPhoto]) => {
                    const result = validateWeeklyReport(weekData, hasPhoto)

                    // Check structure
                    expect(result).toHaveProperty('isValid')
                    expect(typeof result.isValid).toBe('boolean')

                    expect(result).toHaveProperty('errors')
                    expect(Array.isArray(result.errors)).toBe(true)

                    expect(result).toHaveProperty('missingItems')
                    expect(result.missingItems).toHaveProperty('nutrition')
                    expect(result.missingItems).toHaveProperty('weight')
                    expect(result.missingItems).toHaveProperty('photo')

                    expect(typeof result.missingItems.nutrition).toBe('number')
                    expect(typeof result.missingItems.weight).toBe('number')
                    expect(typeof result.missingItems.photo).toBe('boolean')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })
})
