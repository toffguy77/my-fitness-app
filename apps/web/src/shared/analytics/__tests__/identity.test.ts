import { linkVisitor, resetIdentityForTests } from '../identity'
import { visitorId, resetAnalyticsForTests } from '../client'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { post: jest.fn() },
}))

const post = apiClient.post as jest.Mock

describe('Сшивка браузера с пользователем', () => {
    beforeEach(() => {
        localStorage.clear()
        resetAnalyticsForTests()
        resetIdentityForTests()
        jest.clearAllMocks()
        post.mockResolvedValue({})
    })

    // Единственный способ, которым заполняется analytics_identities. Пока его
    // не вызывали, воронка «аноним → зарегистрировался» не считалась вовсе.
    it('отправляет идентификатор браузера', async () => {
        const visitor = visitorId()

        await linkVisitor()

        expect(post).toHaveBeenCalledWith('/api/v1/analytics/identify', {
            visitor_id: visitor,
        })
    })

    // Сервер идемпотентен, но запрос на каждой загрузке страницы у давно
    // вошедшего человека — лишний трафик без пользы.
    it('не повторяет запрос для того же браузера', async () => {
        await linkVisitor()
        await linkVisitor()
        await linkVisitor()

        expect(post).toHaveBeenCalledTimes(1)
    })

    it('сшивает заново, если идентификатор браузера сменился', async () => {
        await linkVisitor()
        expect(post).toHaveBeenCalledTimes(1)

        // Человек очистил данные сайта: у браузера новый идентификатор, и его
        // прежние события связывать уже не с чем.
        localStorage.removeItem('analytics_visitor_id')
        resetAnalyticsForTests()

        await linkVisitor()

        expect(post).toHaveBeenCalledTimes(2)
        expect(post.mock.calls[0][1].visitor_id).not.toBe(post.mock.calls[1][1].visitor_id)
    })

    // Аналитика не должна уметь сломать вход.
    it('молчит, когда запрос не удался', async () => {
        post.mockRejectedValue(new Error('сеть'))

        await expect(linkVisitor()).resolves.toBeUndefined()
    })

    // Отметки нет — значит следующая попытка состоится. Иначе один отказ
    // оставил бы воронку несшитой навсегда.
    it('пробует снова после неудачи', async () => {
        post.mockRejectedValueOnce(new Error('сеть'))

        await linkVisitor()
        await linkVisitor()

        expect(post).toHaveBeenCalledTimes(2)
    })

    it('переживает отказ хранилища', async () => {
        const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('приватный режим')
        })
        const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('приватный режим')
        })

        await expect(linkVisitor()).resolves.toBeUndefined()

        getItem.mockRestore()
        setItem.mockRestore()
    })
})
