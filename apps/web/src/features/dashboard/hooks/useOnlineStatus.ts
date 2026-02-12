/**
 * Hook to monitor online/offline status
 * Updates dashboard store when connection status changes
 */

import { useEffect } from 'react';
import { useDashboardStore } from '../store/dashboardStore';

/**
 * useOnlineStatus hook
 * Monitors browser online/offline events and updates store
 */
export function useOnlineStatus() {
    const { setOfflineStatus, isOffline } = useDashboardStore();

    useEffect(() => {
        // Set initial status
        setOfflineStatus(!navigator.onLine);

        // Handle online event
        const handleOnline = () => {
            setOfflineStatus(false);
        };

        // Handle offline event
        const handleOffline = () => {
            setOfflineStatus(true);
        };

        // Add event listeners
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Cleanup
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [setOfflineStatus]);

    return { isOffline };
}
