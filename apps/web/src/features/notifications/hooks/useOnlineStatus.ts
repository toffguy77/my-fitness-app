/**
 * Hook to monitor online/offline status
 * Updates the notifications store when connection status changes
 */

import { useEffect } from 'react';
import { useNotificationsStore } from '../store/notificationsStore';

/**
 * Monitor browser online/offline status and update store
 */
export function useOnlineStatus() {
    const setOfflineStatus = useNotificationsStore((state) => state.setOfflineStatus);

    useEffect(() => {
        // Set initial status
        setOfflineStatus(!navigator.onLine);

        // Listen for online/offline events
        const handleOnline = () => {
            setOfflineStatus(false);
        };

        const handleOffline = () => {
            setOfflineStatus(true);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [setOfflineStatus]);
}
