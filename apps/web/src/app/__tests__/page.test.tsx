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

    it('renders the CTA link', () => {
        render(<Home />)
        const link = screen.getByText(/Начать бесплатно/i)
        expect(link).toBeTruthy()
    })
})
