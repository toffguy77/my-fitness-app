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
import { IconButton } from '@/shared/components/ui/Button';

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
            <h4 className="type-overline text-fg-subtle">
                {title}
            </h4>
            <p className="type-callout text-fg">{text}</p>
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
            className={`fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center sm:p-4 ${className}`}
            role="dialog"
            aria-modal="true"
            aria-label={t('foodTracker.nutrientDetail.aria')}
        >
            <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-sheet bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-overlay sm:max-w-lg sm:rounded-sheet">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="type-title-2 text-fg">
                        {detail?.name ?? nutrientName ?? t('foodTracker.nutrientDetail.title')}
                    </h3>
                    <IconButton
                        variant="ghost"
                        onClick={onClose}
                        className="-mr-2"
                        aria-label={t('common.close')}
                    >
                        <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                </div>

                {isLoading && (
                    <p className="py-6 text-center text-sm text-fg-muted" aria-live="polite" aria-busy="true">
                        {t('common.loading')}
                    </p>
                )}

                {error && (
                    <p className="py-6 text-center text-sm text-danger-fg" role="alert">
                        {error}
                    </p>
                )}

                {detail && !isLoading && !error && (
                    <div className="mt-4 space-y-4">
                        {/* Три положения, как и в списке: измерено, только норма,
                            норму выбрать нельзя. Ноль не показывается ни в одном. */}
                        {detail.currentIntake !== undefined && detail.dailyTarget !== undefined ? (
                            <>
                                <p className="type-headline text-fg tabular-nums">
                                    {t('foodTracker.nutrientDetail.progress', {
                                        intake: String(detail.currentIntake),
                                        target: String(detail.dailyTarget),
                                        unit,
                                    })}
                                </p>
                                {/* Величина — нижняя граница: содержание известно не у
                                    всех съеденных продуктов. Об этом говорится рядом. */}
                                {detail.intakeCoverage &&
                                    detail.intakeCoverage.counted < detail.intakeCoverage.total && (
                                        <p className="text-sm text-fg-muted">
                                            {t('foodTracker.nutrientDetail.coverage', {
                                                counted: String(detail.intakeCoverage.counted),
                                                total: String(detail.intakeCoverage.total),
                                            })}
                                        </p>
                                    )}
                            </>
                        ) : detail.dailyTarget !== undefined ? (
                            <>
                                <p className="type-headline text-fg tabular-nums">
                                    {String(detail.dailyTarget)} {unit}
                                </p>
                                <p className="text-sm text-fg-muted">
                                    {t('foodTracker.nutrientDetail.intakeNotCounted')}
                                </p>
                            </>
                        ) : (
                            <>
                                {/* Норму выбрать нельзя, но съеденное мы знаем —
                                    терять его из-за незаполненного профиля незачем. */}
                                {detail.currentIntake !== undefined && (
                                    <p className="type-headline text-fg tabular-nums">
                                        {String(detail.currentIntake)} {unit}
                                    </p>
                                )}
                                <p className="text-sm text-fg-muted">
                                    {t('foodTracker.nutrientDetail.normNeedsProfile')}
                                </p>
                            </>
                        )}

                        {/* Границы нормы показываются только те, что заведены. */}
                        {detail.minRecommendation !== undefined && (
                            <p className="text-sm text-fg-muted">
                                {t('foodTracker.nutrientDetail.min', {
                                    value: String(detail.minRecommendation),
                                    unit,
                                })}
                            </p>
                        )}
                        {detail.optimalRecommendation !== undefined && (
                            <p className="text-sm text-fg-muted">
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

                        {/* Откуда норма. Через год спросят не «откуда нормы», а
                            «откуда эта», и ответ должен быть на экране. */}
                        {detail.normSource && (
                            <p className="type-caption text-fg-subtle">
                                {t('foodTracker.nutrientDetail.source', { source: detail.normSource })}
                                {detail.normNote ? ` — ${detail.normNote}` : ''}
                            </p>
                        )}

                        <section className="space-y-1">
                            <h4 className="type-overline text-fg-subtle">
                                {t('foodTracker.nutrientDetail.sources')}
                            </h4>
                            {detail.sourcesInDiet.length > 0 ? (
                                <ul className="divide-y divide-line">
                                    {detail.sourcesInDiet.map((source) => (
                                        <li
                                            key={`${source.foodName}-${source.amount}`}
                                            className="flex min-h-11 items-center justify-between gap-3 text-sm text-fg"
                                        >
                                            <span>{source.foodName}</span>
                                            <span className="whitespace-nowrap text-fg-muted tabular-nums">
                                                {source.contribution} {unit}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-fg-muted">
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
