/**
 * Старые адреса статей вида /content/<uuid> уже лежат в ссылках и в индексе.
 * Публичная статья по такому адресу отвечает 301 на адрес со slug; всё
 * остальное проходит к странице как есть.
 */
import { legacyArticleRedirect } from '../proxy'

const UUID = 'f4a2a36d-53ed-428a-aa27-4c31a66fd960'

function api(status: number, body?: unknown) {
    return jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
    })
}

describe('legacyArticleRedirect', () => {
    it('sends a public article from its id to its slug', async () => {
        const fetchImpl = api(200, { data: { id: UUID, slug: 'tvoya-pervaya-nedelya' } })

        await expect(legacyArticleRedirect(`/content/${UUID}`, fetchImpl)).resolves.toBe(
            '/content/tvoya-pervaya-nedelya',
        )
        expect(fetchImpl).toHaveBeenCalledWith(
            expect.stringContaining(`/api/v1/public/content/${UUID}`),
            expect.anything(),
        )
    })

    // Статья для клиентов куратора: публичный API её не знает, а вошедший
    // клиент откроет её по UUID.
    it('lets an article the public API does not have through', async () => {
        await expect(legacyArticleRedirect(`/content/${UUID}`, api(404))).resolves.toBeNull()
    })

    it('lets the request through when the API fails', async () => {
        const failing = jest.fn().mockRejectedValue(new Error('connection refused'))
        await expect(legacyArticleRedirect(`/content/${UUID}`, failing)).resolves.toBeNull()
        await expect(legacyArticleRedirect(`/content/${UUID}`, api(500))).resolves.toBeNull()
    })

    it('does not ask the API about anything but an id under /content', async () => {
        const fetchImpl = api(200, { data: { slug: 'x' } })

        for (const path of ['/content', '/content/raschet-kbzhu', `/admin/content/${UUID}`, `/content/${UUID}/edit`]) {
            await expect(legacyArticleRedirect(path, fetchImpl)).resolves.toBeNull()
        }
        expect(fetchImpl).not.toHaveBeenCalled()
    })
})
