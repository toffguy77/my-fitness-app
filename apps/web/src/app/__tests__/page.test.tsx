import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Home from '../page'

jest.mock('@/shared/components/JsonLd', () => ({
    JsonLd: () => null,
}))

jest.mock('../_components/AuthRedirect', () => ({
    AuthRedirect: () => null,
}))

describe('Home Page', () => {
    it('renders the heading', () => {
        render(<Home />)
        const heading = screen.getByText(/Трекер питания и фитнеса/i)
        expect(heading).toBeTruthy()
    })

    // The landing page leads into the wizard, not into a registration form: the
    // calculation is the first useful thing here and it needs no account.
    it('leads with the calculation rather than the registration form', () => {
        render(<Home />)

        const cta = screen.getAllByText(/Рассчитать мою норму/i)[0]
        expect(cta.closest('a')).toHaveAttribute('href', '/onboarding')
    })

    it('still offers a direct route to registration', () => {
        render(<Home />)

        const register = screen.getByText(/Создать аккаунт/i)
        expect(register.closest('a')).toHaveAttribute('href', '/auth?mode=register')
    })
})
