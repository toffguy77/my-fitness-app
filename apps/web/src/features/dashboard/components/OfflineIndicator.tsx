/**
 * Offline indicator component
 * Displays connection status and pending sync count
 */

import React from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useDashboardStore } from '../store/dashboardStore';
import { getQueueSize } from '../utils/offlineQueue';

export interface OfflineIndicatorProps {
    className?: string;
}

/**
 * OfflineIndicator component
 */
export function OfflineIndicator({ className = '' }: OfflineIndicatorProps) {
    const { isOffline, syncWhenOnline } = useDashboardStore();
    const [queueSize, setQueueSize] = React.useState(0);
    const [isSyncing, setIsSyncing] = React.useState(false);

    // Update queue size periodically
    React.useEffect(() => {
        const updateQueueSize = () => {
            setQueueSize(getQueueSize());
        };

        updateQueueSize();

        const interval = setInterval(updateQueueSize, 1000);

        return () => clearInterval(interval);
    }, []);

    // Handle manual sync
    const handleSync = async () => {
        if (isOffline) return;

        setIsSyncing(true);
        try {
            await syncWhenOnline();
        } finally {
            setIsSyncing(false);
        }
    };

    // Don't show indicator if online and no pending changes
    if (!isOffline && queueSize === 0) {
        return null;
    }

    return (
        <div
            className={`fixed bottom-4 right-4 z-50 ${className}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            <div
                className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg
                    ${isOffline
                        ? 'bg-red-500 text-white'
                        : 'bg-blue-500 text-white'
                    }
                `}
            >
                {/* Icon */}
                {isOffline ? (
                    <WifiOff
                        className="w-5 h-5"
                        aria-hidden="true"
                    />
                ) : (
                    <Wifi
                        className="w-5 h-5"
                        aria-hidden="true"
                    />
                )}

                {/* Status text */}
                <span className="text-sm font-medium">
                    {isOffline ? (
                        'Нет подключения'
                    ) : queueSize > 0 ? (
                        `Синхронизация (${queueSize})`
                    ) : (
                        'Подключено'
                    )}
                </span>

                {/* Sync button (only when online and has pending changes) */}
                {!isOffline && queueSize > 0 && (
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="ml-2 p-1 rounded hover:bg-white/20 transition-colors disabled:opacity-50"
                        aria-label="Синхронизировать сейчас"
                    >
                        <RefreshCw
                            className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
                            aria-hidden="true"
                        />
                    </button>
                )}
            </div>

            {/* Pending changes count (when offline) */}
            {isOffline && queueSize > 0 && (
                <div className="mt-2 text-xs text-center text-gray-600 bg-white rounded px-2 py-1 shadow">
                    {queueSize} {queueSize === 1 ? 'изменение' : 'изменений'} в очереди
                </div>
            )}
        </div>
    );
}
