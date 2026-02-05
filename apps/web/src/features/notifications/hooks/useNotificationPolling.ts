/**
 * Custom hook for managing notification polling lifecycle
 * Automatically starts polling on mount and stops on unmount
 */

import { useEffect } from 'react';
import { useNotificationsStore } from '../store/notificationsStore';

export interface UseNotificationPollingOptions {
    /**
     * Polling interval in milliseconds
     * @default 30000 (30 seconds)
     */
    interval?: number;

    /**
     * Whether polling is enabled
     * @default true
     */
    enabled?: boolean;
}

/**
 * Hook to manage notification polling lifecycle
 * Starts polling on mount and stops on unmount
 *
 * @param options - Configuration options for polling
 */
export function useNotificationPolling(options: UseNotificationPollingOptions = {}): void {
    const { enabled = true } = options;

    const startPolling = useNotificationsStore((state) => state.startPolling);
    const stopPolling = useNotificationsStore((state) => state.stopPolling);

    useEffect(() => {
        // Only start polling if enabled
        if (enabled) {
            startPolling();
        }

        // Cleanup: stop polling on unmount or when disabled
        return () => {
            stopPolling();
        };
    }, [enabled, startPolling, stopPolling]);
}
