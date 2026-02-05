/**
 * Unit tests for weekly report and photo upload actions
 * Tests error handling and rollback behavior
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardStore } from '../dashboardStore';
import { apiClient } from '@/shared/utils/api-client';
import toast from 'react-hot-toast';

// Mock API client
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
    },
}));

// Mock config
jest.mock('@/config/api', () => ({
    getApiUrl: (path: string) => `http://localhost:4000${path}`,
}));

// Mock toast
jest.mock('react-hot-toast', () => {
    const mockToast = {
        success: jest.fn(),
        error: jest.fn(),
    };
    return {
        __esModule: true,
        default: mockToast,
    };
});

// Mock fetch for photo upload
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();

Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true,
});

describe('Dashboard Store - Weekly Report and Photo Actions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorageMock.clear();

        // Reset store
        const { result } = renderHook(() => useDashboardStore());
        act(() => {
            result.current.reset();
        });
    });

    describe('submitWeeklyReport', () => {
        it('submits weekly report successfully', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const weekStart = new Date('2024-01-01');
            const weekEnd = new Date('2024-01-07');

            (apiClient.post as jest.Mock).mockResolvedValue({
                data: {
                    id: 'report-1',
                    userId: 'user-1',
                    weekStart: '2024-01-01',
                    weekEnd: '2024-01-07',
                    submittedAt: new Date(),
                },
            });

            await act(async () => {
                await result.current.submitWeeklyReport(weekStart, weekEnd);
            });

            expect(apiClient.post).toHaveBeenCalledWith(
                'http://localhost:4000/dashboard/weekly-report',
                {
                    weekStart: '2024-01-01',
                    weekEnd: '2024-01-07',
                }
            );

            expect(toast.success).toHaveBeenCalledWith('Отчет успешно отправлен');
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('handles submission error with proper error message', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const weekStart = new Date('2024-01-01');
            const weekEnd = new Date('2024-01-07');

            (apiClient.post as jest.Mock).mockRejectedValue({
                response: {
                    status: 400,
                    data: { message: 'Недостаточно данных для отчета' },
                },
            });

            await act(async () => {
                try {
                    await result.current.submitWeeklyReport(weekStart, weekEnd);
                } catch (error) {
                    // Expected error
                }
            });

            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toEqual({
                code: 'VALIDATION_ERROR',
                message: 'Недостаточно данных для отчета',
            });
            expect(toast.error).toHaveBeenCalledWith('Недостаточно данных для отчета');
        });

        it('handles network error during submission', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const weekStart = new Date('2024-01-01');
            const weekEnd = new Date('2024-01-07');

            (apiClient.post as jest.Mock).mockRejectedValue(
                new TypeError('Failed to fetch')
            );

            await act(async () => {
                try {
                    await result.current.submitWeeklyReport(weekStart, weekEnd);
                } catch (error) {
                    // Expected error
                }
            });

            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toEqual({
                code: 'NETWORK_ERROR',
                message: 'Проверьте подключение к интернету',
            });
            expect(result.current.isOffline).toBe(true);
        });

        it('retries on server error', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const weekStart = new Date('2024-01-01');
            const weekEnd = new Date('2024-01-07');

            // Fail twice, then succeed
            (apiClient.post as jest.Mock)
                .mockRejectedValueOnce({
                    response: { status: 500 },
                })
                .mockRejectedValueOnce({
                    response: { status: 500 },
                })
                .mockResolvedValueOnce({
                    data: {
                        id: 'report-1',
                        userId: 'user-1',
                        weekStart: '2024-01-01',
                        weekEnd: '2024-01-07',
                        submittedAt: new Date(),
                    },
                });

            await act(async () => {
                await result.current.submitWeeklyReport(weekStart, weekEnd);
            });

            // Should have retried 3 times total
            expect(apiClient.post).toHaveBeenCalledTimes(3);
            expect(toast.success).toHaveBeenCalledWith('Отчет успешно отправлен');
            expect(result.current.error).toBeNull();
        });
    });

    describe('uploadPhoto', () => {
        it('uploads photo successfully', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
            const weekIdentifier = '2024-W01';

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: {
                        id: 'photo-1',
                        userId: 'user-1',
                        weekIdentifier: '2024-W01',
                        photoUrl: 'https://example.com/photo.jpg',
                        uploadedAt: new Date(),
                    },
                }),
            });

            await act(async () => {
                await result.current.uploadPhoto(weekIdentifier, file);
            });

            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:4000/dashboard/photo-upload',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.any(FormData),
                })
            );

            expect(toast.success).toHaveBeenCalledWith('Фото успешно загружено');
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('handles upload error with proper error message', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
            const weekIdentifier = '2024-W01';

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 400,
            });

            await act(async () => {
                try {
                    await result.current.uploadPhoto(weekIdentifier, file);
                } catch (error) {
                    // Expected error
                }
            });

            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeDefined();
            expect(toast.error).toHaveBeenCalled();
        });

        it('handles network error during upload', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
            const weekIdentifier = '2024-W01';

            (global.fetch as jest.Mock).mockRejectedValue(
                new TypeError('Failed to fetch')
            );

            await act(async () => {
                try {
                    await result.current.uploadPhoto(weekIdentifier, file);
                } catch (error) {
                    // Expected error
                }
            });

            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toEqual({
                code: 'NETWORK_ERROR',
                message: 'Проверьте подключение к интернету',
            });
            expect(result.current.isOffline).toBe(true);
        });

        it('includes auth token in upload request', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
            const weekIdentifier = '2024-W01';

            localStorageMock.setItem('auth_token', 'test-token');

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ data: {} }),
            });

            await act(async () => {
                await result.current.uploadPhoto(weekIdentifier, file);
            });

            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:4000/dashboard/photo-upload',
                expect.objectContaining({
                    headers: {
                        Authorization: 'Bearer test-token',
                    },
                })
            );
        });
    });

    describe('Error handling and rollback', () => {
        it('clears error state when clearError is called', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // Trigger an error by making a failed API call
            (apiClient.post as jest.Mock).mockRejectedValue({
                response: { status: 400, data: { message: 'Test error' } },
            });

            await act(async () => {
                try {
                    await result.current.submitWeeklyReport(
                        new Date('2024-01-01'),
                        new Date('2024-01-07')
                    );
                } catch (error) {
                    // Expected
                }
            });

            expect(result.current.error).toBeDefined();
            expect(result.current.error?.code).toBe('VALIDATION_ERROR');

            // Clear error
            act(() => {
                result.current.clearError();
            });

            expect(result.current.error).toBeNull();
        });

        it('sets offline status when network error occurs', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const weekStart = new Date('2024-01-01');
            const weekEnd = new Date('2024-01-07');

            (apiClient.post as jest.Mock).mockRejectedValue(
                new TypeError('Network error')
            );

            await act(async () => {
                try {
                    await result.current.submitWeeklyReport(weekStart, weekEnd);
                } catch (error) {
                    // Expected
                }
            });

            expect(result.current.isOffline).toBe(true);
            expect(result.current.error?.code).toBe('NETWORK_ERROR');
        });

        it('does not retry on client errors (4xx)', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const weekStart = new Date('2024-01-01');
            const weekEnd = new Date('2024-01-07');

            (apiClient.post as jest.Mock).mockRejectedValue({
                response: { status: 400 },
            });

            await act(async () => {
                try {
                    await result.current.submitWeeklyReport(weekStart, weekEnd);
                } catch (error) {
                    // Expected
                }
            });

            // Should only be called once (no retries for 4xx)
            expect(apiClient.post).toHaveBeenCalledTimes(1);
        });
    });
});
