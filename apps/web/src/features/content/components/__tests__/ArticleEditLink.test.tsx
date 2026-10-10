import { render, screen } from '@testing-library/react'
import { ArticleEditLink } from '../ArticleEditLink'

const mockSession = jest.fn()
jest.mock('@/shared/hooks/useSession', () => ({
    useSession: () => mockSession(),
}))

const mockCurrentUser = jest.fn()
jest.mock('@/shared/hooks/useCurrentUser', () => ({
    useCurrentUser: () => mockCurrentUser(),
}))

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={href} {...props}>{children}</a>,
}))

function as(role: string) {
    mockSession.mockReturnValue('authenticated')
    mockCurrentUser.mockReturnValue({ user: { id: '1', email: 'x@example.test', role }, state: 'ready' })
}

describe('ArticleEditLink', () => {
    beforeEach(() => jest.clearAllMocks())

    it('takes a curator to the curator editor and back to the article', () => {
        as('coordinator')
        render(<ArticleEditLink articleId="a1" from="/content/ves-stoit" />)

        expect(screen.getByRole('link', { name: 'Редактировать' })).toHaveAttribute(
            'href',
            '/curator/content/a1/edit?from=%2Fcontent%2Fves-stoit',
        )
    })

    it('takes an admin to the admin editor', () => {
        as('super_admin')
        render(<ArticleEditLink articleId="a1" from="/content/ves-stoit" />)

        expect(screen.getByRole('link', { name: 'Редактировать' })).toHaveAttribute(
            'href',
            '/admin/content/a1/edit?from=%2Fcontent%2Fves-stoit',
        )
    })

    it('is not shown to a client', () => {
        as('client')
        render(<ArticleEditLink articleId="a1" from="/content/ves-stoit" />)

        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    // У гостя роль не спрашивается вовсе: публичную страницу читают поисковые
    // роботы и посетители без входа, лишний запрос к /auth/me им ни к чему.
    it('is not shown to a visitor, and does not ask who they are', () => {
        mockSession.mockReturnValue('anonymous')
        render(<ArticleEditLink articleId="a1" from="/content/ves-stoit" />)

        expect(screen.queryByRole('link')).not.toBeInTheDocument()
        expect(mockCurrentUser).not.toHaveBeenCalled()
    })
})
