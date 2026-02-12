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
    isExpanded,
    onToggle,
    onRecommendationClick,
    className = '',
}: NutrientCategoryProps): React.ReactElement {
    return (
        <div
            className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}
            role="region"
            aria-label={`${label} - категория питательных веществ`}
        >
            {/* Category header - responsive */}
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-4 sm:py-3 touch-manipulation"
                aria-expanded={isExpanded}
                aria-controls={`category-${category}-content`}
            >
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-sm font-medium text-gray-900 sm:text-base">
                        {label}
                    </span>
                    <span className="text-xs text-gray-500 sm:text-sm">
                        ({recommendations.length})
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 sm:w-5 sm:h-5" aria-hidden="true" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 sm:w-5 sm:h-5" aria-hidden="true" />
                )}
            </button>

            {/* Category content - responsive */}
            {isExpanded && (
                <div
                    id={`category-${category}-content`}
                    className="px-3 pb-2.5 space-y-0.5 sm:px-4 sm:pb-3 sm:space-y-1"
                    role="list"
                    aria-label={`Рекомендации в категории ${label}`}
                >
                    {recommendations.map((rec) => (
                        <NutrientRecommendationItem
                            key={rec.id}
                            recommendation={rec}
                            currentIntake={currentIntakes[rec.id] || 0}
                            onClick={() => onRecommendationClick(rec)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default NutrientCategory;
