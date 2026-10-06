/**
 * Offline indicator component
 * Displays connection status and pending sync count
 */

import React from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useDashboardStore } from '../store/dashboardStore';
import { getQueueSize } from '../utils/offlineQueue';
import { IconButton } from '@/shared/components/ui/Button';
import { cn } from '@/shared/utils/cn';
import { t, plural } from '@/shared/i18n'

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

    // Плашка над экраном — `shadow-float`. Нет связи — состояние danger;
    // синхронизация — уведомление, поэтому тёмная поверхность `coach`, а не
    // терракота: бренд принадлежит главному действию экрана.
    return (
        <div
            className={cn('fixed bottom-4 right-4 z-50 flex flex-col items-end', className)}
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            <div
                className={cn(
                    'flex min-h-11 items-center gap-2 rounded-full py-1 pl-4 shadow-float',
                    isOffline ? 'bg-danger pr-4 text-on-primary' : 'bg-coach pr-1 text-on-coach'
                )}
            >
                {/* Icon */}
                {isOffline ? (
                    <WifiOff
                        className="h-[18px] w-[18px]"
                        strokeWidth={1.8}
                        aria-hidden="true"
                    />
                ) : (
                    <Wifi
                        className="h-[18px] w-[18px] text-on-coach-muted"
                        strokeWidth={1.8}
                        aria-hidden="true"
                    />
                )}

                {/* Status text */}
                <span className="text-sm font-semibold tabular-nums">
                    {isOffline ? (
                        t('dashboard.connection.offline')
                    ) : queueSize > 0 ? (
                        t('dashboard.connection.syncing', { count: queueSize })
                    ) : (
                        t('dashboard.connection.online')
                    )}
                </span>

                {/* Sync button (only when online and has pending changes) */}
                {!isOffline && queueSize > 0 && (
                    <IconButton
                        variant="on-coach"
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="border-0"
                        aria-label={t('dashboard.connection.syncNow')}
                    >
                        <RefreshCw
                            className={cn('h-4 w-4', isSyncing && 'animate-spin')}
                            strokeWidth={2}
                            aria-hidden="true"
                        />
                    </IconButton>
                )}
            </div>

            {/* Pending changes count (when offline) */}
            {isOffline && queueSize > 0 && (
                <div className="mt-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-fg-muted tabular-nums shadow-float">
                    {t('dashboard.connection.queued', { count: queueSize, noun: plural(queueSize, { one: t('dashboard.sync.changeOne'), few: t('dashboard.sync.changeFew'), many: t('dashboard.sync.changeMany') }) })}
                </div>
            )}
        </div>
    );
}
