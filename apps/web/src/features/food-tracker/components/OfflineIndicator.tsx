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
            className={`bg-yellow-50 border-b border-yellow-200 ${className}`}
            role="alert"
            aria-live="polite"
        >
            <div className="max-w-2xl mx-auto px-3 py-2 sm:px-4">
                <div className="flex items-center justify-between gap-2">
                    {/* Status message */}
                    <div className="flex items-center gap-2 min-w-0">
                        <WifiOff
                            className="w-4 h-4 text-yellow-600 flex-shrink-0"
                            aria-hidden="true"
                        />
                        <span className="text-xs text-yellow-800 sm:text-sm truncate">
                            {isOffline ? (
                                'Нет подключения к интернету'
                            ) : pendingOperationsCount > 0 ? (
                                `${pendingOperationsCount} ${getPendingText(pendingOperationsCount)} ожидают синхронизации`
                            ) : (
                                'Данные могут быть устаревшими'
                            )}
                        </span>
                    </div>

                    {/* Sync button (only show when online with pending operations) */}
                    {isOnline && pendingOperationsCount > 0 && (
                        <button
                            type="button"
                            onClick={handleSync}
                            disabled={isSyncing}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 hover:bg-yellow-200 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 disabled:opacity-50 sm:px-3 sm:py-1.5 sm:text-sm touch-manipulation"
                            aria-label="Синхронизировать данные"
                        >
                            {isSyncing ? (
                                <>
                                    <RefreshCw className="w-3 h-3 animate-spin sm:w-4 sm:h-4" aria-hidden="true" />
                                    <span className="hidden sm:inline">Синхронизация...</span>
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
                                    <span className="hidden sm:inline">Синхронизировать</span>
                                </>
                            )}
                        </button>
                    )}

                    {/* Success indicator after sync */}
                    {isOnline && pendingOperationsCount === 0 && !isOffline && (
                        <div className="flex items-center gap-1 text-green-600">
                            <Check className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
                            <span className="text-xs sm:text-sm">Синхронизировано</span>
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
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
        return 'операций';
    }

    if (lastDigit === 1) {
        return 'операция';
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
        return 'операции';
    }

    return 'операций';
}

export default OfflineIndicator;
