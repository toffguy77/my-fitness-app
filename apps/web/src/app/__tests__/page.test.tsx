import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Home from '../page'

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
