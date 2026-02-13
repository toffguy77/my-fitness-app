/**
 * Hook for managing unsaved data with localStorage persistence
 * Retains data when save operations fail, allowing user to retry
 */

import { useState, useEffect, useCallback } from 'react';
import type { MetricUpdate } from '../types';

/**
 * Unsaved data entry
 */
interface UnsavedDataEntry {
    date: string;
    metric: MetricUpdate;
    timestamp: number;
    attempts: number;
}

/**
 * LocalStorage key for unsaved data
 */
const UNSAVED_DATA_KEY = 'dashboard_unsaved_data';

/**
 * Maximum age for unsaved data (24 hours)
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Maximum retry attempts
 */
const MAX_ATTEMPTS = 5;

/**
 * Load unsaved data from localStorage
 */
function loadUnsavedData(): UnsavedDataEntry[] {
    if (typeof window === 'undefined') return [];

    try {
        const stored = localStorage.getItem(UNSAVED_DATA_KEY);
        if (!stored) return [];

        const data: UnsavedDataEntry[] = JSON.parse(stored);
        const now = Date.now();

        // Filter out expired entries
        return data.filter((entry) => now - entry.timestamp < MAX_AGE_MS);
    } catch (error) {
        console.warn('Failed to load unsaved data:', error);
        return [];
    }
}

/**
 * Save unsaved data to localStorage
 */
function saveUnsavedData(data: UnsavedDataEntry[]): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(UNSAVED_DATA_KEY, JSON.stringify(data));
    } catch (error) {
        console.warn('Failed to save unsaved data:', error);
    }
}

/**
 * Hook for managing unsaved data
 */
export function useUnsavedData() {
    // Initialize state with data from localStorage (lazy initialization)
    const [unsavedData, setUnsavedData] = useState<UnsavedDataEntry[]>(() => loadUnsavedData());
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Add unsaved data entry
     */
    const addUnsavedData = useCallback((date: string, metric: MetricUpdate) => {
        setUnsavedData((prev) => {
            // Check if entry already exists
            const existingIndex = prev.findIndex((entry) => entry.date === date);

            let updated: UnsavedDataEntry[];

            if (existingIndex >= 0) {
                // Update existing entry
                updated = [...prev];
                updated[existingIndex] = {
                    date,
                    metric,
                    timestamp: Date.now(),
                    attempts: prev[existingIndex].attempts + 1,
                };
            } else {
                // Add new entry
                updated = [
                    ...prev,
                    {
                        date,
                        metric,
                        timestamp: Date.now(),
                        attempts: 1,
                    },
                ];
            }

            saveUnsavedData(updated);
            return updated;
        });
    }, []);

    /**
     * Remove unsaved data entry
     */
    const removeUnsavedData = useCallback((date: string) => {
        setUnsavedData((prev) => {
            const updated = prev.filter((entry) => entry.date !== date);
            saveUnsavedData(updated);
            return updated;
        });
    }, []);

    /**
     * Clear all unsaved data
     */
    const clearUnsavedData = useCallback(() => {
        setUnsavedData([]);
        if (typeof window !== 'undefined') {
            localStorage.removeItem(UNSAVED_DATA_KEY);
        }
    }, []);

    /**
     * Get unsaved data for a specific date
     */
    const getUnsavedData = useCallback(
        (date: string): UnsavedDataEntry | undefined => {
            return unsavedData.find((entry) => entry.date === date);
        },
        [unsavedData]
    );

    /**
     * Check if date has unsaved data
     */
    const hasUnsavedData = useCallback(
        (date: string): boolean => {
            return unsavedData.some((entry) => entry.date === date);
        },
        [unsavedData]
    );

    /**
     * Get count of unsaved entries
     */
    const unsavedCount = unsavedData.length;

    /**
     * Check if entry can be retried
     */
    const canRetry = useCallback(
        (date: string): boolean => {
            const entry = getUnsavedData(date);
            return entry ? entry.attempts < MAX_ATTEMPTS : false;
        },
        [getUnsavedData]
    );

    /**
     * Get all unsaved entries that can be retried
     */
    const getRetryableEntries = useCallback((): UnsavedDataEntry[] => {
        return unsavedData.filter((entry) => entry.attempts < MAX_ATTEMPTS);
    }, [unsavedData]);

    return {
        unsavedData,
        unsavedCount,
        isLoading,
        addUnsavedData,
        removeUnsavedData,
        clearUnsavedData,
        getUnsavedData,
        hasUnsavedData,
        canRetry,
        getRetryableEntries,
    };
}
