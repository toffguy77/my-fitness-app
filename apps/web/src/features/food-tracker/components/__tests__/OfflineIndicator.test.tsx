/**
 * OfflineIndicator Component Tests
 *
 * Tests for offline status display and sync functionality.
 *
 * @module food-tracker/components/__tests__/OfflineIndicator
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OfflineIndicator } from '../OfflineIndicator';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('../../hooks/useOnlineStatus', () => ({
    useOnlineStatus: jest.fn(),
}));

const mockUseOnlineStatus = useOnlineStatus as jest.MockedFunction<typeof useOnlineStatus>;

// ============================================================================
// Test Setup
// ============================================================================

describe('OfflineIndicator', () => {
    const mockSyncNow = jest.fn().mockResolvedValue(undefined);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ============================================================================
    // Visibility Tests
    // ============================================================================

    describe('Visibility', () => {
        it('does not render when online with no pending operations', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 0,
                syncNow: mockSyncNow,
            });

            const { container } = render(<OfflineIndicator />);

            expect(container.firstChild).toBeNull();
        });

        it('renders when offline', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: false,
                isOffline: true,
                pendingOperationsCount: 0,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByRole('alert')).toBeInTheDocument();
        });

        it('renders when online with pending operations', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 3,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByRole('alert')).toBeInTheDocument();
        });
    });

    // ============================================================================
    // Message Display Tests
    // ============================================================================

    describe('Message Display', () => {
        it('displays offline message in Russian when offline', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: false,
                isOffline: true,
                pendingOperationsCount: 0,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByText('Нет подключения к интернету')).toBeInTheDocument();
        });

        it('displays pending operations count with correct Russian plural (1 операция)', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 1,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByText(/1 операция ожидают синхронизации/)).toBeInTheDocument();
        });

        it('displays pending operations count with correct Russian plural (2 операции)', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 2,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByText(/2 операции ожидают синхронизации/)).toBeInTheDocument();
        });

        it('displays pending operations count with correct Russian plural (5 операций)', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 5,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByText(/5 операций ожидают синхронизации/)).toBeInTheDocument();
        });

        it('displays pending operations count with correct Russian plural (11 операций)', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 11,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByText(/11 операций ожидают синхронизации/)).toBeInTheDocument();
        });

        it('displays pending operations count with correct Russian plural (21 операция)', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 21,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByText(/21 операция ожидают синхронизации/)).toBeInTheDocument();
        });
    });

    // ============================================================================
    // Sync Button Tests
    // ============================================================================

    describe('Sync Button', () => {
        it('shows sync button when online with pending operations', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 3,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByRole('button', { name: /синхронизировать/i })).toBeInTheDocument();
        });

        it('does not show sync button when offline', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: false,
                isOffline: true,
                pendingOperationsCount: 3,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.queryByRole('button', { name: /синхронизировать/i })).not.toBeInTheDocument();
        });

        it('calls syncNow when sync button is clicked', async () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 3,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            const syncButton = screen.getByRole('button', { name: /синхронизировать/i });
            fireEvent.click(syncButton);

            await waitFor(() => {
                expect(mockSyncNow).toHaveBeenCalled();
            });
        });

        it('disables sync button while syncing', async () => {
            // Make syncNow take some time
            const slowSyncNow = jest.fn().mockImplementation(
                () => new Promise((resolve) => setTimeout(resolve, 100))
            );

            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 3,
                syncNow: slowSyncNow,
            });

            render(<OfflineIndicator />);

            const syncButton = screen.getByRole('button', { name: /синхронизировать/i });
            fireEvent.click(syncButton);

            // Button should be disabled during sync
            await waitFor(() => {
                expect(syncButton).toBeDisabled();
            });
        });
    });

    // ============================================================================
    // Accessibility Tests
    // ============================================================================

    describe('Accessibility', () => {
        it('has role="alert" for screen readers', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: false,
                isOffline: true,
                pendingOperationsCount: 0,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByRole('alert')).toBeInTheDocument();
        });

        it('has aria-live="polite" for announcements', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: false,
                isOffline: true,
                pendingOperationsCount: 0,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
        });

        it('sync button has accessible label', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 3,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            expect(screen.getByRole('button', { name: /синхронизировать данные/i })).toBeInTheDocument();
        });
    });

    // ============================================================================
    // Responsive Design Tests
    // ============================================================================

    describe('Responsive Design', () => {
        it('has responsive padding classes', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: false,
                isOffline: true,
                pendingOperationsCount: 0,
                syncNow: mockSyncNow,
            });

            const { container } = render(<OfflineIndicator />);

            const innerDiv = container.querySelector('.max-w-2xl');
            expect(innerDiv).toHaveClass('px-3', 'sm:px-4');
        });

        it('has responsive text size classes', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: false,
                isOffline: true,
                pendingOperationsCount: 0,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            const message = screen.getByText('Нет подключения к интернету');
            expect(message).toHaveClass('text-xs', 'sm:text-sm');
        });

        it('sync button has touch-manipulation class', () => {
            mockUseOnlineStatus.mockReturnValue({
                isOnline: true,
                isOffline: false,
                pendingOperationsCount: 3,
                syncNow: mockSyncNow,
            });

            render(<OfflineIndicator />);

            const syncButton = screen.getByRole('button', { name: /синхронизировать/i });
            expect(syncButton).toHaveClass('touch-manipulation');
        });
    });
});
