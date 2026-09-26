/**
 * Unit tests for OfflineIndicator component
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflineIndicator } from '../OfflineIndicator';
import { useDashboardStore } from '../../store/dashboardStore';
import { getQueueSize } from '../../utils/offlineQueue';
import { dashboardStoreValue } from '../../testing/storeValue'

// Mock the dashboard store
jest.mock('../../store/dashboardStore');

// Mock the offline queue
jest.mock('../../utils/offlineQueue', () => ({
    getQueueSize: jest.fn(() => 0),
    addToQueue: jest.fn(),
    clearQueue: jest.fn(),
}));

const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>;
const mockGetQueueSize = getQueueSize as jest.MockedFunction<typeof getQueueSize>;

describe('OfflineIndicator', () => {
    const mockSyncWhenOnline = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
            isOffline: false,
            syncWhenOnline: mockSyncWhenOnline,
        }));

        mockGetQueueSize.mockReturnValue(0);
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    describe('Visibility', () => {
        it('should not render when online and no pending changes', () => {
            const { container } = render(<OfflineIndicator />);
            expect(container.firstChild).toBeNull();
        });

        it('should render when offline', () => {
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                isOffline: true,
                syncWhenOnline: mockSyncWhenOnline,
            }));

            render(<OfflineIndicator />);
            expect(screen.getByRole('status')).toBeInTheDocument();
            expect(screen.getByText('Нет подключения')).toBeInTheDocument();
        });

        it('should render when online but has pending changes', () => {
            mockGetQueueSize.mockReturnValue(3);

            render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(screen.getByRole('status')).toBeInTheDocument();
            expect(screen.getByText(/Синхронизация/)).toBeInTheDocument();
        });
    });

    describe('Offline state', () => {
        beforeEach(() => {
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                isOffline: true,
                syncWhenOnline: mockSyncWhenOnline,
            }));
        });

        it('should display offline icon', () => {
            render(<OfflineIndicator />);
            const icon = screen.getByRole('status').querySelector('svg');
            expect(icon).toBeInTheDocument();
        });

        it('should display red background when offline', () => {
            render(<OfflineIndicator />);
            const indicator = screen.getByRole('status').firstChild;
            expect(indicator).toHaveClass('bg-red-500');
        });

        it('should show pending changes count when offline', () => {
            mockGetQueueSize.mockReturnValue(5);

            render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(screen.getByText('5 изменений в очереди')).toBeInTheDocument();
        });

        it('should show singular form for 1 change', () => {
            mockGetQueueSize.mockReturnValue(1);

            render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(screen.getByText('1 изменение в очереди')).toBeInTheDocument();
        });

        it('should not show sync button when offline', () => {
            render(<OfflineIndicator />);
            expect(screen.queryByLabelText('Синхронизировать сейчас')).not.toBeInTheDocument();
        });
    });

    describe('Online state with pending changes', () => {
        beforeEach(() => {
            mockGetQueueSize.mockReturnValue(3);
        });

        it('should display online icon', () => {
            render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            const icon = screen.getByRole('status').querySelector('svg');
            expect(icon).toBeInTheDocument();
        });

        it('should display blue background when syncing', () => {
            render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            const indicator = screen.getByRole('status').firstChild;
            expect(indicator).toHaveClass('bg-blue-500');
        });

        it('should show sync button', () => {
            render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(screen.getByLabelText('Синхронизировать сейчас')).toBeInTheDocument();
        });

        it('should call syncWhenOnline when sync button clicked', async () => {
            const user = userEvent.setup({ delay: null });

            render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            const syncButton = screen.getByLabelText('Синхронизировать сейчас');
            await user.click(syncButton);

            expect(mockSyncWhenOnline).toHaveBeenCalledTimes(1);
        });

        it('should disable sync button while syncing', async () => {
            const user = userEvent.setup({ delay: null });
            mockSyncWhenOnline.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));

            render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            const syncButton = screen.getByLabelText('Синхронизировать сейчас');
            await user.click(syncButton);

            expect(syncButton).toBeDisabled();
        });

        it('should show spinning icon while syncing', async () => {
            const user = userEvent.setup({ delay: null });
            mockSyncWhenOnline.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));

            render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            const syncButton = screen.getByLabelText('Синхронизировать сейчас');
            await user.click(syncButton);

            const icon = syncButton.querySelector('svg');
            expect(icon).toHaveClass('animate-spin');
        });
    });

    describe('Queue size updates', () => {
        it('should update queue size periodically', () => {
            mockGetQueueSize.mockReturnValue(2);

            render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(screen.getByText(/Синхронизация \(2\)/)).toBeInTheDocument();

            // Update queue size
            mockGetQueueSize.mockReturnValue(5);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(screen.getByText(/Синхронизация \(5\)/)).toBeInTheDocument();
        });

        it('should hide indicator when queue becomes empty', () => {
            mockGetQueueSize.mockReturnValue(2);

            const { container } = render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(screen.getByRole('status')).toBeInTheDocument();

            // Clear queue
            mockGetQueueSize.mockReturnValue(0);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(container.firstChild).toBeNull();
        });
    });

    describe('Accessibility', () => {
        it('should have role="status"', () => {
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                isOffline: true,
                syncWhenOnline: mockSyncWhenOnline,
            }));

            render(<OfflineIndicator />);
            expect(screen.getByRole('status')).toBeInTheDocument();
        });

        it('should have aria-live="polite"', () => {
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                isOffline: true,
                syncWhenOnline: mockSyncWhenOnline,
            }));

            render(<OfflineIndicator />);
            const status = screen.getByRole('status');
            expect(status).toHaveAttribute('aria-live', 'polite');
        });

        it('should have aria-atomic="true"', () => {
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                isOffline: true,
                syncWhenOnline: mockSyncWhenOnline,
            }));

            render(<OfflineIndicator />);
            const status = screen.getByRole('status');
            expect(status).toHaveAttribute('aria-atomic', 'true');
        });

        it('should have aria-label on sync button', () => {
            mockGetQueueSize.mockReturnValue(3);

            render(<OfflineIndicator />);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            const syncButton = screen.getByLabelText('Синхронизировать сейчас');
            expect(syncButton).toBeInTheDocument();
        });

        it('should hide icons from screen readers', () => {
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                isOffline: true,
                syncWhenOnline: mockSyncWhenOnline,
            }));

            render(<OfflineIndicator />);
            const icons = screen.getByRole('status').querySelectorAll('svg');
            icons.forEach((icon) => {
                expect(icon).toHaveAttribute('aria-hidden', 'true');
            });
        });
    });

    describe('Custom className', () => {
        it('should apply custom className', () => {
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                isOffline: true,
                syncWhenOnline: mockSyncWhenOnline,
            }));

            render(<OfflineIndicator className="custom-class" />);
            const indicator = screen.getByRole('status');
            expect(indicator).toHaveClass('custom-class');
        });
    });
});
