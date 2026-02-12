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

// ============================================================================
// Types
// ============================================================================

export interface RecommendationsTabProps {
    /** Selected date in YYYY-MM-DD format */
    date: string;
    /** Nutrient recommendations */
    recommendations?: NutrientRecommendation[];
    /** Custom user recommendations */
    customRecommendations?: CustomRecommendation[];
    /** Current nutrient intakes by nutrient ID */
    currentIntakes?: Record<string, number>;
    /** Whether data is loading */
    isLoading?: boolean;
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
    vitamins: 'Витамины',
    minerals: 'Минералы',
    lipids: 'Липиды',
    fiber: 'Клетчатка',
    plant: 'Растительность',
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
    date,
    recommendations = [],
    customRecommendations = [],
    currentIntakes = {},
    isLoading = false,
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
            className={`space-y-3 pb-20 sm:space-y-4 sm:pb-24 ${className}`}
            aria-label="Рекомендации по питательным веществам"
        >
            {/* Header with action buttons - responsive */}
            <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
                    Рекомендации
                </h2>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                        type="button"
                        onClick={onConfigureClick}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm touch-manipulation"
                        aria-label="Настроить список рекомендаций"
                    >
                        <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                        <span className="hidden sm:inline">Настроить список</span>
                    </button>
                </div>
            </div>

            {/* Loading state */}
            {isLoading && (
                <div className="flex items-center justify-center py-6 sm:py-8" aria-live="polite" aria-busy="true">
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin sm:w-6 sm:h-6" />
                        <span className="text-xs text-gray-500 sm:text-sm">Загрузка...</span>
                    </div>
                </div>
            )}

            {/* Daily recommendations by category */}
            {!isLoading && (
                <>
                    <section aria-label="Дневные рекомендации">
                        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 sm:text-sm sm:mb-3">
                            Дневные рекомендации
                        </h3>

                        <div className="space-y-1.5 sm:space-y-2">
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
                                        isExpanded={isExpanded}
                                        onToggle={() => toggleCategory(category)}
                                        onRecommendationClick={handleRecommendationClick}
                                    />
                                );
                            })}
                        </div>

                        {/* Empty state for daily recommendations */}
                        {recommendations.filter((r) => !r.isWeekly).length === 0 && (
                            <div className="text-center py-6 text-gray-500 sm:py-8">
                                <p className="text-xs sm:text-sm">Нет дневных рекомендаций</p>
                                <button
                                    type="button"
                                    onClick={onConfigureClick}
                                    className="mt-1.5 text-xs text-blue-500 hover:text-blue-600 sm:mt-2 sm:text-sm touch-manipulation"
                                >
                                    Настроить список
                                </button>
                            </div>
                        )}
                    </section>

                    {/* Weekly recommendations */}
                    {weeklyRecommendations.length > 0 && (
                        <section aria-label="Недельные рекомендации">
                            <button
                                type="button"
                                onClick={() => setIsWeeklyExpanded(!isWeeklyExpanded)}
                                className="flex items-center justify-between w-full py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded sm:py-2 touch-manipulation"
                                aria-expanded={isWeeklyExpanded}
                            >
                                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide sm:text-sm">
                                    Недельные рекомендации
                                </h3>
                                {isWeeklyExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 sm:w-4 sm:h-4" aria-hidden="true" />
                                ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-gray-400 sm:w-4 sm:h-4" aria-hidden="true" />
                                )}
                            </button>

                            {isWeeklyExpanded && (
                                <div className="mt-1.5 space-y-1 bg-white rounded-xl shadow-sm border border-gray-200 p-2 sm:mt-2 sm:p-3">
                                    {weeklyRecommendations.map((rec) => (
                                        <NutrientRecommendationItem
                                            key={rec.id}
                                            recommendation={rec}
                                            currentIntake={currentIntakes[rec.id] || 0}
                                            onClick={() => handleRecommendationClick(rec)}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                    {/* Custom recommendations */}
                    <section aria-label="Пользовательские рекомендации">
                        <button
                            type="button"
                            onClick={() => setIsCustomExpanded(!isCustomExpanded)}
                            className="flex items-center justify-between w-full py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded sm:py-2 touch-manipulation"
                            aria-expanded={isCustomExpanded}
                        >
                            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide sm:text-sm">
                                Пользовательские
                            </h3>
                            {isCustomExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400 sm:w-4 sm:h-4" aria-hidden="true" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-gray-400 sm:w-4 sm:h-4" aria-hidden="true" />
                            )}
                        </button>

                        {isCustomExpanded && (
                            <div className="mt-1.5 space-y-1 bg-white rounded-xl shadow-sm border border-gray-200 p-2 sm:mt-2 sm:p-3">
                                {customRecommendations.length > 0 ? (
                                    customRecommendations.map((rec) => (
                                        <button
                                            key={rec.id}
                                            type="button"
                                            onClick={() => handleCustomRecommendationClick(rec)}
                                            className="flex items-center justify-between w-full p-1.5 hover:bg-gray-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-2 touch-manipulation"
                                        >
                                            <span className="text-xs font-medium text-gray-900 sm:text-sm">
                                                {rec.name}
                                            </span>
                                            <span className="text-xs text-gray-500 sm:text-sm">
                                                {rec.currentIntake} / {rec.dailyTarget} {rec.unit}
                                            </span>
                                        </button>
                                    ))
                                ) : (
                                    <p className="text-xs text-gray-500 text-center py-1.5 sm:text-sm sm:py-2">
                                        Нет пользовательских рекомендаций
                                    </p>
                                )}

                                {/* Add custom recommendation button */}
                                <button
                                    type="button"
                                    onClick={onAddRecommendationClick}
                                    className="flex items-center justify-center gap-1 w-full p-1.5 mt-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:gap-1.5 sm:p-2 sm:mt-2 sm:text-sm touch-manipulation"
                                    aria-label="Добавить рекомендацию"
                                >
                                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                                    <span>Добавить рекомендацию</span>
                                </button>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

export default RecommendationsTab;
