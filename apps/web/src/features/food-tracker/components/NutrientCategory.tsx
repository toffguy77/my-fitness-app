/**
 * NutrientCategory Component
 *
 * Collapsible section displaying nutrient recommendations for a category.
 * Includes category name, expand/collapse toggle, and list of recommendations.
 *
 * @module food-tracker/components/NutrientCategory
 */

'use client';

import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { NutrientRecommendationItem } from './NutrientRecommendationItem';
import type { NutrientRecommendation, NutrientCategoryType } from '../types';
import { t } from '@/shared/i18n';

// ============================================================================
// Types
// ============================================================================

export interface NutrientCategoryProps {
    /** Category type */
    category: NutrientCategoryType;
    /** Category display label in Russian */
    label: string;
    /** Recommendations in this category */
    recommendations: NutrientRecommendation[];
    /** Current intakes by recommendation ID */
    currentIntakes: Record<string, number>;
    /** Покрытие по идентификатору нутриента. */
    intakeCoverage?: Record<string, { counted: number; total: number }>;
    /** Whether the category is expanded */
    isExpanded: boolean;
    /** Callback when toggle button clicked */
    onToggle: () => void;
    /** Callback when recommendation item clicked */
    onRecommendationClick: (recommendation: NutrientRecommendation) => void;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function NutrientCategory({
    category,
    label,
    recommendations,
    currentIntakes,
    intakeCoverage,
    isExpanded,
    onToggle,
    onRecommendationClick,
    className = '',
}: NutrientCategoryProps): React.ReactElement {
    return (
        <div
            className={`bg-surface rounded-xl shadow-sm border border-line overflow-hidden ${className}`}
            role="region"
            aria-label={t('foodTracker.nutrientCategory.aria', { label })}
        >
            {/* Category header - responsive */}
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-canvas transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus sm:px-4 sm:py-3 touch-manipulation"
                aria-expanded={isExpanded}
                aria-controls={`category-${category}-content`}
            >
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-sm font-medium text-fg sm:text-base">
                        {label}
                    </span>
                    <span className="text-xs text-fg-muted sm:text-sm">
                        ({recommendations.length})
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-fg-subtle sm:w-5 sm:h-5" aria-hidden="true" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-fg-subtle sm:w-5 sm:h-5" aria-hidden="true" />
                )}
            </button>

            {/* Category content - responsive */}
            {isExpanded && (
                <div
                    id={`category-${category}-content`}
                    className="px-3 pb-2.5 space-y-0.5 sm:px-4 sm:pb-3 sm:space-y-1"
                    role="list"
                    aria-label={t('foodTracker.nutrientCategory.listAria', { label })}
                >
                    {recommendations.map((rec) => (
                        <NutrientRecommendationItem
                            key={rec.id}
                            recommendation={rec}
                            // Отсутствие записи означает «неизвестно», а не ноль.
                            currentIntake={currentIntakes[rec.id]}
                            intakeCoverage={intakeCoverage?.[rec.id]}
                            onClick={() => onRecommendationClick(rec)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default NutrientCategory;
