/**
 * Tests for useUnsavedData hook
 */

import { renderHook, act } from '@testing-library/react';
import { useUnsavedData } from '../useUnsavedData';
import type { MetricUpdate } from '../../types';

describe('useUnsavedData', () => {
    const UNSAVED_DATA_KEY = 'dashboard_unsaved_data';

    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('initializes with empty unsaved data', () => {
        const { result } = renderHook(() => useUnsavedData());

        expect(result.current.unsavedData).toEqual([]);
        expect(result.current.unsavedCount).toBe(0);
        expect(result.current.isLoading).toBe(false);
    });

    it('loads unsaved data from localStorage on mount', () => {
        const mockData = [
            {
                date: '2024-01-15',
                metric: { type: 'weight', data: { weight: 75 } } as MetricUpdate,
                timestamp: Date.now(),
                attempts: 1,
            },
        ];

        localStorage.setItem(UNSAVED_DATA_KEY, JSON.stringify(mockData));

        const { result } = renderHook(() => useUnsavedData());

        expect(result.current.unsavedData).toHaveLength(1);
        expect(result.current.unsavedCount).toBe(1);
        expect(result.current.unsavedData[0].date).toBe('2024-01-15');
    });

    it('filters out expired entries on load', () => {
        const now = Date.now();
        const expired = now - 25 * 60 * 60 * 1000; // 25 hours ago

        const mockData = [
            {
                date: '2024-01-15',
                metric: { type: 'weight', data: { weight: 75 } } as MetricUpdate,
                timestamp: now,
                attempts: 1,
            },
            {
                date: '2024-01-14',
                metric: { type: 'weight', data: { weight: 74 } } as MetricUpdate,
                timestamp: expired,
                attempts: 1,
            },
        ];

        localStorage.setItem(UNSAVED_DATA_KEY, JSON.stringify(mockData));

        const { result } = renderHook(() => useUnsavedData());

        expect(result.current.unsavedData).toHaveLength(1);
        expect(result.current.unsavedData[0].date).toBe('2024-01-15');
    });

    it('adds new unsaved data entry', () => {
        const { result } = renderHook(() => useUnsavedData());

        const metric: MetricUpdate = {
            type: 'weight',
            data: { weight: 75 },
        };

        act(() => {
            result.current.addUnsavedData('2024-01-15', metric);
        });

        expect(result.current.unsavedData).toHaveLength(1);
        expect(result.current.unsavedData[0].date).toBe('2024-01-15');
        expect(result.current.unsavedData[0].metric).toEqual(metric);
        expect(result.current.unsavedData[0].attempts).toBe(1);

        // Check localStorage
        const stored = JSON.parse(localStorage.getItem(UNSAVED_DATA_KEY) || '[]');
        expect(stored).toHaveLength(1);
    });

    it('updates existing entry when adding duplicate date', () => {
        const { result } = renderHook(() => useUnsavedData());

        const metric1: MetricUpdate = {
            type: 'weight',
            data: { weight: 75 },
        };

        const metric2: MetricUpdate = {
            type: 'weight',
            data: { weight: 76 },
        };

        act(() => {
            result.current.addUnsavedData('2024-01-15', metric1);
        });

        act(() => {
            result.current.addUnsavedData('2024-01-15', metric2);
        });

        expect(result.current.unsavedData).toHaveLength(1);
        expect(result.current.unsavedData[0].metric).toEqual(metric2);
        expect(result.current.unsavedData[0].attempts).toBe(2);
    });

    it('removes unsaved data entry', () => {
        const { result } = renderHook(() => useUnsavedData());

        const metric: MetricUpdate = {
            type: 'weight',
            data: { weight: 75 },
        };

        act(() => {
            result.current.addUnsavedData('2024-01-15', metric);
        });

        expect(result.current.unsavedCount).toBe(1);

        act(() => {
            result.current.removeUnsavedData('2024-01-15');
        });

        expect(result.current.unsavedCount).toBe(0);

        // Check localStorage
        const stored = JSON.parse(localStorage.getItem(UNSAVED_DATA_KEY) || '[]');
        expect(stored).toHaveLength(0);
    });

    it('clears all unsaved data', () => {
        const { result } = renderHook(() => useUnsavedData());

        const metric1: MetricUpdate = {
            type: 'weight',
            data: { weight: 75 },
        };

        const metric2: MetricUpdate = {
            type: 'steps',
            data: { steps: 10000 },
        };

        act(() => {
            result.current.addUnsavedData('2024-01-15', metric1);
            result.current.addUnsavedData('2024-01-16', metric2);
        });

        expect(result.current.unsavedCount).toBe(2);

        act(() => {
            result.current.clearUnsavedData();
        });

        expect(result.current.unsavedCount).toBe(0);
        expect(localStorage.getItem(UNSAVED_DATA_KEY)).toBeNull();
    });

    it('gets unsaved data for specific date', () => {
        const { result } = renderHook(() => useUnsavedData());

        const metric: MetricUpdate = {
            type: 'weight',
            data: { weight: 75 },
        };

        act(() => {
            result.current.addUnsavedData('2024-01-15', metric);
        });

        const entry = result.current.getUnsavedData('2024-01-15');

        expect(entry).toBeDefined();
        expect(entry?.date).toBe('2024-01-15');
        expect(entry?.metric).toEqual(metric);
    });

    it('returns undefined for non-existent date', () => {
        const { result } = renderHook(() => useUnsavedData());

        const entry = result.current.getUnsavedData('2024-01-15');

        expect(entry).toBeUndefined();
    });

    it('checks if date has unsaved data', () => {
        const { result } = renderHook(() => useUnsavedData());

        const metric: MetricUpdate = {
            type: 'weight',
            data: { weight: 75 },
        };

        act(() => {
            result.current.addUnsavedData('2024-01-15', metric);
        });

        expect(result.current.hasUnsavedData('2024-01-15')).toBe(true);
        expect(result.current.hasUnsavedData('2024-01-16')).toBe(false);
    });

    it('checks if entry can be retried', () => {
        const { result } = renderHook(() => useUnsavedData());

        const metric: MetricUpdate = {
            type: 'weight',
            data: { weight: 75 },
        };

        act(() => {
            result.current.addUnsavedData('2024-01-15', metric);
        });

        expect(result.current.canRetry('2024-01-15')).toBe(true);

        // Add 4 more times to reach max attempts (5)
        act(() => {
            result.current.addUnsavedData('2024-01-15', metric);
            result.current.addUnsavedData('2024-01-15', metric);
            result.current.addUnsavedData('2024-01-15', metric);
            result.current.addUnsavedData('2024-01-15', metric);
        });

        expect(result.current.canRetry('2024-01-15')).toBe(false);
    });

    it('gets retryable entries', () => {
        const { result } = renderHook(() => useUnsavedData());

        const metric: MetricUpdate = {
            type: 'weight',
            data: { weight: 75 },
        };

        // Add entry with 1 attempt (retryable)
        act(() => {
            result.current.addUnsavedData('2024-01-15', metric);
        });

        // Add entry with 5 attempts (not retryable)
        act(() => {
            result.current.addUnsavedData('2024-01-16', metric);
            result.current.addUnsavedData('2024-01-16', metric);
            result.current.addUnsavedData('2024-01-16', metric);
            result.current.addUnsavedData('2024-01-16', metric);
            result.current.addUnsavedData('2024-01-16', metric);
        });

        const retryable = result.current.getRetryableEntries();

        expect(retryable).toHaveLength(1);
        expect(retryable[0].date).toBe('2024-01-15');
    });

    it('handles localStorage errors gracefully', () => {
        // Mock localStorage to throw error
        const mockSetItem = jest.spyOn(Storage.prototype, 'setItem');
        mockSetItem.mockImplementation(() => {
            throw new Error('Storage full');
        });

        const { result } = renderHook(() => useUnsavedData());

        const metric: MetricUpdate = {
            type: 'weight',
            data: { weight: 75 },
        };

        // Should not throw
        act(() => {
            result.current.addUnsavedData('2024-01-15', metric);
        });

        // Data should still be in memory
        expect(result.current.unsavedCount).toBe(1);

        mockSetItem.mockRestore();
    });
});
