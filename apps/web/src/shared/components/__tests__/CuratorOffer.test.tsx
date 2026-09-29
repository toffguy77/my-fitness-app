import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { CuratorOffer } from '../CuratorOffer'
import { curatorAccessApi } from '@/shared/api/curatorAccess'
import { track } from '@/shared/analytics'
import toast from 'react-hot-toast'

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, ...rest }: React.PropsWithChildren<{ href: string }>) => (
        <a href={href} {...rest}>{children}</a>
    ),
}))

jest.mock('@/shared/api/curatorAccess', () => ({
    curatorAccessApi: { getAccess: jest.fn(), requestCurator: jest.fn() },
}))

jest.mock('@/shared/analytics', () => ({
    track: jest.fn(),
    EVENTS: jest.requireActual('@/shared/analytics/events').EVENTS,
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: { success: jest.fn(), error: jest.fn() },
}))

const mockApi = curatorAccessApi as jest.Mocked<typeof curatorAccessApi>
const mockTrack = track as jest.MockedFunction<typeof track>
const mockToast = toast as unknown as { success: jest.Mock; error: jest.Mock }

describe('CuratorOffer', () => {
    beforeEach(() => jest.clearAllMocks())

    it('называет состав услуги, а не только цену', () => {
        render(<CuratorOffer place="chat" />)

        expect(screen.getByText('Переписка с куратором')).toBeInTheDocument()
        expect(screen.getByText('Недельный план КБЖУ')).toBeInTheDocument()
        expect(screen.getByText('Письменный разбор недели')).toBeInTheDocument()
    })

    // Цена живёт на одной странице: повторённое число расходится, и какое из двух
    // обязательство — неизвестно.
    it('ведёт на страницу тарифов и не называет цену числом', () => {
        const { container } = render(<CuratorOffer place="chat" />)

        expect(screen.getByText('Сколько стоит').closest('a')).toHaveAttribute('href', '/pricing')
        expect(container.textContent).not.toMatch(/\d\s*₽/)
    })

    it('различает предложение купить и предложение продлить', () => {
        const { rerender } = render(<CuratorOffer place="chat" />)
        expect(screen.getByText('Оставить заявку')).toBeInTheDocument()

        rerender(<CuratorOffer place="chat" expired expiresAt="2026-09-01" />)
        expect(screen.getByText('Продлить доступ')).toBeInTheDocument()
        expect(screen.getByText('Доступ действовал до 2026-09-01')).toBeInTheDocument()
    })

    // Без этих событий решение о цене и о составе платной части принимается на
    // глаз: сколько людей вообще хочет куратора — неизвестно.
    it('записывает показ один раз, с указанием места', () => {
        const { rerender } = render(<CuratorOffer place="dashboard" />)
        rerender(<CuratorOffer place="dashboard" />)

        const shown = mockTrack.mock.calls.filter(([name]) => name === 'curator_offer_shown')
        expect(shown).toHaveLength(1)
        expect(shown[0][1]).toEqual({ place: 'dashboard' })
    })

    it('записывает переход к заявке и отправляет её с точкой захвата', async () => {
        mockApi.requestCurator.mockResolvedValue({ id: 7 })

        render(<CuratorOffer place="chat" />)
        fireEvent.click(screen.getByText('Оставить заявку'))

        await waitFor(() => {
            expect(mockApi.requestCurator).toHaveBeenCalledWith('curator_offer_chat')
            expect(mockToast.success).toHaveBeenCalledWith('Заявка отправлена — мы свяжемся с вами')
        })
        expect(mockTrack).toHaveBeenCalledWith('curator_offer_clicked', { place: 'chat' })
    })

    it('не отправляет заявку дважды', async () => {
        mockApi.requestCurator.mockResolvedValue({ id: 7 })

        render(<CuratorOffer place="dashboard" />)
        fireEvent.click(screen.getByText('Оставить заявку'))

        await waitFor(() => {
            expect(screen.getByText('Заявка отправлена — мы свяжемся с вами')).toBeDisabled()
        })
        expect(mockApi.requestCurator).toHaveBeenCalledTimes(1)
    })

    it('сообщает о неудаче отправки, а не молчит', async () => {
        mockApi.requestCurator.mockRejectedValue(new Error('нет сети'))

        render(<CuratorOffer place="chat" />)
        fireEvent.click(screen.getByText('Оставить заявку'))

        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalled()
        })
        // Кнопка снова доступна: неудача не должна выглядеть как отправленная
        // заявка.
        expect(screen.getByText('Оставить заявку')).not.toBeDisabled()
    })

    it('в компактном виде не перечисляет состав услуги', () => {
        render(<CuratorOffer place="dashboard" compact />)

        expect(screen.queryByText('Недельный план КБЖУ')).not.toBeInTheDocument()
        expect(screen.getByText('Оставить заявку')).toBeInTheDocument()
    })
})
