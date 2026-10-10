import { ApiError } from '@/shared/errors/apiErrors'
import { fieldLabel, formatAmount, missingFields } from '../recipeInput'

describe('missingFields', () => {
    it('читает params.missing', () => {
        expect(missingFields(new ApiError(422, { code: 'validation', params: { missing: ['meal_types'] } }))).toEqual([
            'meal_types',
        ])
    })

    it('не 422, не ApiError или без перечня — null', () => {
        expect(missingFields(new ApiError(500, { params: { missing: ['steps'] } }))).toBeNull()
        expect(missingFields(new Error('x'))).toBeNull()
        expect(missingFields(new ApiError(422, null))).toBeNull()
        expect(missingFields(new ApiError(422, { params: { missing: 'steps' } }))).toBeNull()
        expect(missingFields(new ApiError(422, { code: 'validation' }))).toBeNull()
    })
})

describe('fieldLabel', () => {
    it('знакомые поля — подписью, вложенные — с уточнением, прочие как есть', () => {
        expect(fieldLabel('steps')).toBe('Шаги')
        expect(fieldLabel('meal_types')).toBe('Приёмы пищи')
        expect(fieldLabel('ingredients.food_id')).toBe('Ингредиенты: не у всех выбран продукт из каталога')
        expect(fieldLabel('ingredients.grams')).toBe('Ингредиенты: не у всех указан вес (или отметка «по вкусу»)')
        expect(fieldLabel('ingredients[1].food_id')).toBe('Ингредиенты ([1].food_id)')
        expect(fieldLabel('ingredients.0.food_id')).toBe('Ингредиенты (0.food_id)')
        expect(fieldLabel('mystery')).toBe('mystery')
    })

    it.each([
        ['name', 'Название'],
        ['description', 'Описание'],
        ['photo', 'Фото блюда'],
        ['photo_key', 'Фото блюда'],
        ['cook_minutes', 'Время, мин'],
        ['complexity', 'Сложность'],
        ['servings', 'Порций'],
        ['ingredients', 'Ингредиенты'],
    ])('%s → %s', (field, label) => {
        expect(fieldLabel(field)).toBe(label)
    })
})

describe('formatAmount', () => {
    it('не больше одного знака после запятой', () => {
        expect(formatAmount(12)).toBe('12')
        expect(formatAmount(12.34)).toBe('12,3')
    })
})
