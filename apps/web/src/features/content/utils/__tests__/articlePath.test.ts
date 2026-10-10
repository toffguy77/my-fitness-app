import { articleEditPath, articlePath, articleReturnPath, articleUrl } from '../articlePath'

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

// Куда редактор возвращает после сохранения, если его открыли со страницы
// статьи. Адрес приходит из строки запроса, поэтому принимается только своя
// страница статьи: иначе ссылкой на редактор можно было бы увести на чужой сайт.
describe('articleReturnPath', () => {
    it('accepts the page of an article', () => {
        expect(articleReturnPath('/content/ves-stoit-pri-deficite')).toBe('/content/ves-stoit-pri-deficite')
        expect(articleReturnPath('/content/f914ec19-c67f-4c3a-9d1e-0a1b2c3d4e5f')).toBe(
            '/content/f914ec19-c67f-4c3a-9d1e-0a1b2c3d4e5f',
        )
    })

    it.each([
        null,
        '',
        'https://evil.example/content/x',
        '//evil.example/content/x',
        '/\\evil.example',
        '/content/../admin',
        '/content/x?y=1',
        '/content/',
        '/admin/content',
        // eslint-disable-next-line no-script-url -- the address under test, never run
        'javascript:alert(1)',
    ])('refuses %p', (from) => {
        expect(articleReturnPath(from)).toBeNull()
    })
})

describe('articleEditPath', () => {
    it('opens a curator in the curator section and an admin in the admin one', () => {
        expect(articleEditPath('coordinator', 'a1', '/content/x')).toBe('/curator/content/a1/edit?from=%2Fcontent%2Fx')
        expect(articleEditPath('super_admin', 'a1', '/content/x')).toBe('/admin/content/a1/edit?from=%2Fcontent%2Fx')
    })

    it('has no editor for anyone else', () => {
        expect(articleEditPath('client', 'a1', '/content/x')).toBeNull()
        expect(articleEditPath(undefined, 'a1', '/content/x')).toBeNull()
    })
})
