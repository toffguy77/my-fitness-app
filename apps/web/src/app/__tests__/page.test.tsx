import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Home from '../page'

jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        prefetch: jest.fn(),
    }),
}))

jest.mock('@/shared/utils/token-storage', () => ({
    isAuthenticated: () => false,
}))

describe('Home Page', () => {
    it('renders the heading', () => {
        render(<Home />)
        const heading = screen.getByText(/Питание под контролем/i)
        expect(heading).toBeTruthy()
    })

    it('renders the CTA link', () => {
        render(<Home />)
        const link = screen.getByText(/Начать бесплатно/i)
        expect(link).toBeTruthy()
    })
})
