import { render, screen } from '@testing-library/react'

import UnsubscribePage from '../page'
import * as deliveryApi from '@/features/notifications/api/deliveryApi'

const searchParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
    useSearchParams: () => searchParams,
}))

jest.mock('@/features/notifications/api/deliveryApi', () => ({
    unsubscribeFromEmail: jest.fn(),
}))

const unsubscribe = deliveryApi.unsubscribeFromEmail as jest.Mock

beforeEach(() => {
    jest.clearAllMocks()
    searchParams.delete('token')
})

describe('the unsubscribe page', () => {
    it('unsubscribes with the token in the link, without a session', async () => {
        searchParams.set('token', 'a.b.c')
        unsubscribe.mockResolvedValue(undefined)

        render(<UnsubscribePage />)

        expect(await screen.findByText('Писем больше не будет')).toBeInTheDocument()
        expect(unsubscribe).toHaveBeenCalledWith('a.b.c')
    })

    it('says the transactional mail keeps coming, because it does', async () => {
        searchParams.set('token', 'a.b.c')
        unsubscribe.mockResolvedValue(undefined)

        render(<UnsubscribePage />)

        expect(await screen.findByText(/восстановлении пароля/)).toBeInTheDocument()
    })

    it('points at the settings when the link has expired', async () => {
        searchParams.set('token', 'stale')
        unsubscribe.mockRejectedValue(new Error('gone'))

        render(<UnsubscribePage />)

        expect(await screen.findByText('Ссылка не сработала')).toBeInTheDocument()
    })

    it('does not call the API at all when the link carries no token', async () => {
        render(<UnsubscribePage />)

        expect(await screen.findByText('Ссылка не сработала')).toBeInTheDocument()
        expect(unsubscribe).not.toHaveBeenCalled()
    })
})
