import { render, screen, fireEvent } from '@testing-library/react'
import { AttentionList } from '../AttentionList'
import type { AttentionItem } from '../../types'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: Record<string, unknown>) => (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img {...props} />
    ),
}))

function makeItem(overrides: Partial<AttentionItem> = {}): AttentionItem {
    return {
        client_id: 1,
        client_name: 'Анна Иванова',
        reason: 'red_alert',
        detail: 'КБЖУ ниже 50%',
        priority: 1,
        action_url: '/curator/clients/1',
        ...overrides,
    }
}

describe('AttentionList', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders nothing when items is empty', () => {
        const { container } = render(<AttentionList items={[]} />)
        expect(container.innerHTML).toBe('')
    })

    it('renders all attention items', () => {
        render(
            <AttentionList
                items={[
                    makeItem({ client_id: 1, client_name: 'Анна' }),
                    makeItem({ client_id: 2, client_name: 'Борис', reason: 'inactive' }),
                ]}
            />
        )

        expect(screen.getByText('Анна')).toBeInTheDocument()
        expect(screen.getByText('Борис')).toBeInTheDocument()
        expect(screen.getByText('Алерт КБЖУ')).toBeInTheDocument()
        expect(screen.getByText('Нет активности')).toBeInTheDocument()
    })

    it('displays correct reason labels', () => {
        render(
            <AttentionList
                items={[
                    makeItem({ reason: 'overdue_task', client_id: 1 }),
                    makeItem({ reason: 'unread_message', client_id: 2 }),
                    makeItem({ reason: 'awaiting_feedback', client_id: 3 }),
                ]}
            />
        )

        expect(screen.getByText('Просроченная задача')).toBeInTheDocument()
        expect(screen.getByText('Сообщение')).toBeInTheDocument()
        expect(screen.getByText('Ожидает отзыв')).toBeInTheDocument()
    })

    it('navigates to action_url on click', () => {
        render(
            <AttentionList
                items={[makeItem({ action_url: '/curator/clients/42' })]}
            />
        )

        fireEvent.click(screen.getByText('Анна Иванова'))
        expect(mockPush).toHaveBeenCalledWith('/curator/clients/42')
    })

    it('shows initials when no avatar', () => {
        render(
            <AttentionList
                items={[makeItem({ client_avatar: undefined, client_name: 'Анна Иванова' })]}
            />
        )

        expect(screen.getByText('АИ')).toBeInTheDocument()
    })

    it('shows avatar image when provided', () => {
        render(
            <AttentionList
                items={[makeItem({ client_avatar: '/avatar.jpg' })]}
            />
        )

        const img = screen.getByAltText('Анна Иванова')
        expect(img).toBeInTheDocument()
        expect(img).toHaveAttribute('src', '/avatar.jpg')
    })

    it('applies red badge for priority 1-2', () => {
        render(<AttentionList items={[makeItem({ priority: 2 })]} />)
        const badge = screen.getByText('Алерт КБЖУ')
        expect(badge.className).toContain('bg-red-100')
    })

    it('applies yellow badge for priority 3', () => {
        render(<AttentionList items={[makeItem({ priority: 3 })]} />)
        const badge = screen.getByText('Алерт КБЖУ')
        expect(badge.className).toContain('bg-yellow-100')
    })

    it('applies blue badge for priority 4-5', () => {
        render(<AttentionList items={[makeItem({ priority: 5 })]} />)
        const badge = screen.getByText('Алерт КБЖУ')
        expect(badge.className).toContain('bg-blue-100')
    })
})
