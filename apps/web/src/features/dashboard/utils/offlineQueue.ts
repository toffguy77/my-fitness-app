/**
 * Offline queue manager for dashboard mutations
 * Queues mutations when offline and syncs when connection is restored
 */

import type { MetricUpdate } from '../types';

/**
 * Queue entry interface
 */
export interface QueueEntry {
    id: string;
    type: 'metric' | 'task' | 'photo' | 'report';
    date: string;
    data: any;
    timestamp: number;
    attempts: number;
    maxAttempts: number;
}

/**
 * LocalStorage key for offline queue
 */
const QUEUE_KEY = 'dashboard_offline_queue';

/**
 * Maximum number of retry attempts
 */
const MAX_ATTEMPTS = 3;

/**
 * Generate unique ID for queue entry
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Load queue from localStorage
 */
export function loadQueue(): QueueEntry[] {
    if (typeof window === 'undefined') return [];

    try {
        const stored = localStorage.getItem(QUEUE_KEY);
        if (!stored) return [];

        const queue = JSON.parse(stored);
        return Array.isArray(queue) ? queue : [];
    } catch (error) {
        console.warn('Failed to load offline queue:', error);
        return [];
    }
}

/**
 * Save queue to localStorage
 */
export function saveQueue(queue: QueueEntry[]): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
        console.warn('Failed to save offline queue:', error);
    }
}

/**
 * Add entry to queue
 */
export function addToQueue(
    type: QueueEntry['type'],
    date: string,
    data: any
): QueueEntry {
    const entry: QueueEntry = {
        id: generateId(),
        type,
        date,
        data,
        timestamp: Date.now(),
        attempts: 0,
        maxAttempts: MAX_ATTEMPTS,
    };

    const queue = loadQueue();
    queue.push(entry);
    saveQueue(queue);

    return entry;
}

/**
 * Remove entry from queue
 */
export function removeFromQueue(id: string): void {
    const queue = loadQueue();
    const filtered = queue.filter((entry) => entry.id !== id);
    saveQueue(filtered);
}

/**
 * Update entry in queue
 */
export function updateQueueEntry(id: string, updates: Partial<QueueEntry>): void {
    const queue = loadQueue();
    const index = queue.findIndex((entry) => entry.id === id);

    if (index >= 0) {
        queue[index] = { ...queue[index], ...updates };
        saveQueue(queue);
    }
}

/**
 * Get queue size
 */
export function getQueueSize(): number {
    return loadQueue().length;
}

/**
 * Clear entire queue
 */
export function clearQueue(): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.removeItem(QUEUE_KEY);
    } catch (error) {
        console.warn('Failed to clear offline queue:', error);
    }
}

/**
 * Get entries by type
 */
export function getEntriesByType(type: QueueEntry['type']): QueueEntry[] {
    const queue = loadQueue();
    return queue.filter((entry) => entry.type === type);
}

/**
 * Check if entry should be retried
 */
export function shouldRetry(entry: QueueEntry): boolean {
    return entry.attempts < entry.maxAttempts;
}

/**
 * Increment attempt count
 */
export function incrementAttempts(id: string): void {
    const queue = loadQueue();
    const index = queue.findIndex((entry) => entry.id === id);

    if (index >= 0) {
        queue[index].attempts += 1;
        saveQueue(queue);
    }
}

/**
 * Remove failed entries (exceeded max attempts)
 */
export function removeFailedEntries(): QueueEntry[] {
    const queue = loadQueue();
    const failed = queue.filter((entry) => entry.attempts >= entry.maxAttempts);
    const remaining = queue.filter((entry) => entry.attempts < entry.maxAttempts);

    saveQueue(remaining);
    return failed;
}

/**
 * Get oldest entry (for FIFO processing)
 */
export function getOldestEntry(): QueueEntry | null {
    const queue = loadQueue();
    if (queue.length === 0) return null;

    return queue.reduce((oldest, entry) =>
        entry.timestamp < oldest.timestamp ? entry : oldest
    );
}

/**
 * Sort queue by timestamp (oldest first)
 */
export function sortQueueByTimestamp(): QueueEntry[] {
    const queue = loadQueue();
    return queue.sort((a, b) => a.timestamp - b.timestamp);
}
