import { render, screen } from '@testing-library/react'
import { CuratorLayout } from '../CuratorLayout'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/features/dashboard/components/DashboardHeader', () => ({
    DashboardHeader: (props: Record<string, unknown>) => (
        <div data-testid="dashboard-header" data-username={props.userName} />
    ),
}))

jest.mock('@/features/chat', () => ({
    WebSocketProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('../CuratorFooterNavigation', () => ({
    CuratorFooterNavigation: () => <nav data-testid="curator-footer-nav" />,
}))

describe('CuratorLayout', () => {
    it('renders children', () => {
        render(
            <CuratorLayout userName="Тест">
                <p>Child content</p>
            </CuratorLayout>
        )

        expect(screen.getByText('Child content')).toBeInTheDocument()
    })

    it('renders DashboardHeader with userName', () => {
        render(
            <CuratorLayout userName="Анна">
                <div />
            </CuratorLayout>
        )

        const header = screen.getByTestId('dashboard-header')
        expect(header).toHaveAttribute('data-username', 'Анна')
    })

    it('renders footer navigation', () => {
        render(
            <CuratorLayout userName="Тест">
                <div />
            </CuratorLayout>
        )

        expect(screen.getByTestId('curator-footer-nav')).toBeInTheDocument()
    })

    it('has data-testid on layout wrapper', () => {
        render(
            <CuratorLayout userName="Тест">
                <div />
            </CuratorLayout>
        )

        expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
    })

    it('has main content area', () => {
        render(
            <CuratorLayout userName="Тест">
                <div />
            </CuratorLayout>
        )

        expect(screen.getByTestId('curator-main-content')).toBeInTheDocument()
    })
})
