'use client';

/**
 * NutrientDetailPanel Component
 *
 * Подробности по нутриенту: описание, польза, действие, границы нормы и
 * продукты рациона, давшие потребление.
 *
 * Единственное место в изменении, где рисуется что-то с нуля. Обработчик
 * `GET /api/v1/food-tracker/recommendations/:id` существовал и не вызывался
 * потому, что показывать было некуда: на клиенте был тип `NutrientDetail`,
 * генератор для тестов и обратный вызов по клику — и ни одного экрана.
 *
 * Описание, польза, действие и границы нормы приходят необязательными: в
 * незаполненном справочнике их нет. Пустое поле не показывается, ноль вместо
 * неизвестной границы не подставляется.
 *
 * @module food-tracker/components/NutrientDetailPanel
 */

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchRecommendationDetail } from '../api/recommendationsApi';
import type { NutrientDetail } from '../types';
import { unitLabel } from '../utils/unitLabel';
import { t } from '@/shared/i18n';

// ============================================================================
// Types
// ============================================================================

export interface NutrientDetailPanelProps {
    /** Нутриент, подробности которого показываются. */
    nutrientId: string;
    /** Имя, уже известное вкладке: показывается, пока подробности загружаются. */
    nutrientName?: string;
    onClose: () => void;
    className?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

function Section({ title, text }: { title: string; text?: string }): React.ReactElement | null {
    // Незаполненное поле не занимает места и не притворяется пустым разделом.
    if (!text || !text.trim()) return null;

    return (
        <section className="space-y-1">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide sm:text-sm">
                {title}
            </h4>
            <p className="text-xs text-gray-800 sm:text-sm">{text}</p>
        </section>
    );
}

// ============================================================================
// Component
// ============================================================================

export function NutrientDetailPanel({
    nutrientId,
    nutrientName,
    onClose,
    className = '',
}: NutrientDetailPanelProps): React.ReactElement {
    const [detail, setDetail] = useState<NutrientDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            try {
                const loaded = await fetchRecommendationDetail(nutrientId);
                if (cancelled) return;
                setDetail(loaded);
                setError(null);
            } catch {
                if (cancelled) return;
                setError(t('foodTracker.nutrientDetail.loadFailed'));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [nutrientId]);

    const unit = unitLabel(detail?.unit);

    return (
        <div
            className={`fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center ${className}`}
            role="dialog"
            aria-modal="true"
            aria-label={t('foodTracker.nutrientDetail.aria')}
        >
            <div className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-gray-900 sm:text-lg">
                        {detail?.name ?? nutrientName ?? t('foodTracker.nutrientDetail.title')}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 -m-1 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                        aria-label={t('common.close')}
                    >
                        <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                </div>

                {isLoading && (
                    <p className="py-6 text-center text-xs text-gray-500 sm:text-sm" aria-live="polite" aria-busy="true">
                        {t('common.loading')}
                    </p>
                )}

                {error && (
                    <p className="py-6 text-center text-xs text-red-700 sm:text-sm" role="alert">
                        {error}
                    </p>
                )}

                {detail && !isLoading && !error && (
                    <div className="mt-3 space-y-3">
                        <p className="text-xs text-gray-900 sm:text-sm">
                            {t('foodTracker.nutrientDetail.progress', {
                                intake: String(detail.currentIntake),
                                target: String(detail.dailyTarget),
                                unit,
                            })}
                        </p>

                        {/* Границы нормы показываются только те, что заведены. */}
                        {detail.minRecommendation !== undefined && (
                            <p className="text-xs text-gray-600 sm:text-sm">
                                {t('foodTracker.nutrientDetail.min', {
                                    value: String(detail.minRecommendation),
                                    unit,
                                })}
                            </p>
                        )}
                        {detail.optimalRecommendation !== undefined && (
                            <p className="text-xs text-gray-600 sm:text-sm">
                                {t('foodTracker.nutrientDetail.optimal', {
                                    value: String(detail.optimalRecommendation),
                                    unit,
                                })}
                            </p>
                        )}

                        <Section
                            title={t('foodTracker.nutrientDetail.description')}
                            text={detail.description}
                        />
                        <Section
                            title={t('foodTracker.nutrientDetail.benefits')}
                            text={detail.benefits}
                        />
                        <Section
                            title={t('foodTracker.nutrientDetail.effects')}
                            text={detail.effects}
                        />

                        <section className="space-y-1">
                            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide sm:text-sm">
                                {t('foodTracker.nutrientDetail.sources')}
                            </h4>
                            {detail.sourcesInDiet.length > 0 ? (
                                <ul className="space-y-1">
                                    {detail.sourcesInDiet.map((source) => (
                                        <li
                                            key={`${source.foodName}-${source.amount}`}
                                            className="flex items-center justify-between text-xs text-gray-800 sm:text-sm"
                                        >
                                            <span>{source.foodName}</span>
                                            <span className="text-gray-500">
                                                {source.contribution} {unit}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-gray-500 sm:text-sm">
                                    {t('foodTracker.nutrientDetail.noSources')}
                                </p>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}

export default NutrientDetailPanel;
