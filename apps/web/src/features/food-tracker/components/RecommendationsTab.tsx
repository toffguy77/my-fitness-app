/**
 * RecommendationsTab Component
 *
 * Tab for displaying nutrient recommendations organized by category.
 * Includes daily and weekly recommendations, configuration options,
 * and custom recommendation support.
 *
 * @module food-tracker/components/RecommendationsTab
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Settings, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { NutrientCategory } from './NutrientCategory';
import { NutrientRecommendationItem } from './NutrientRecommendationItem';
import type {
    NutrientRecommendation,
    NutrientCategoryType,
    CustomRecommendation,
} from '../types';
import { t } from '@/shared/i18n';
import { Button } from '@/shared/components/ui/Button';

import { unitLabel } from '../utils/unitLabel'
// ============================================================================
// Types
// ============================================================================

export interface RecommendationsTabProps {
    /** Nutrient recommendations */
    recommendations?: NutrientRecommendation[];
    /** Custom user recommendations */
    customRecommendations?: CustomRecommendation[];
    /** Current nutrient intakes by nutrient ID */
    currentIntakes?: Record<string, number>;
    /**
     * По скольким записям дня посчитано потребление, по идентификатору нутриента.
     *
     * Содержание микронутриентов известно не у всех продуктов справочника, и
     * величина — нижняя граница.
     */
    intakeCoverage?: Record<string, { counted: number; total: number }>;
    /** Whether data is loading */
    isLoading?: boolean;
    /**
     * Справочник нутриентов пуст.
     *
     * Отличается от «нет отслеживаемых»: настройками это не лечится, потому что
     * выбирать не из чего. `nutrient_recommendations` пуст и на dev, и на проде.
     */
    catalogueEmpty?: boolean;
    /**
     * Есть ли записи о еде за день, по которым считается потребление.
     *
     * `undefined` — неизвестно (выбран не сегодняшний день), и тогда об этом
     * ничего не говорится, вместо того чтобы угадывать.
     */
    hasEntriesToday?: boolean;
    /** Показывается ли не сегодняшний день: потребление сервер считает за сегодня. */
    showsOtherDay?: boolean;
    /** Текст ошибки загрузки. */
    error?: string | null;
    /** Повторить загрузку. */
    onRetry?: () => void;
    /** Callback when configure button clicked */
    onConfigureClick?: () => void;
    /** Callback when add recommendation button clicked */
    onAddRecommendationClick?: () => void;
    /** Callback when recommendation item clicked */
    onRecommendationClick?: (recommendation: NutrientRecommendation) => void;
    /** Callback when custom recommendation clicked */
    onCustomRecommendationClick?: (recommendation: CustomRecommendation) => void;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_LABELS: Record<NutrientCategoryType, string> = {
    vitamins: t('foodTracker.nutrientCategories.vitamins'),
    minerals: t('foodTracker.nutrientCategories.minerals'),
    lipids: t('foodTracker.nutrientCategories.lipids'),
    fiber: t('foodTracker.nutrientCategories.fiber'),
    plant: t('foodTracker.nutrientCategories.plant'),
};

const CATEGORY_ORDER: NutrientCategoryType[] = [
    'vitamins',
    'minerals',
    'lipids',
    'fiber',
    'plant',
];

// ============================================================================
// Component
// ============================================================================

export function RecommendationsTab({
    recommendations = [],
    customRecommendations = [],
    currentIntakes = {},
    intakeCoverage = {},
    isLoading = false,
    catalogueEmpty = false,
    hasEntriesToday,
    showsOtherDay = false,
    error = null,
    onRetry,
    onConfigureClick,
    onAddRecommendationClick,
    onRecommendationClick,
    onCustomRecommendationClick,
    className = '',
}: RecommendationsTabProps): React.ReactElement {
    // Track expanded categories
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
        new Set(CATEGORY_ORDER)
    );
    const [isWeeklyExpanded, setIsWeeklyExpanded] = useState(true);
    const [isCustomExpanded, setIsCustomExpanded] = useState(true);

    // Group recommendations by category
    const recommendationsByCategory = useMemo(() => {
        const grouped: Record<NutrientCategoryType, NutrientRecommendation[]> = {
            vitamins: [],
            minerals: [],
            lipids: [],
            fiber: [],
            plant: [],
        };

        recommendations
            .filter((rec) => !rec.isWeekly)
            .forEach((rec) => {
                if (grouped[rec.category]) {
                    grouped[rec.category].push(rec);
                }
            });

        return grouped;
    }, [recommendations]);

    // Get weekly recommendations
    const weeklyRecommendations = useMemo(
        () => recommendations.filter((rec) => rec.isWeekly),
        [recommendations]
    );

    // Есть ли хоть один нутриент, потребление которого продукт считает. Для
    // витаминов и минералов — нет, и тогда «нет записей о еде» было бы не той
    // причиной: записи есть, а считать по ним микронутриенты продукт не умеет.
    const anyIntakeKnown = useMemo(
        () => recommendations.some((rec) => currentIntakes[rec.id] !== undefined),
        [recommendations, currentIntakes]
    );

    // Норма зависит от пола или возраста, а в профиле их нет.
    const anyNormNeedsProfile = useMemo(
        () => recommendations.some((rec) => rec.normNeedsProfile),
        [recommendations]
    );

    // Toggle category expansion
    const toggleCategory = useCallback((category: string) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    }, []);

    // Handle recommendation click
    const handleRecommendationClick = useCallback(
        (recommendation: NutrientRecommendation) => {
            onRecommendationClick?.(recommendation);
        },
        [onRecommendationClick]
    );

    // Handle custom recommendation click
    const handleCustomRecommendationClick = useCallback(
        (recommendation: CustomRecommendation) => {
            onCustomRecommendationClick?.(recommendation);
        },
        [onCustomRecommendationClick]
    );

    return (
        <div
            className={`space-y-4 pb-20 sm:pb-24 ${className}`}
            aria-label={t('foodTracker.recommendations.aria')}
        >
            {/* Header with action buttons - responsive */}
            <div className="flex items-center justify-between">
                <h2 className="type-title-2 text-fg">
                    {t('foodTracker.recommendations.title')}
                </h2>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onConfigureClick}
                        className="min-w-11 px-3 touch-manipulation"
                        aria-label={t('foodTracker.recommendations.configureAria')}
                    >
                        <Settings className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                        <span className="hidden sm:inline">{t('foodTracker.recommendations.configure')}</span>
                    </Button>
                </div>
            </div>

            {/* Загрузка не удалась: показанное ниже — не измерение. */}
            {error && (
                <div
                    className="rounded-tile bg-danger-soft px-4 py-3"
                    role="alert"
                >
                    <p className="text-sm text-danger-fg">{error}</p>
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="-mb-2 inline-flex min-h-11 items-center text-sm font-semibold text-danger-fg underline touch-manipulation"
                        >
                            {t('foodTracker.recommendations.retry')}
                        </button>
                    )}
                </div>
            )}

            {/* Потребление сервер считает за сегодня, а не за выбранный день. */}
            {!isLoading && !error && showsOtherDay && (
                <p className="text-sm text-fg-muted">
                    {t('foodTracker.recommendations.todayOnly')}
                </p>
            )}

            {/* Почему рядом с нормами нет прогресса. Две разные причины, и путать
                их нельзя: либо продукт не считает этот нутриент, либо считать
                нечего — за день нет записей. */}
            {!isLoading && !error && !catalogueEmpty && !anyIntakeKnown && recommendations.length > 0 && (
                <p className="text-sm text-fg-muted">
                    {t('foodTracker.recommendations.intakeNotCounted')}
                </p>
            )}

            {!isLoading && !error && !catalogueEmpty && anyIntakeKnown && hasEntriesToday === false && (
                <p className="text-sm text-fg-muted">
                    {t('foodTracker.recommendations.noEntriesToday')}
                </p>
            )}

            {/* Норму железа без пола не выбрать: 10 мг или 18. Вместо догадки —
                просьба заполнить профиль, и это единственное место в продукте, где
                заполнение сразу что-то даёт. */}
            {!isLoading && !error && anyNormNeedsProfile && (
                <div className="rounded-tile bg-info-soft px-4 py-3">
                    <p className="text-sm text-info-fg">
                        {t('foodTracker.recommendations.profileNeeded')}
                    </p>
                    <a
                        href="/settings/body"
                        className="-mb-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
                    >
                        {t('foodTracker.recommendations.profileLink')}
                    </a>
                </div>
            )}

            {/* Loading state */}
            {isLoading && (
                <div className="flex items-center justify-center py-6 sm:py-8" aria-live="polite" aria-busy="true">
                    <div className="flex flex-col items-center gap-2">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" />
                        <span className="text-sm text-fg-muted">{t('common.loading')}</span>
                    </div>
                </div>
            )}

            {/* Daily recommendations by category */}
            {!isLoading && (
                <>
                    <section aria-label={t('foodTracker.recommendations.dailyAria')}>
                        <h3 className="type-overline mb-2 text-fg-subtle">
                            {t('foodTracker.recommendations.daily')}
                        </h3>

                        <div className="space-y-2">
                            {CATEGORY_ORDER.map((category) => {
                                const categoryRecs = recommendationsByCategory[category];
                                if (categoryRecs.length === 0) return null;

                                const isExpanded = expandedCategories.has(category);

                                return (
                                    <NutrientCategory
                                        key={category}
                                        category={category}
                                        label={CATEGORY_LABELS[category]}
                                        recommendations={categoryRecs}
                                        currentIntakes={currentIntakes}
                                        intakeCoverage={intakeCoverage}
                                        isExpanded={isExpanded}
                                        onToggle={() => toggleCategory(category)}
                                        onRecommendationClick={handleRecommendationClick}
                                    />
                                );
                            })}
                        </div>

                        {/* Пусто по двум разным причинам, и человеку они не всё равно:
                            справочник норм не заполнен — настройки не помогут;
                            нутриенты выключены — помогут именно они. */}
                        {recommendations.filter((r) => !r.isWeekly).length === 0 && (
                            <div className="py-8 text-center text-fg-muted">
                                {catalogueEmpty ? (
                                    <p className="text-sm">
                                        {t('foodTracker.recommendations.catalogueEmpty')}
                                    </p>
                                ) : (
                                    <>
                                        <p className="text-sm">{t('foodTracker.recommendations.noDaily')}</p>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="mt-3 touch-manipulation"
                                            onClick={onConfigureClick}
                                        >
                                            {t('foodTracker.recommendations.configure')}
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}
                    </section>

                    {/* Weekly recommendations */}
                    {weeklyRecommendations.length > 0 && (
                        <section aria-label={t('foodTracker.recommendations.weeklyAria')}>
                            <button
                                type="button"
                                onClick={() => setIsWeeklyExpanded(!isWeeklyExpanded)}
                                className="flex min-h-11 w-full items-center justify-between rounded-tile text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation"
                                aria-expanded={isWeeklyExpanded}
                            >
                                <h3 className="type-overline text-fg-subtle">
                                    {t('foodTracker.recommendations.weekly')}
                                </h3>
                                {isWeeklyExpanded ? (
                                    <ChevronDown className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                                ) : (
                                    <ChevronRight className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                                )}
                            </button>

                            {isWeeklyExpanded && (
                                <div className="mt-2 divide-y divide-line rounded-card border border-line bg-surface px-2">
                                    {weeklyRecommendations.map((rec) => (
                                        <NutrientRecommendationItem
                                            key={rec.id}
                                            recommendation={rec}
                                            currentIntake={currentIntakes[rec.id]}
                                            intakeCoverage={intakeCoverage[rec.id]}
                                            onClick={() => handleRecommendationClick(rec)}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                    {/* Custom recommendations */}
                    <section aria-label={t('foodTracker.recommendations.customAria')}>
                        <button
                            type="button"
                            onClick={() => setIsCustomExpanded(!isCustomExpanded)}
                            className="flex min-h-11 w-full items-center justify-between rounded-tile text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation"
                            aria-expanded={isCustomExpanded}
                        >
                            <h3 className="type-overline text-fg-subtle">
                                {t('foodTracker.recommendations.custom')}
                            </h3>
                            {isCustomExpanded ? (
                                <ChevronDown className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                            ) : (
                                <ChevronRight className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                            )}
                        </button>

                        {isCustomExpanded && (
                            <div className="mt-2 divide-y divide-line rounded-card border border-line bg-surface px-2">
                                {customRecommendations.length > 0 ? (
                                    customRecommendations.map((rec) => (
                                        <button
                                            key={rec.id}
                                            type="button"
                                            onClick={() => handleCustomRecommendationClick(rec)}
                                            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-tile px-2 text-left transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation"
                                        >
                                            <span className="truncate text-sm font-medium text-fg">
                                                {rec.name}
                                            </span>
                                            {/* Потребление по своей рекомендации сервер не
                                                считает. Ноль нарисовал бы «0 из 500 мг» и
                                                выглядел бы как измерение. */}
                                            <span className="whitespace-nowrap text-[13px] text-fg-muted tabular-nums">
                                                {rec.currentIntake === undefined
                                                    ? t('foodTracker.recommendations.targetOnly', {
                                                        target: String(rec.dailyTarget),
                                                        unit: unitLabel(rec.unit),
                                                    })
                                                    : `${rec.currentIntake} / ${rec.dailyTarget} ${unitLabel(rec.unit)}`}
                                            </span>
                                        </button>
                                    ))
                                ) : (
                                    <p className="py-4 text-center text-sm text-fg-muted">
                                        {t('foodTracker.recommendations.noCustom')}
                                    </p>
                                )}

                                {/* Add custom recommendation button */}
                                <div className="py-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        block
                                        onClick={onAddRecommendationClick}
                                        className="touch-manipulation"
                                        aria-label={t('foodTracker.recommendations.add')}
                                    >
                                        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                                        <span>{t('foodTracker.recommendations.add')}</span>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

export default RecommendationsTab;
