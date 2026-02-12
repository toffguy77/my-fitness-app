/**
 * UnsavedDataNotification component
 * Displays notification when there's unsaved data with retry functionality
 */

import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { useUnsavedData } from '../hooks/useUnsavedData';
import { useDashboardStore } from '../store/dashboardStore';
import { useState } from 'react';
import toast from 'react-hot-toast';

/**
 * UnsavedDataNotification component
 */
export function UnsavedDataNotification() {
    const {
        unsavedData,
        unsavedCount,
        removeUnsavedData,
        clearUnsavedData,
        canRetry,
    } = useUnsavedData();
    const { updateMetric } = useDashboardStore();
    const [isRetrying, setIsRetrying] = useState(false);

    // Don't show if no unsaved data
    if (unsavedCount === 0) {
        return null;
    }

    /**
     * Retry saving a specific entry
     */
    const handleRetryOne = async (date: string) => {
        const entry = unsavedData.find((e) => e.date === date);
        if (!entry || !canRetry(date)) return;

        setIsRetrying(true);

        try {
            await updateMetric(date, entry.metric);
            removeUnsavedData(date);
            toast.success('Данные успешно сохранены');
        } catch (error) {
            toast.error('Не удалось сохранить данные');
        } finally {
            setIsRetrying(false);
        }
    };

    /**
     * Retry saving all entries
     */
    const handleRetryAll = async () => {
        setIsRetrying(true);

        let successCount = 0;
        let failCount = 0;

        for (const entry of unsavedData) {
            if (!canRetry(entry.date)) continue;

            try {
                await updateMetric(entry.date, entry.metric);
                removeUnsavedData(entry.date);
                successCount++;
            } catch (error) {
                failCount++;
            }
        }

        setIsRetrying(false);

        if (successCount > 0) {
            toast.success(`Сохранено записей: ${successCount}`);
        }

        if (failCount > 0) {
            toast.error(`Не удалось сохранить: ${failCount}`);
        }
    };

    /**
     * Dismiss notification and clear unsaved data
     */
    const handleDismiss = () => {
        if (
            window.confirm(
                'Вы уверены? Несохраненные данные будут удалены без возможности восстановления.'
            )
        ) {
            clearUnsavedData();
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-50 max-w-md">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg shadow-lg p-4">
                <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />

                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-yellow-900 mb-1">
                            Несохраненные данные
                        </h3>

                        <p className="text-sm text-yellow-800 mb-3">
                            {unsavedCount === 1
                                ? 'Есть 1 несохраненная запись'
                                : `Есть ${unsavedCount} несохраненных записей`}
                        </p>

                        {/* List of unsaved entries */}
                        {unsavedData.length <= 3 && (
                            <div className="space-y-2 mb-3">
                                {unsavedData.map((entry) => (
                                    <div
                                        key={entry.date}
                                        className="flex items-center justify-between text-xs text-yellow-700 bg-yellow-100 rounded px-2 py-1"
                                    >
                                        <span>
                                            {new Date(entry.date).toLocaleDateString('ru-RU', {
                                                day: 'numeric',
                                                month: 'short',
                                            })}
                                            {' - '}
                                            {entry.metric.type === 'weight' && 'Вес'}
                                            {entry.metric.type === 'steps' && 'Шаги'}
                                            {entry.metric.type === 'nutrition' && 'Питание'}
                                            {entry.metric.type === 'workout' && 'Тренировка'}
                                        </span>
                                        {canRetry(entry.date) && (
                                            <button
                                                onClick={() => handleRetryOne(entry.date)}
                                                disabled={isRetrying}
                                                className="text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
                                                aria-label="Повторить"
                                            >
                                                <RefreshCw className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2">
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleRetryAll}
                                isLoading={isRetrying}
                                disabled={isRetrying}
                                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white"
                            >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Повторить
                            </Button>

                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDismiss}
                                disabled={isRetrying}
                                className="text-yellow-700 hover:bg-yellow-100"
                            >
                                Отменить
                            </Button>
                        </div>
                    </div>

                    {/* Close button */}
                    <button
                        onClick={handleDismiss}
                        disabled={isRetrying}
                        className="text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
                        aria-label="Закрыть"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
