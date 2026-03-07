/**
 * Unit tests for legal page components
 * Tests that the privacy and terms pages render correctly
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

import PrivacyPage from '../legal/privacy/page'
import TermsPage from '../legal/terms/page'

describe('Legal Pages', () => {
    describe('PrivacyPage', () => {
        it('renders the privacy policy heading', () => {
            render(<PrivacyPage />)
            expect(screen.getByText('Политика конфиденциальности')).toBeInTheDocument()
        })

        it('renders the contact section', () => {
            render(<PrivacyPage />)
            expect(screen.getByText('11. Контактная информация')).toBeInTheDocument()
        })
    })

    describe('TermsPage', () => {
        it('renders the terms heading', () => {
            render(<TermsPage />)
            expect(screen.getByText('Договор публичной оферты')).toBeInTheDocument()
        })

        it('renders company details section', () => {
            render(<TermsPage />)
            expect(screen.getByText('8. Реквизиты Исполнителя')).toBeInTheDocument()
        })
    })
})
