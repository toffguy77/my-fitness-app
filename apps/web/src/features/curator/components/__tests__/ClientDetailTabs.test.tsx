import { render, screen, fireEvent } from '@testing-library/react'

const mockPush = jest.fn()
const mockPathname = '/curator/clients/1'
let mockSearchParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
    usePathname: () => mockPathname,
    useSearchParams: () => mockSearchParams,
}))

import { ClientDetailTabs } from '../ClientDetailTabs'

describe('ClientDetailTabs', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockSearchParams = new URLSearchParams()
    })

    it('renders all five tabs', () => {
        render(<ClientDetailTabs />)
        expect(screen.getByText('Обзор')).toBeInTheDocument()
        expect(screen.getByText('План')).toBeInTheDocument()
        expect(screen.getByText('Задачи')).toBeInTheDocument()
        expect(screen.getByText('Отчёты')).toBeInTheDocument()
        expect(screen.getByText('Питание')).toBeInTheDocument()
    })

    it('the Nutrition tab carries its own address', () => {
        render(<ClientDetailTabs />)
        fireEvent.click(screen.getByText('Питание'))
        expect(mockPush).toHaveBeenCalledWith(`${mockPathname}?tab=nutrition`)
    })

    it('highlights overview tab by default', () => {
        render(<ClientDetailTabs />)
        const btn = screen.getByText('Обзор')
        expect(btn).toHaveAttribute('aria-current', 'page')
    })

    it('highlights active tab from activeTab prop', () => {
        render(<ClientDetailTabs activeTab="tasks" />)
        const btn = screen.getByText('Задачи')
        expect(btn).toHaveAttribute('aria-current', 'page')
        const overview = screen.getByText('Обзор')
        expect(overview).not.toHaveAttribute('aria-current')
    })

    it('navigates to tab on click', () => {
        render(<ClientDetailTabs />)
        fireEvent.click(screen.getByText('План'))
        expect(mockPush).toHaveBeenCalledWith(`${mockPathname}?tab=plan`)
    })

    it('removes tab param when clicking overview', () => {
        mockSearchParams = new URLSearchParams('tab=plan')
        render(<ClientDetailTabs />)
        fireEvent.click(screen.getByText('Обзор'))
        expect(mockPush).toHaveBeenCalledWith(mockPathname)
    })
})
