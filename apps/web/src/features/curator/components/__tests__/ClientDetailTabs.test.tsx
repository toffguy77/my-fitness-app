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

    it('renders all four tabs', () => {
        render(<ClientDetailTabs />)
        expect(screen.getByText('Обзор')).toBeInTheDocument()
        expect(screen.getByText('План')).toBeInTheDocument()
        expect(screen.getByText('Задачи')).toBeInTheDocument()
        expect(screen.getByText('Отчёты')).toBeInTheDocument()
    })

    it('highlights overview tab by default', () => {
        render(<ClientDetailTabs />)
        const btn = screen.getByText('Обзор')
        expect(btn.className).toContain('border-blue-600')
    })

    it('highlights active tab from activeTab prop', () => {
        render(<ClientDetailTabs activeTab="tasks" />)
        const btn = screen.getByText('Задачи')
        expect(btn.className).toContain('border-blue-600')
        const overview = screen.getByText('Обзор')
        expect(overview.className).not.toContain('border-blue-600')
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
