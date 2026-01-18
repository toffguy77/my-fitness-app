/**
 * Unit Tests: Product Transformation Layer
 *
 * Tests specific examples and edge cases for FatSecret product transformation.
 * Requirements: 2.2, 3.1, 3.3
 */

import {
    transformFatSecretFood,
    findOrCalculate100gServing,
    extractImageUrl
} from '../transform'
import type { FatSecretFood, FatSecretServing } from '../fatsecret'

describe('Product Transformation Layer', () => {
    describe('transformFatSecretFood', () => {
        it('should transform FatSecret food with 100g serving correctly', () => {
            const food: FatSecretFood = {
                food_id: '12345',
                food_name: 'Chicken Breast',
                brand_name: 'Generic',
                food_type: 'Generic',
                servings: {
                    serving: [{
                        serving_id: '1',
                        serving_description: '100g',
                        metric_serving_amount: '100',
                        metric_serving_unit: 'g',
                        calories: '165',
                        carbohydrate: '0',
                        protein: '31',
                        fat: '3.6'
                    }]
                }
            }

            const product = transformFatSecretFood(food)

            expect(product.name).toBe('Chicken Breast')
            expect(product.brand).toBe('Generic')
            expect(product.calories_per_100g).toBe(165)
            expect(product.protein_per_100g).toBe(31)
            expect(product.fats_per_100g).toBe(3.6)
            expect(product.carbs_per_100g).toBe(0)
            expect(product.source).toBe('fatsecret')
            expect(product.source_id).toBe('12345')
            expect(product.barcode).toBeNull()
        })

        it('should transform FatSecret food without 100g serving by calculating', () => {
            const food: FatSecretFood = {
                food_id: '67890',
                food_name: 'Apple',
                food_type: 'Generic',
                servings: {
                    serving: [{
                        serving_id: '1',
                        serving_description: '1 medium (182g)',
                        metric_serving_amount: '182',
                        metric_serving_unit: 'g',
                        calories: '95',
                        carbohydrate: '25',
                        protein: '0.5',
                        fat: '0.3'
                    }]
                }
            }

            const product = transformFatSecretFood(food)

            expect(product.name).toBe('Apple')
            expect(product.brand).toBeUndefined()

            // Calculated values: (value / 182) * 100
            expect(product.calories_per_100g).toBeCloseTo(52.2, 1)
            expect(product.protein_per_100g).toBeCloseTo(0.27, 1)
            expect(product.fats_per_100g).toBeCloseTo(0.16, 1)
            expect(product.carbs_per_100g).toBeCloseTo(13.74, 1)
            expect(product.source).toBe('fatsecret')
            expect(product.source_id).toBe('67890')
        })

        it('should handle missing optional fields gracefully', () => {
            const food: FatSecretFood = {
                food_id: '11111',
                food_name: 'Test Food',
                food_type: 'Generic',
                servings: {
                    serving: [{
                        serving_id: '1',
                        serving_description: '100g',
                        metric_serving_amount: '100',
                        metric_serving_unit: 'g',
                        calories: '200',
                        carbohydrate: '20',
                        protein: '10',
                        fat: '5'
                    }]
                }
            }

            const product = transformFatSecretFood(food)

            expect(product.name).toBe('Test Food')
            expect(product.brand).toBeUndefined()
            expect(product.image_url).toBeNull()
            expect(product.calories_per_100g).toBe(200)
        })

        it('should transform brand foods correctly', () => {
            const food: FatSecretFood = {
                food_id: '22222',
                food_name: 'Protein Bar',
                brand_name: 'Quest',
                food_type: 'Brand',
                servings: {
                    serving: [{
                        serving_id: '1',
                        serving_description: '1 bar (60g)',
                        metric_serving_amount: '60',
                        metric_serving_unit: 'g',
                        calories: '200',
                        carbohydrate: '21',
                        protein: '20',
                        fat: '8'
                    }]
                }
            }

            const product = transformFatSecretFood(food)

            expect(product.name).toBe('Protein Bar')
            expect(product.brand).toBe('Quest')
            expect(product.source).toBe('fatsecret')
        })

        it('should transform generic foods correctly', () => {
            const food: FatSecretFood = {
                food_id: '33333',
                food_name: 'Brown Rice',
                food_type: 'Generic',
                servings: {
                    serving: [{
                        serving_id: '1',
                        serving_description: '100g',
                        metric_serving_amount: '100',
                        metric_serving_unit: 'g',
                        calories: '111',
                        carbohydrate: '23',
                        protein: '2.6',
                        fat: '0.9'
                    }]
                }
            }

            const product = transformFatSecretFood(food)

            expect(product.name).toBe('Brown Rice')
            expect(product.brand).toBeUndefined()
            expect(product.calories_per_100g).toBe(111)
        })

        it('should extract image URL when available', () => {
            const food: FatSecretFood = {
                food_id: '44444',
                food_name: 'Banana',
                food_type: 'Generic',
                food_images: {
                    food_image: [{
                        image_url: 'https://example.com/banana.jpg',
                        image_type: 'front'
                    }]
                },
                servings: {
                    serving: [{
                        serving_id: '1',
                        serving_description: '100g',
                        metric_serving_amount: '100',
                        metric_serving_unit: 'g',
                        calories: '89',
                        carbohydrate: '23',
                        protein: '1.1',
                        fat: '0.3'
                    }]
                }
            }

            const product = transformFatSecretFood(food)

            expect(product.image_url).toBe('https://example.com/banana.jpg')
        })

        it('should throw error for invalid food data', () => {
            const invalidFood = {
                food_id: '',
                food_name: '',
                food_type: 'Generic',
                servings: { serving: [] }
            } as FatSecretFood

            expect(() => transformFatSecretFood(invalidFood)).toThrow()
        })

        it('should throw error for food without servings', () => {
            const food: FatSecretFood = {
                food_id: '55555',
                food_name: 'Test',
                food_type: 'Generic',
                servings: {
                    serving: []
                }
            }

            expect(() => transformFatSecretFood(food)).toThrow('No servings available')
        })
    })

    describe('findOrCalculate100gServing', () => {
        it('should find exact 100g serving when available', () => {
            const servings: FatSecretServing[] = [
                {
                    serving_id: '1',
                    serving_description: '1 cup',
                    metric_serving_amount: '240',
                    metric_serving_unit: 'ml',
                    calories: '150',
                    carbohydrate: '20',
                    protein: '8',
                    fat: '5'
                },
                {
                    serving_id: '2',
                    serving_description: '100g',
                    metric_serving_amount: '100',
                    metric_serving_unit: 'g',
                    calories: '100',
                    carbohydrate: '15',
                    protein: '5',
                    fat: '3'
                }
            ]

            const result = findOrCalculate100gServing(servings)

            expect(result).not.toBeNull()
            expect(result?.metric_serving_amount).toBe('100')
            expect(result?.calories).toBe('100')
            expect(result?.protein).toBe('5')
        })

        it('should calculate from metric serving when 100g not available', () => {
            const servings: FatSecretServing[] = [
                {
                    serving_id: '1',
                    serving_description: '50g',
                    metric_serving_amount: '50',
                    metric_serving_unit: 'g',
                    calories: '100',
                    carbohydrate: '10',
                    protein: '5',
                    fat: '2'
                }
            ]

            const result = findOrCalculate100gServing(servings)

            expect(result).not.toBeNull()
            expect(result?.metric_serving_amount).toBe('100')

            // Values should be doubled (50g -> 100g)
            expect(parseFloat(result!.calories)).toBeCloseTo(200, 1)
            expect(parseFloat(result!.carbohydrate)).toBeCloseTo(20, 1)
            expect(parseFloat(result!.protein)).toBeCloseTo(10, 1)
            expect(parseFloat(result!.fat)).toBeCloseTo(4, 1)
        })

        it('should calculate from ml serving', () => {
            const servings: FatSecretServing[] = [
                {
                    serving_id: '1',
                    serving_description: '200ml',
                    metric_serving_amount: '200',
                    metric_serving_unit: 'ml',
                    calories: '150',
                    carbohydrate: '12',
                    protein: '8',
                    fat: '8'
                }
            ]

            const result = findOrCalculate100gServing(servings)

            expect(result).not.toBeNull()
            expect(result?.metric_serving_amount).toBe('100')

            // Values should be halved (200ml -> 100ml)
            expect(parseFloat(result!.calories)).toBeCloseTo(75, 1)
            expect(parseFloat(result!.carbohydrate)).toBeCloseTo(6, 1)
            expect(parseFloat(result!.protein)).toBeCloseTo(4, 1)
            expect(parseFloat(result!.fat)).toBeCloseTo(4, 1)
        })

        it('should use first serving as fallback', () => {
            const servings: FatSecretServing[] = [
                {
                    serving_id: '1',
                    serving_description: '1 piece',
                    metric_serving_amount: '30',
                    metric_serving_unit: 'piece',
                    calories: '60',
                    carbohydrate: '8',
                    protein: '2',
                    fat: '2'
                }
            ]

            const result = findOrCalculate100gServing(servings)

            expect(result).not.toBeNull()
            expect(result?.metric_serving_amount).toBe('100')

            // Values should be scaled (30 -> 100)
            const scaleFactor = 100 / 30
            expect(parseFloat(result!.calories)).toBeCloseTo(60 * scaleFactor, 1)
        })

        it('should preserve optional fields when calculating', () => {
            const servings: FatSecretServing[] = [
                {
                    serving_id: '1',
                    serving_description: '50g',
                    metric_serving_amount: '50',
                    metric_serving_unit: 'g',
                    calories: '100',
                    carbohydrate: '10',
                    protein: '5',
                    fat: '2',
                    saturated_fat: '1',
                    fiber: '2',
                    sugar: '3',
                    sodium: '50'
                }
            ]

            const result = findOrCalculate100gServing(servings)

            expect(result).not.toBeNull()
            expect(result?.saturated_fat).toBeDefined()
            expect(result?.fiber).toBeDefined()
            expect(result?.sugar).toBeDefined()
            expect(result?.sodium).toBeDefined()

            // Optional fields should also be scaled
            expect(parseFloat(result!.saturated_fat!)).toBeCloseTo(2, 1)
            expect(parseFloat(result!.fiber!)).toBeCloseTo(4, 1)
        })

        it('should return null for empty servings array', () => {
            const result = findOrCalculate100gServing([])
            expect(result).toBeNull()
        })

        it('should return null for servings with zero amount', () => {
            const servings: FatSecretServing[] = [
                {
                    serving_id: '1',
                    serving_description: 'invalid',
                    metric_serving_amount: '0',
                    metric_serving_unit: 'g',
                    calories: '100',
                    carbohydrate: '10',
                    protein: '5',
                    fat: '2'
                }
            ]

            const result = findOrCalculate100gServing(servings)
            expect(result).toBeNull()
        })
    })

    describe('extractImageUrl', () => {
        it('should return null for undefined images', () => {
            const result = extractImageUrl(undefined)
            expect(result).toBeNull()
        })

        it('should return null for empty images array', () => {
            const images = { food_image: [] }
            const result = extractImageUrl(images)
            expect(result).toBeNull()
        })

        it('should extract image URL from single image', () => {
            const images = {
                food_image: [{
                    image_url: 'https://example.com/food.jpg',
                    image_type: 'product'
                }]
            }

            const result = extractImageUrl(images)
            expect(result).toBe('https://example.com/food.jpg')
        })

        it('should prioritize front image type', () => {
            const images = {
                food_image: [
                    {
                        image_url: 'https://example.com/nutrition.jpg',
                        image_type: 'nutrition'
                    },
                    {
                        image_url: 'https://example.com/front.jpg',
                        image_type: 'front'
                    },
                    {
                        image_url: 'https://example.com/product.jpg',
                        image_type: 'product'
                    }
                ]
            }

            const result = extractImageUrl(images)
            expect(result).toBe('https://example.com/front.jpg')
        })

        it('should prioritize product image type when front not available', () => {
            const images = {
                food_image: [
                    {
                        image_url: 'https://example.com/nutrition.jpg',
                        image_type: 'nutrition'
                    },
                    {
                        image_url: 'https://example.com/product.jpg',
                        image_type: 'product'
                    }
                ]
            }

            const result = extractImageUrl(images)
            expect(result).toBe('https://example.com/product.jpg')
        })

        it('should return first image as fallback', () => {
            const images = {
                food_image: [
                    {
                        image_url: 'https://example.com/other.jpg',
                        image_type: 'other'
                    },
                    {
                        image_url: 'https://example.com/another.jpg',
                        image_type: 'another'
                    }
                ]
            }

            const result = extractImageUrl(images)
            expect(result).toBe('https://example.com/other.jpg')
        })

        it('should handle single image object (not array)', () => {
            const images = {
                food_image: {
                    image_url: 'https://example.com/food.jpg',
                    image_type: 'product'
                } as any
            }

            const result = extractImageUrl(images)
            expect(result).toBe('https://example.com/food.jpg')
        })

        it('should return null when images have no URLs', () => {
            const images = {
                food_image: [
                    {
                        image_url: '',
                        image_type: 'front'
                    }
                ]
            }

            const result = extractImageUrl(images)
            expect(result).toBeNull()
        })
    })
})
