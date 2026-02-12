/**
 * useOnlineStatus Hook
 *
 * Monitors browser online/offline status and syncs with store.
 * Shows offline indicator and handles reconnection.
 *
 * @module food-tracker/hooks/useOnlineStatus
 */

import { useEffect, useCallback } from 'react';
import { useFoodTrackerStore } from '../store/foodTrackerStore';

// ============================================================================
// Types
// ============================================================================

export interface UseOnlineStatusReturn {
    /** Whether the browser is currently online */
    isOnline: boolean;
    /** Whether the store is in offline mode */
    isOffline: boolean;
    /** Number of pending operations waiting to sync */
    pendingOperationsCount: number;
    /** Manually trigger sync when online */
    syncNow: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to monitor online/offline status and sync with food tracker store
 *
 * @returns Online status and sync controls
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isOnline, isOffline, pendingOperationsCount, syncNow } = useOnlineStatus();
 *
 *   return (
 *     <div>
 *       {isOffline && (
 *         <div>
 *           Вы офлайн. {pendingOperationsCount} операций ожидают синхронизации.
 *           <button onClick={syncNow}>Синхронизировать</button>
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useOnlineStatus(): UseOnlineStatusReturn {
    const isOffline = useFoodTrackerStore((state) => state.isOffline);
    const pendingOperations = useFoodTrackerStore((state) => state.pendingOperations);
    const setOfflineStatus = useFoodTrackerStore((state) => state.setOfflineStatus);
    const syncWhenOnline = useFoodTrackerStore((state) => state.syncWhenOnline);

    // Handle online event
    const handleOnline = useCallback(() => {
        setOfflineStatus(false);
    }, [setOfflineStatus]);

    // Handle offline event
    const handleOffline = useCallback(() => {
        setOfflineStatus(true);
    }, [setOfflineStatus]);

    // Set up event listeners
    useEffect(() => {
        // Check initial status
        if (typeof navigator !== 'undefined') {
            setOfflineStatus(!navigator.onLine);
        }

        // Add event listeners
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [handleOnline, handleOffline, setOfflineStatus]);

    // Manual sync function
    const syncNow = useCallback(async () => {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
            await syncWhenOnline();
        }
    }, [syncWhenOnline]);

    return {
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
        isOffline,
        pendingOperationsCount: pendingOperations.length,
        syncNow,
    };
}

export default useOnlineStatus;
