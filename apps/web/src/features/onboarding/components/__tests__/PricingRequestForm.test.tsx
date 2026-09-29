/**
 * Заявка со страницы тарифов.
 *
 * Страница публичная, и у гостя адрес приходится спрашивать. У вошедшего — нет:
 * адрес уже есть, и спрашивать его заново значит предлагать опечатку.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PricingRequestForm } from '../PricingRequestForm'
import { guestApi } from '../../api/guest'
import { curatorAccessApi } from '@/shared/api/curatorAccess'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'
import { track } from '@/shared/analytics'

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, ...rest }: React.PropsWithChildren<{ href: string }>) => (
        <a href={href} {...rest}>{children}</a>
    ),
}))

jest.mock('../../api/guest', () => ({
    guestApi: { createLead: jest.fn() },
}))

jest.mock('@/shared/api/curatorAccess', () => ({
    curatorAccessApi: { getAccess: jest.fn(), requestCurator: jest.fn() },
}))

jest.mock('@/shared/hooks/useCurrentUser', () => ({
    useCurrentUser: jest.fn(),
}))

jest.mock('@/shared/analytics', () => ({
    track: jest.fn(),
    storedAttribution: () => ({}),
    EVENTS: jest.requireActual('@/shared/analytics/events').EVENTS,
}))

const mockGuest = guestApi as jest.Mocked<typeof guestApi>
const mockAccess = curatorAccessApi as jest.Mocked<typeof curatorAccessApi>
const mockUser = useCurrentUser as jest.MockedFunction<typeof useCurrentUser>
const mockTrack = track as jest.MockedFunction<typeof track>

describe('PricingRequestForm — гость', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockUser.mockReturnValue({ user: null, state: 'anonymous' })
    })

    it('сохраняет заявку с точкой захвата pricing', async () => {
        mockGuest.createLead.mockResolvedValue({
            token: 't',
            lead: {
                id: '1',
                email: 'a@b.test',
                // Параметров тела заявка со страницы тарифов не несёт: заявка на
                // услугу не требует ни роста, ни веса.
                parameters: {
                    sex: '',
                    birth_date: '',
                    height_cm: null,
                    weight_kg: null,
                    activity_level: 'moderate',
                    goal: 'maintain',
                },
                last_step: 'pricing',
            },
        })

        render(<PricingRequestForm />)
        fireEvent.change(screen.getByLabelText('Электронная почта'), {
            target: { value: 'guest@example.test' },
        })
        fireEvent.click(screen.getByLabelText(/Согласен на обработку персональных данных/))
        fireEvent.click(screen.getByRole('button', { name: 'Оставить заявку' }))

        await waitFor(() => {
            expect(mockGuest.createLead).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'guest@example.test',
                    capture_source: 'pricing',
                    consents: { data_processing: true, contact: true },
                }),
            )
        })
        expect(mockTrack).toHaveBeenCalledWith('lead_saved', {
            contact_consent: true,
            capture_source: 'pricing',
        })
        expect(screen.getByText('Заявка отправлена — мы свяжемся с вами')).toBeInTheDocument()
    })

    // Галочка, поставленная за человека, согласием не является, а сервер без
    // согласия откажет — значит отказать нужно раньше и понятнее.
    it('не отправляет заявку без согласия', async () => {
        render(<PricingRequestForm />)
        fireEvent.change(screen.getByLabelText('Электронная почта'), {
            target: { value: 'guest@example.test' },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Оставить заявку' }))

        await waitFor(() => {
            expect(
                screen.getByText('Без согласия на обработку данных заявку сохранить нельзя'),
            ).toBeInTheDocument()
        })
        expect(mockGuest.createLead).not.toHaveBeenCalled()
    })

    it('не отправляет заявку без адреса', async () => {
        render(<PricingRequestForm />)
        fireEvent.click(screen.getByLabelText(/Согласен на обработку персональных данных/))
        fireEvent.click(screen.getByRole('button', { name: 'Оставить заявку' }))

        await waitFor(() => {
            expect(screen.getByText('Укажите адрес электронной почты')).toBeInTheDocument()
        })
        expect(mockGuest.createLead).not.toHaveBeenCalled()
    })

    it('сообщает о неудаче, а не молчит', async () => {
        mockGuest.createLead.mockRejectedValue(new Error('нет сети'))

        render(<PricingRequestForm />)
        fireEvent.change(screen.getByLabelText('Электронная почта'), {
            target: { value: 'guest@example.test' },
        })
        fireEvent.click(screen.getByLabelText(/Согласен на обработку персональных данных/))
        fireEvent.click(screen.getByRole('button', { name: 'Оставить заявку' }))

        await waitFor(() => {
            expect(
                screen.getByText('Не удалось отправить заявку. Попробуйте снова.'),
            ).toBeInTheDocument()
        })
    })
})

describe('PricingRequestForm — вошедший', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockUser.mockReturnValue({
            user: { id: 1, email: 'client@example.test', name: 'Клиент' } as never,
            state: 'ready',
        })
    })

    it('не спрашивает адрес заново', () => {
        render(<PricingRequestForm />)

        expect(screen.queryByLabelText('Электронная почта')).not.toBeInTheDocument()
        expect(
            screen.queryByLabelText(/Согласен на обработку персональных данных/),
        ).not.toBeInTheDocument()
    })

    it('отправляет заявку через учётную запись, с той же точкой захвата', async () => {
        mockAccess.requestCurator.mockResolvedValue({ id: 5 })

        render(<PricingRequestForm />)
        fireEvent.click(screen.getByRole('button', { name: 'Оставить заявку' }))

        await waitFor(() => {
            expect(mockAccess.requestCurator).toHaveBeenCalledWith('pricing')
        })
        expect(mockGuest.createLead).not.toHaveBeenCalled()
        expect(screen.getByText('Заявка отправлена — мы свяжемся с вами')).toBeInTheDocument()
    })
})
