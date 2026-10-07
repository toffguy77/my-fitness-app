/**
 * OfflineIndicator Component
 *
 * Displays offline status banner with pending operations count
 * and sync button when connection is restored.
 *
 * @module food-tracker/components/OfflineIndicator
 */

'use client';

import React from 'react';
import { WifiOff, RefreshCw, Check } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { t, plural } from '@/shared/i18n';

// ============================================================================
// Types
// ============================================================================

export interface OfflineIndicatorProps {
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function OfflineIndicator({ className = '' }: OfflineIndicatorProps) {
    const { isOnline, isOffline, pendingOperationsCount, syncNow } = useOnlineStatus();
    const [isSyncing, setIsSyncing] = React.useState(false);

    // Handle sync button click
    const handleSync = async () => {
        if (isSyncing) return;

        setIsSyncing(true);
        try {
            await syncNow();
        } finally {
            setIsSyncing(false);
        }
    };

    // Don't render if online and no pending operations
    if (isOnline && !isOffline && pendingOperationsCount === 0) {
        return null;
    }

    return (
        <div
            className={`border-b border-line bg-info-soft ${className}`}
            role="alert"
            aria-live="polite"
        >
            <div className="mx-auto max-w-content px-screen-x py-1">
                <div className="flex min-h-11 items-center justify-between gap-2">
                    {/* Status message */}
                    <div className="flex min-w-0 items-center gap-2">
                        <WifiOff
                            className="h-4 w-4 flex-shrink-0 text-info-fg"
                            strokeWidth={1.8}
                            aria-hidden="true"
                        />
                        <span className="truncate text-sm text-info-fg">
                            {isOffline ? (
                                t('common.offline')
                            ) : pendingOperationsCount > 0 ? (
                                t('foodTracker.offline.pending', { count: pendingOperationsCount, noun: getPendingText(pendingOperationsCount) })
                            ) : (
                                t('foodTracker.offline.stale')
                            )}
                        </span>
                    </div>

                    {/* Sync button (only show when online with pending operations) */}
                    {isOnline && pendingOperationsCount > 0 && (
                        <button
                            type="button"
                            onClick={handleSync}
                            disabled={isSyncing}
                            className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold text-info-fg transition-colors hover:bg-surface/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 touch-manipulation"
                            aria-label={t('foodTracker.offline.syncAria')}
                        >
                            {isSyncing ? (
                                <>
                                    <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={1.8} aria-hidden="true" />
                                    <span className="hidden sm:inline">{t('foodTracker.offline.syncing')}</span>
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                    <span className="hidden sm:inline">{t('foodTracker.offline.sync')}</span>
                                </>
                            )}
                        </button>
                    )}

                    {/* Success indicator after sync */}
                    {isOnline && pendingOperationsCount === 0 && !isOffline && (
                        <div className="flex items-center gap-1 text-success-fg">
                            <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            <span className="text-sm">{t('foodTracker.offline.synced')}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get Russian plural form for "операция"
 */
function getPendingText(count: number): string {
    // The plural rule lives in the i18n module: written out here it was one
    // more copy to keep in step with every other count on the screen.
    return plural(count, {
        one: t('foodTracker.offline.pendingOne'),
        few: t('foodTracker.offline.pendingFew'),
        many: t('foodTracker.offline.pendingMany'),
    });
}

export default OfflineIndicator;
