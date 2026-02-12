/**
 * Unit tests for offline queue utilities
 */

import {
    addToQueue,
    removeFromQueue,
    loadQueue,
    saveQueue,
    updateQueueEntry,
    getQueueSize,
    clearQueue,
    getEntriesByType,
    shouldRetry,
    incrementAttempts,
    removeFailedEntries,
    getOldestEntry,
    sortQueueByTimestamp,
    type QueueEntry,
} from '../offlineQueue';

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

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

describe('offlineQueue', () => {
    beforeEach(() => {
        localStorageMock.clear();
    });

    describe('addToQueue', () => {
        it('should add entry to queue', () => {
            const entry = addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });

            expect(entry.id).toBeDefined();
            expect(entry.type).toBe('metric');
            expect(entry.date).toBe('2024-01-15');
            expect(entry.data).toEqual({ type: 'weight', data: { weight: 75 } });
            expect(entry.attempts).toBe(0);
            expect(entry.maxAttempts).toBe(3);
        });

        it('should persist entry to localStorage', () => {
            addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });

            const queue = loadQueue();
            expect(queue).toHaveLength(1);
            expect(queue[0].type).toBe('metric');
        });

        it('should add multiple entries', () => {
            addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });
            addToQueue('task', 'task-1', { status: 'completed' });

            const queue = loadQueue();
            expect(queue).toHaveLength(2);
        });
    });

    describe('removeFromQueue', () => {
        it('should remove entry by id', () => {
            const entry1 = addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });
            const entry2 = addToQueue('task', 'task-1', { status: 'completed' });

            removeFromQueue(entry1.id);

            const queue = loadQueue();
            expect(queue).toHaveLength(1);
            expect(queue[0].id).toBe(entry2.id);
        });

        it('should handle removing non-existent entry', () => {
            addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });

            removeFromQueue('non-existent-id');

            const queue = loadQueue();
            expect(queue).toHaveLength(1);
        });
    });

    describe('updateQueueEntry', () => {
        it('should update entry fields', () => {
            const entry = addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });

            updateQueueEntry(entry.id, { attempts: 2 });

            const queue = loadQueue();
            expect(queue[0].attempts).toBe(2);
        });

        it('should handle updating non-existent entry', () => {
            addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });

            updateQueueEntry('non-existent-id', { attempts: 2 });

            const queue = loadQueue();
            expect(queue[0].attempts).toBe(0);
        });
    });

    describe('getQueueSize', () => {
        it('should return 0 for empty queue', () => {
            expect(getQueueSize()).toBe(0);
        });

        it('should return correct size', () => {
            addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });
            addToQueue('task', 'task-1', { status: 'completed' });

            expect(getQueueSize()).toBe(2);
        });
    });

    describe('clearQueue', () => {
        it('should clear all entries', () => {
            addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });
            addToQueue('task', 'task-1', { status: 'completed' });

            clearQueue();

            expect(getQueueSize()).toBe(0);
        });
    });

    describe('getEntriesByType', () => {
        it('should filter entries by type', () => {
            addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });
            addToQueue('task', 'task-1', { status: 'completed' });
            addToQueue('metric', '2024-01-16', { type: 'steps', data: { steps: 10000 } });

            const metricEntries = getEntriesByType('metric');
            expect(metricEntries).toHaveLength(2);
            expect(metricEntries.every((e) => e.type === 'metric')).toBe(true);

            const taskEntries = getEntriesByType('task');
            expect(taskEntries).toHaveLength(1);
            expect(taskEntries[0].type).toBe('task');
        });

        it('should return empty array for non-existent type', () => {
            addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });

            const photoEntries = getEntriesByType('photo');
            expect(photoEntries).toHaveLength(0);
        });
    });

    describe('shouldRetry', () => {
        it('should return true if attempts < maxAttempts', () => {
            const entry: QueueEntry = {
                id: '1',
                type: 'metric',
                date: '2024-01-15',
                data: {},
                timestamp: Date.now(),
                attempts: 1,
                maxAttempts: 3,
            };

            expect(shouldRetry(entry)).toBe(true);
        });

        it('should return false if attempts >= maxAttempts', () => {
            const entry: QueueEntry = {
                id: '1',
                type: 'metric',
                date: '2024-01-15',
                data: {},
                timestamp: Date.now(),
                attempts: 3,
                maxAttempts: 3,
            };

            expect(shouldRetry(entry)).toBe(false);
        });
    });

    describe('incrementAttempts', () => {
        it('should increment attempts count', () => {
            const entry = addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });

            incrementAttempts(entry.id);

            const queue = loadQueue();
            expect(queue[0].attempts).toBe(1);

            incrementAttempts(entry.id);
            const updatedQueue = loadQueue();
            expect(updatedQueue[0].attempts).toBe(2);
        });

        it('should handle incrementing non-existent entry', () => {
            addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });

            incrementAttempts('non-existent-id');

            const queue = loadQueue();
            expect(queue[0].attempts).toBe(0);
        });
    });

    describe('removeFailedEntries', () => {
        it('should remove entries that exceeded max attempts', () => {
            const entry1 = addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });
            const entry2 = addToQueue('task', 'task-1', { status: 'completed' });
            const entry3 = addToQueue('metric', '2024-01-16', { type: 'steps', data: { steps: 10000 } });

            // Set entry1 and entry3 to max attempts
            updateQueueEntry(entry1.id, { attempts: 3 });
            updateQueueEntry(entry3.id, { attempts: 3 });

            const failed = removeFailedEntries();

            expect(failed).toHaveLength(2);
            expect(failed.map((e) => e.id)).toContain(entry1.id);
            expect(failed.map((e) => e.id)).toContain(entry3.id);

            const queue = loadQueue();
            expect(queue).toHaveLength(1);
            expect(queue[0].id).toBe(entry2.id);
        });

        it('should return empty array if no failed entries', () => {
            addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });

            const failed = removeFailedEntries();

            expect(failed).toHaveLength(0);
            expect(getQueueSize()).toBe(1);
        });
    });

    describe('getOldestEntry', () => {
        it('should return null for empty queue', () => {
            expect(getOldestEntry()).toBeNull();
        });

        it('should return oldest entry by timestamp', () => {
            const entry1 = addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });

            // Wait a bit to ensure different timestamps
            const entry2 = addToQueue('task', 'task-1', { status: 'completed' });
            const entry3 = addToQueue('metric', '2024-01-16', { type: 'steps', data: { steps: 10000 } });

            const oldest = getOldestEntry();

            expect(oldest).not.toBeNull();
            expect(oldest!.id).toBe(entry1.id);
        });
    });

    describe('sortQueueByTimestamp', () => {
        it('should sort entries by timestamp (oldest first)', () => {
            const entry1 = addToQueue('metric', '2024-01-15', { type: 'weight', data: { weight: 75 } });
            const entry2 = addToQueue('task', 'task-1', { status: 'completed' });
            const entry3 = addToQueue('metric', '2024-01-16', { type: 'steps', data: { steps: 10000 } });

            const sorted = sortQueueByTimestamp();

            expect(sorted).toHaveLength(3);
            expect(sorted[0].id).toBe(entry1.id);
            expect(sorted[1].id).toBe(entry2.id);
            expect(sorted[2].id).toBe(entry3.id);
        });

        it('should return empty array for empty queue', () => {
            const sorted = sortQueueByTimestamp();
            expect(sorted).toHaveLength(0);
        });
    });

    describe('loadQueue and saveQueue', () => {
        it('should handle corrupted localStorage data', () => {
            localStorage.setItem('dashboard_offline_queue', 'invalid json');

            const queue = loadQueue();
            expect(queue).toHaveLength(0);
        });

        it('should handle non-array data', () => {
            localStorage.setItem('dashboard_offline_queue', JSON.stringify({ not: 'array' }));

            const queue = loadQueue();
            expect(queue).toHaveLength(0);
        });

        it('should persist and load queue correctly', () => {
            const entries: QueueEntry[] = [
                {
                    id: '1',
                    type: 'metric',
                    date: '2024-01-15',
                    data: { type: 'weight', data: { weight: 75 } },
                    timestamp: Date.now(),
                    attempts: 0,
                    maxAttempts: 3,
                },
                {
                    id: '2',
                    type: 'task',
                    date: 'task-1',
                    data: { status: 'completed' },
                    timestamp: Date.now(),
                    attempts: 1,
                    maxAttempts: 3,
                },
            ];

            saveQueue(entries);

            const loaded = loadQueue();
            expect(loaded).toHaveLength(2);
            expect(loaded[0].id).toBe('1');
            expect(loaded[1].id).toBe('2');
        });
    });
});
