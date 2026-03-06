/**
 * Unit tests for settings page components
 * Tests that Next.js settings pages render their feature components
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

// Mock the feature components
jest.mock('@/features/settings', () => ({
    SettingsLocality: () => <div data-testid="settings-locality">SettingsLocality</div>,
    SettingsBody: () => <div data-testid="settings-body">SettingsBody</div>,
}))

jest.mock('@/features/settings/components/SettingsPageLayout', () => ({
    SettingsPageLayout: ({ title, children }: { title: string; children: () => React.ReactNode }) => (
        <div data-testid="settings-page-layout">
            <h1>{title}</h1>
            {children()}
        </div>
    ),
}))

jest.mock('@/features/settings/components/SettingsNotifications', () => ({
    SettingsNotifications: () => <div data-testid="settings-notifications">SettingsNotifications</div>,
}))

import SettingsProfilePage from '../settings/profile/page'
import SettingsBodyPage from '../settings/body/page'
import SettingsNotificationsPage from '../settings/notifications/page'

describe('Settings Pages', () => {
    describe('SettingsProfilePage', () => {
        it('renders SettingsLocality component', () => {
            render(<SettingsProfilePage />)
            expect(screen.getByTestId('settings-locality')).toBeInTheDocument()
        })
    })

    describe('SettingsBodyPage', () => {
        it('renders SettingsBody component', () => {
            render(<SettingsBodyPage />)
            expect(screen.getByTestId('settings-body')).toBeInTheDocument()
        })
    })

    describe('SettingsNotificationsPage', () => {
        it('renders SettingsNotifications inside layout', () => {
            render(<SettingsNotificationsPage />)
            expect(screen.getByTestId('settings-notifications')).toBeInTheDocument()
            expect(screen.getByText('Уведомления')).toBeInTheDocument()
        })
    })
})
