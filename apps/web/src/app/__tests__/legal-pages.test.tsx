/**
 * Unit tests for legal page components
 * Tests that the privacy and terms pages render correctly
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

import PrivacyPage, { metadata as privacyMetadata } from '../legal/privacy/page'
import TermsPage, { metadata as termsMetadata } from '../legal/terms/page'

describe('Legal Pages', () => {
    // Без своего canonical страницы наследовали адрес главной из layout и
    // объявляли себя её копиями.
    it.each([
        ['terms', termsMetadata, 'https://burcev.team/legal/terms'],
        ['privacy', privacyMetadata, 'https://burcev.team/legal/privacy'],
    ])('%s names its own address as canonical', (_name, metadata, url) => {
        expect(metadata.alternates?.canonical).toBe(url)
    })

    // Шаблон «%s | BURCEV» дописывает бренд сам.
    it.each([
        ['terms', termsMetadata],
        ['privacy', privacyMetadata],
    ])('%s does not repeat the brand in its title', (_name, metadata) => {
        expect(String(metadata.title)).not.toContain('BURCEV')
    })

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
