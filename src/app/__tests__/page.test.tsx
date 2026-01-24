import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Home from '../page'

describe('Home Page', () => {
    it('renders the heading', () => {
        render(<Home />)
        const heading = screen.getByText(/BURCEV Development/i)
        expect(heading).toBeTruthy()
    })

    it('renders the subtitle', () => {
        render(<Home />)
        const subtitle = screen.getByText(/Ready for development/i)
        expect(subtitle).toBeTruthy()
    })
})
