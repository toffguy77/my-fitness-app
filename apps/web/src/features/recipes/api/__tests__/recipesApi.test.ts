import { adminRecipesApi, curatorRecipesApi, recipesApi } from '../recipesApi'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn().mockResolvedValue({}),
        post: jest.fn().mockResolvedValue({}),
        put: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        postFormData: jest.fn().mockResolvedValue({}),
    },
}))

import { apiClient } from '@/shared/utils/api-client'

const get = apiClient.get as jest.Mock
const post = apiClient.post as jest.Mock
const put = apiClient.put as jest.Mock
const del = apiClient.delete as jest.Mock
const postFormData = apiClient.postFormData as jest.Mock

const ID = 'r-1'
const input = {
    name: 'x',
    description: '',
    photo_key: null,
    cook_minutes: 1,
    complexity: 'easy' as const,
    servings: 1,
    yield_grams: null,
    meal_types: [],
    tags: [],
    allergens: [],
    ingredients: [],
    steps: [],
}

beforeEach(() => jest.clearAllMocks())

describe('recipesApi (клиент)', () => {
    it('каталог: пустые параметры не уходят в строку запроса', async () => {
        await recipesApi.list({ q: '', meal_type: '', page: 1, page_size: 20 })
        expect(get).toHaveBeenCalledWith('/api/v1/recipes?page=1&page_size=20')
        await recipesApi.list({ q: 'сыр ники', meal_type: 'breakfast' })
        expect(get).toHaveBeenLastCalledWith('/api/v1/recipes?q=%D1%81%D1%8B%D1%80+%D0%BD%D0%B8%D0%BA%D0%B8&meal_type=breakfast')
        await recipesApi.list()
        expect(get).toHaveBeenLastCalledWith('/api/v1/recipes')
    })

    it('карточка, отклонение и возврат', async () => {
        await recipesApi.get(ID)
        expect(get).toHaveBeenCalledWith('/api/v1/recipes/r-1')
        await recipesApi.reject(ID)
        expect(post).toHaveBeenCalledWith('/api/v1/recipes/r-1/reject', {})
        await recipesApi.unreject(ID)
        expect(del).toHaveBeenCalledWith('/api/v1/recipes/r-1/reject')
    })

    it('свои ограничения', async () => {
        await recipesApi.getRestrictions()
        expect(get).toHaveBeenCalledWith('/api/v1/food-restrictions')
        const body = { allergens: ['nuts' as const], excluded_food_ids: ['f'] }
        await recipesApi.saveRestrictions(body)
        expect(put).toHaveBeenCalledWith('/api/v1/food-restrictions', body)
    })
})

describe('adminRecipesApi (команда)', () => {
    it('список, создание, чтение, черновик', async () => {
        await adminRecipesApi.list({ state: 'draft' })
        expect(get).toHaveBeenCalledWith('/api/v1/admin/recipes?state=draft')
        await adminRecipesApi.list()
        expect(get).toHaveBeenLastCalledWith('/api/v1/admin/recipes')
        await adminRecipesApi.create(input)
        expect(post).toHaveBeenCalledWith('/api/v1/admin/recipes', input)
        await adminRecipesApi.get(ID)
        expect(get).toHaveBeenLastCalledWith('/api/v1/admin/recipes/r-1')
        await adminRecipesApi.saveDraft(ID, input)
        expect(put).toHaveBeenCalledWith('/api/v1/admin/recipes/r-1/draft', input)
    })

    it('отправка и публикация', async () => {
        await adminRecipesApi.submit(ID)
        expect(post).toHaveBeenCalledWith('/api/v1/admin/recipes/r-1/submit', {})
        await adminRecipesApi.unpublish(ID)
        expect(post).toHaveBeenCalledWith('/api/v1/admin/recipes/r-1/unpublish', {})
        await adminRecipesApi.publish(ID)
        expect(post).toHaveBeenCalledWith('/api/v1/admin/recipes/r-1/publish', {})
    })

    it('фото уходит полем file', async () => {
        const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
        await adminRecipesApi.uploadPhoto(file)
        const [url, form] = postFormData.mock.calls[0]
        expect(url).toBe('/api/v1/admin/recipes/photos')
        expect((form as FormData).get('file')).toBe(file)
    })

    it('поиск по каталогу и импорт ВкусВилла', async () => {
        await adminRecipesApi.searchCatalogue('творог')
        expect(get).toHaveBeenCalledWith('/api/v1/admin/recipes/catalogue-search?q=%D1%82%D0%B2%D0%BE%D1%80%D0%BE%D0%B3')
        await adminRecipesApi.searchVkusvill('pie')
        expect(get).toHaveBeenLastCalledWith('/api/v1/admin/recipes/import/vkusvill?q=pie&page=1')
        await adminRecipesApi.importVkusvill('a/b', 'Щи')
        expect(post).toHaveBeenCalledWith('/api/v1/admin/recipes/import/vkusvill/a%2Fb?q=%D0%A9%D0%B8', {})
    })
})

describe('curatorRecipesApi (куратор)', () => {
    it('опубликованные рецепты для скрытия', async () => {
        await curatorRecipesApi.listPublished('суп')
        expect(get).toHaveBeenCalledWith('/api/v1/curator/recipes?q=%D1%81%D1%83%D0%BF&page=1&page_size=20')
    })

    it('очередь, чтение, одобрение, возврат', async () => {
        await curatorRecipesApi.reviewQueue()
        expect(get).toHaveBeenCalledWith('/api/v1/curator/recipes/review?page=1')
        await curatorRecipesApi.get(ID)
        expect(get).toHaveBeenLastCalledWith('/api/v1/curator/recipes/r-1')
        await curatorRecipesApi.approve(ID)
        expect(post).toHaveBeenCalledWith('/api/v1/curator/recipes/r-1/approve', {})
        await curatorRecipesApi.approve(ID, input)
        expect(post).toHaveBeenLastCalledWith('/api/v1/curator/recipes/r-1/approve', { version: input })
        await curatorRecipesApi.returnToTeam(ID, 'мало соли')
        expect(post).toHaveBeenLastCalledWith('/api/v1/curator/recipes/r-1/return', { comment: 'мало соли' })
    })

    it('ограничения и скрытые рецепты клиента', async () => {
        await curatorRecipesApi.getClientRestrictions(7)
        expect(get).toHaveBeenCalledWith('/api/v1/curator/clients/7/food-restrictions')
        const body = { allergens: [], excluded_food_ids: [] }
        await curatorRecipesApi.saveClientRestrictions(7, body)
        expect(put).toHaveBeenCalledWith('/api/v1/curator/clients/7/food-restrictions', body)
        await curatorRecipesApi.hiddenRecipes(7)
        expect(get).toHaveBeenLastCalledWith('/api/v1/curator/clients/7/hidden-recipes')
        await curatorRecipesApi.hideRecipe(7, ID)
        expect(put).toHaveBeenLastCalledWith('/api/v1/curator/clients/7/hidden-recipes/r-1', {})
        await curatorRecipesApi.unhideRecipe(7, ID)
        expect(del).toHaveBeenCalledWith('/api/v1/curator/clients/7/hidden-recipes/r-1')
    })
})
