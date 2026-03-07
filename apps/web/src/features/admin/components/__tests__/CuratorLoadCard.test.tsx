import { render, screen } from '@testing-library/react'
import { CuratorLoadCard } from '../CuratorLoadCard'
import type { CuratorLoad } from '../../types'

function makeCurator(overrides: Partial<CuratorLoad> = {}): CuratorLoad {
    return {
        id: 1,
        name: 'Мария Иванова',
        email: 'maria@example.com',
        client_count: 5,
        ...overrides,
    }
}

describe('CuratorLoadCard', () => {
    it('renders curator name, email, and client count', () => {
        const curator = makeCurator()
        render(<CuratorLoadCard curator={curator} />)

        expect(screen.getByText('Мария Иванова')).toBeInTheDocument()
        expect(screen.getByText('maria@example.com')).toBeInTheDocument()
        expect(screen.getByText('5')).toBeInTheDocument()
        expect(screen.getByText('клиентов')).toBeInTheDocument()
    })

    it('shows avatar image when avatar_url is present', () => {
        const curator = makeCurator({ avatar_url: 'https://example.com/avatar.jpg' })
        render(<CuratorLoadCard curator={curator} />)

        const img = screen.getByRole('img', { name: 'Мария Иванова' })
        expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    })

    it('shows initials when no avatar_url', () => {
        const curator = makeCurator({ name: 'Мария Иванова', avatar_url: undefined })
        render(<CuratorLoadCard curator={curator} />)

        expect(screen.getByText('МИ')).toBeInTheDocument()
        expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('handles single-word names for initials', () => {
        const curator = makeCurator({ name: 'Admin' })
        render(<CuratorLoadCard curator={curator} />)

        expect(screen.getByText('A')).toBeInTheDocument()
    })

    it('has correct data-testid based on curator id', () => {
        const curator = makeCurator({ id: 42 })
        render(<CuratorLoadCard curator={curator} />)

        expect(screen.getByTestId('curator-load-card-42')).toBeInTheDocument()
    })
})
