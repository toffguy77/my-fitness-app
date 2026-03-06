/**
 * Unit tests for AuthFooter component
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { AuthFooter } from '../AuthFooter'

describe('AuthFooter', () => {
    it('renders help text', () => {
        render(<AuthFooter />)

        expect(screen.getByText(/Нужна помощь\?/)).toBeInTheDocument()
    })

    it('renders support email link', () => {
        render(<AuthFooter />)

        const link = screen.getByText('Связаться с нами')
        expect(link).toBeInTheDocument()
        expect(link).toHaveAttribute('href', 'mailto:support@burcev.team')
    })

    it('renders as a footer element', () => {
        render(<AuthFooter />)

        const footer = document.querySelector('footer')
        expect(footer).toBeTruthy()
    })
})
