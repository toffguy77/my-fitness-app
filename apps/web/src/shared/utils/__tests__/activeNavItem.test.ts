import { activeNavItem } from '../activeNavItem'

const curator = [
    { id: 'hub', href: '/curator' },
    { id: 'chats', href: '/curator/chat' },
    { id: 'content', href: '/curator/content' },
    { id: 'leads', href: '/curator/leads' },
] as const

describe('activeNavItem', () => {
    it('выбирает самый длинный совпавший адрес', () => {
        expect(activeNavItem('/curator', curator)).toBe('hub')
        expect(activeNavItem('/curator/chat', curator)).toBe('chats')
        expect(activeNavItem('/curator/chat/17', curator)).toBe('chats')
        expect(activeNavItem('/curator/clients/17', curator)).toBe('hub')
        expect(activeNavItem('/curator/content/new', curator)).toBe('content')
    })

    it('сравнивает по границе сегмента, а не по началу строки', () => {
        expect(activeNavItem('/curatorship', curator)).toBeUndefined()
        expect(activeNavItem('/curator/chats-archive', curator)).toBe('hub')
    })

    it('адрес без вкладки не подсвечивает ни одну', () => {
        expect(activeNavItem('/profile', [{ id: 'dashboard', href: '/dashboard' }])).toBeUndefined()
        expect(activeNavItem(null, curator)).toBeUndefined()
    })

    it('пункты без адреса пропускаются', () => {
        expect(activeNavItem('/workout', [{ id: 'workout' }, { id: 'dashboard', href: '/dashboard' }])).toBeUndefined()
    })
})
