/**
 * UnsavedDataNotification component
 * Displays notification when there's unsaved data with retry functionality
 */

import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { useConfirm } from '@/shared/components/ui';
import { useUnsavedData } from '../hooks/useUnsavedData';
import { useDashboardStore } from '../store/dashboardStore';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { t } from '@/shared/i18n'

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
    const { confirm, dialog } = useConfirm();

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
            toast.success(t('dashboard.unsaved.saved'));
        } catch {
            toast.error(t('dashboard.unsaved.saveFailed'));
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
            } catch {
                failCount++;
            }
        }

        setIsRetrying(false);

        if (successCount > 0) {
            toast.success(t('dashboard.unsaved.savedCount', { count: successCount }));
        }

        if (failCount > 0) {
            toast.error(t('dashboard.unsaved.failedCount', { count: failCount }));
        }
    };

    /**
     * Dismiss notification and clear unsaved data
     */
    const handleDismiss = () => {
        confirm({
            title: t('dashboard.unsaved.discardTitle'),
            description: t('dashboard.unsaved.discardConfirm'),
            confirmLabel: t('common.delete'),
            onConfirm: () => clearUnsavedData(),
        });
    };

    // Панель лежит над экраном — поверхность с `shadow-overlay`; состояние
    // «не сохранено» — знаком роли warning, текст — чернилами. Терракота на
    // дашборде одна, у записи еды: повтор — контуром, отказ — без подложки.
    return (
        <div className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-md">
            <div className="rounded-card border border-line bg-surface p-4 text-fg shadow-overlay">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-warning-soft" aria-hidden="true">
                        <AlertCircle className="h-[18px] w-[18px] text-warning-fg" strokeWidth={1.8} />
                    </span>

                    <div className="min-w-0 flex-1">
                        <h3 className="type-headline text-fg">
                            {t('dashboard.unsaved.title')}
                        </h3>

                        <p className="mt-0.5 text-sm text-fg-muted tabular-nums">
                            {unsavedCount === 1
                                ? t('dashboard.unsaved.countOne')
                                : t('dashboard.unsaved.countMany', { count: unsavedCount })}
                        </p>

                        {/* List of unsaved entries */}
                        {unsavedData.length <= 3 && (
                            <ul className="mt-3 divide-y divide-line rounded-tile border border-line">
                                {unsavedData.map((entry) => (
                                    <li
                                        key={entry.date}
                                        className="flex min-h-11 items-center justify-between gap-2 pl-3 text-sm text-fg tabular-nums"
                                    >
                                        <span>
                                            {new Date(entry.date).toLocaleDateString('ru-RU', {
                                                day: 'numeric',
                                                month: 'short',
                                            })}
                                            {' - '}
                                            {entry.metric.type === 'weight' && t('dashboard.unsaved.weight')}
                                            {entry.metric.type === 'steps' && t('dashboard.unsaved.steps')}
                                            {entry.metric.type === 'nutrition' && t('dashboard.unsaved.nutrition')}
                                            {entry.metric.type === 'workout' && t('dashboard.unsaved.workout')}
                                        </span>
                                        {canRetry(entry.date) && (
                                            <IconButton
                                                variant="ghost"
                                                onClick={() => handleRetryOne(entry.date)}
                                                disabled={isRetrying}
                                                aria-label={t('dashboard.unsaved.retry')}
                                            >
                                                <RefreshCw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                            </IconButton>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}

                        {/* Action buttons */}
                        <div className="mt-3 flex gap-2">
                            <Button
                                variant="secondary"
                                onClick={handleRetryAll}
                                isLoading={isRetrying}
                                disabled={isRetrying}
                                className="flex-1"
                            >
                                {!isRetrying && <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
                                {t('dashboard.unsaved.retry')}
                            </Button>

                            <Button
                                variant="ghost"
                                onClick={handleDismiss}
                                disabled={isRetrying}
                            >
                                {t('dashboard.unsaved.discard')}
                            </Button>
                        </div>
                    </div>

                    {/* Close button */}
                    <IconButton
                        variant="ghost"
                        onClick={handleDismiss}
                        disabled={isRetrying}
                        className="-mr-2 -mt-2"
                        aria-label={t('common.close')}
                    >
                        <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                </div>
            </div>

            {dialog}
        </div>
    );
}
