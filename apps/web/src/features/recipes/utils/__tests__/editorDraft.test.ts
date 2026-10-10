import { version } from '../../testing/fixtures'
import { draftFromVersion, draftToInput, emptyIngredient, emptyStep, nextKey } from '../editorDraft'

describe('editorDraft', () => {
    it('новый рецепт начинается с одной пустой строки ингредиента и шага', () => {
        const draft = draftFromVersion(null)
        expect(draft.ingredients).toHaveLength(1)
        expect(draft.steps).toHaveLength(1)
        expect(draft.servings).toBe('2')
    })

    it('ключи строк не повторяются', () => {
        expect(nextKey()).not.toBe(nextKey())
        expect(emptyIngredient().key).not.toBe(emptyStep().key)
    })

    it('версия → черновик → запрос: порядок по позиции, фото ключом, КБЖУ не отправляется', () => {
        const input = draftToInput(draftFromVersion(version()))

        expect(input.ingredients.map((i) => i.food_id)).toEqual(['food-curd', 'food-egg', 'food-salt'])
        expect(input.ingredients[0]).toEqual({
            food_id: 'food-curd',
            source_name: null,
            grams: 250,
            display_quantity: null,
            to_taste: false,
        })
        expect(input.ingredients[2]).toMatchObject({ grams: null, to_taste: true })
        expect(input.steps).toEqual([
            { text: 'Смешать творог с яйцом', photo_key: null },
            { text: 'Обжарить', photo_key: 'recipes/step2.jpg' },
        ])
        expect(input.photo_key).toBe('recipes/aaa.jpg')
        expect(input.tags).toEqual(['творог', 'быстро'])
        expect(input.yield_grams).toBe(300)
        expect(input).not.toHaveProperty('per_100g')
        expect(input).not.toHaveProperty('per_portion')
    })

    it('пустые строки отбрасываются, пустой вес — null, запятая — десятичная', () => {
        const draft = draftFromVersion(null)
        draft.yield_grams = ''
        draft.cook_minutes = 'abc'
        draft.ingredients = [
            { ...emptyIngredient() },
            { ...emptyIngredient(), food_id: 5, food_name: 'Мука', grams: '12,5' },
            { ...emptyIngredient(), source_name: 'Сахар' },
        ]
        draft.steps = [{ ...emptyStep() }, { ...emptyStep(), text: '  Печь  ' }]

        const input = draftToInput(draft)
        expect(input.yield_grams).toBeNull()
        expect(input.cook_minutes).toBe(0)
        expect(input.ingredients).toEqual([
            { food_id: 5, source_name: null, grams: 12.5, display_quantity: null, to_taste: false },
            { food_id: null, source_name: 'Сахар', grams: null, display_quantity: null, to_taste: false },
        ])
        expect(input.steps).toEqual([{ text: 'Печь', photo_key: null }])
    })

    it('кандидаты импорта переносятся в строку', () => {
        const draft = draftFromVersion(
            version({
                ingredients: [
                    {
                        position: 1,
                        food_id: null,
                        food_name: null,
                        source_name: 'Сахар',
                        grams: null,
                        display_quantity: '2 ст. л.',
                        to_taste: false,
                        candidates: [{ food_id: '1', name: 'Сахар-песок', default_weight: null }],
                    },
                ],
                yield_grams: null,
            })
        )
        expect(draft.ingredients[0].candidates).toHaveLength(1)
        expect(draft.yield_grams).toBe('')
    })
})
