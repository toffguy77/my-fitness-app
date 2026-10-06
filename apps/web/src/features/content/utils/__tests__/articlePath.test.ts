import { articlePath, articleUrl } from '../articlePath'

describe('articlePath', () => {
    it('addresses an article by its slug', () => {
        expect(articlePath({ id: 'f914ec19-c67f-4c3a-9d1e-0a1b2c3d4e5f', slug: 'raschet-kbzhu' })).toBe(
            '/content/raschet-kbzhu',
        )
    })

    // A card for an article meant only for one curator's clients carries no
    // slug: its public page would not find it, so it is opened by id.
    it('falls back to the id when there is no public address', () => {
        expect(articlePath({ id: 'f914ec19-c67f-4c3a-9d1e-0a1b2c3d4e5f' })).toBe(
            '/content/f914ec19-c67f-4c3a-9d1e-0a1b2c3d4e5f',
        )
        expect(articlePath({ id: 'abc', slug: '' })).toBe('/content/abc')
    })

    it('gives the absolute address for canonical links', () => {
        expect(articleUrl({ id: 'x', slug: 'raschet-kbzhu' })).toBe('https://burcev.team/content/raschet-kbzhu')
    })
})
