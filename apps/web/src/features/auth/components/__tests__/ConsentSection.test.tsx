/**
 * Unit tests for ConsentSection component
 * Tests consent checkboxes, error display, and links
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConsentSection } from '../ConsentSection'
import type { ConsentState } from '@/features/auth/types'

// Mock next/link
jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>{children}</a>
    ),
}))

describe('ConsentSection', () => {
    const defaultConsents: ConsentState = {
        terms_of_service: false,
        privacy_policy: false,
        data_processing: false,
        marketing: false,
    }

    const defaultProps = {
        consents: defaultConsents,
        setConsents: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders all four consent checkboxes', () => {
        render(<ConsentSection {...defaultProps} />)

        expect(screen.getByText(/Договор публичной оферты/)).toBeInTheDocument()
        expect(screen.getByText(/Политику конфиденциальности/)).toBeInTheDocument()
        expect(screen.getByText(/обработку персональных данных/)).toBeInTheDocument()
        expect(screen.getByText(/маркетинговые материалы/)).toBeInTheDocument()
    })

    it('renders intro text', () => {
        render(<ConsentSection {...defaultProps} />)

        expect(
            screen.getByText('Для регистрации необходимо принять соглашения:')
        ).toBeInTheDocument()
    })

    it('renders required fields note', () => {
        render(<ConsentSection {...defaultProps} />)

        expect(screen.getByText('* Обязательные поля')).toBeInTheDocument()
    })

    it('renders links to legal pages', () => {
        render(<ConsentSection {...defaultProps} />)

        const termsLink = screen.getByText('Договор публичной оферты')
        expect(termsLink.closest('a')).toHaveAttribute('href', '/legal/terms')

        const privacyLink = screen.getByText('Политику конфиденциальности')
        expect(privacyLink.closest('a')).toHaveAttribute('href', '/legal/privacy')
    })

    it('calls setConsents when checkbox is toggled', () => {
        const setConsents = jest.fn()
        render(<ConsentSection {...defaultProps} setConsents={setConsents} />)

        const checkboxes = screen.getAllByRole('checkbox')
        fireEvent.click(checkboxes[0]) // terms_of_service

        expect(setConsents).toHaveBeenCalledWith({
            ...defaultConsents,
            terms_of_service: true,
        })
    })

    it('shows error message when provided', () => {
        render(<ConsentSection {...defaultProps} error="Please accept all required consents" />)

        expect(screen.getByText('Please accept all required consents')).toBeInTheDocument()
        expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('does not show error when not provided', () => {
        render(<ConsentSection {...defaultProps} />)

        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('reflects checked state from consents prop', () => {
        const consents: ConsentState = {
            terms_of_service: true,
            privacy_policy: true,
            data_processing: false,
            marketing: false,
        }

        render(<ConsentSection {...defaultProps} consents={consents} />)

        const checkboxes = screen.getAllByRole('checkbox')
        expect(checkboxes[0]).toBeChecked()
        expect(checkboxes[1]).toBeChecked()
        expect(checkboxes[2]).not.toBeChecked()
        expect(checkboxes[3]).not.toBeChecked()
    })

    it('marks marketing as optional', () => {
        render(<ConsentSection {...defaultProps} />)

        expect(screen.getByText(/необязательно/)).toBeInTheDocument()
    })
})
