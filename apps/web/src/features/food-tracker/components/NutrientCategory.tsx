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
            className={`overflow-hidden rounded-card border border-line bg-surface ${className}`}
            role="region"
            aria-label={t('foodTracker.nutrientCategory.aria', { label })}
        >
            {/* Category header - responsive */}
            <button
                type="button"
                onClick={onToggle}
                className="flex min-h-14 w-full items-center justify-between px-4 text-left transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus touch-manipulation"
                aria-expanded={isExpanded}
                aria-controls={`category-${category}-content`}
            >
                <div className="flex items-center gap-2">
                    <span className="type-headline text-fg">
                        {label}
                    </span>
                    <span className="text-sm text-fg-muted tabular-nums">
                        ({recommendations.length})
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                ) : (
                    <ChevronRight className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                )}
            </button>

            {/* Category content - responsive */}
            {isExpanded && (
                <div
                    id={`category-${category}-content`}
                    className="divide-y divide-line border-t border-line px-2"
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
