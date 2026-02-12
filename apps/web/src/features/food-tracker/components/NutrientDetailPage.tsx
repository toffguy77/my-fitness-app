/**
 * NutrientDetailPage Component
 *
 * Displays detailed information about a specific nutrient including:
 * - Progress bar and current/target values
 * - Description and benefits
 * - Effects on health
 * - Food sources from current diet
 * - Min/optimal recommendations
 *
 * @module food-tracker/components/NutrientDetailPage
 */

'use client';

import React, { useMemo } from 'react';
import { ArrowLeft, Info, Heart, Utensils } from 'lucide-react';
import type { NutrientDetail, NutrientFoodSource, ProgressColor } from '../types';
import { getProgressColor, getPercentage } from '../utils/kbzhuCalculator';

// ============================================================================
// Types
// ============================================================================

export interface NutrientDetailPageProps {
    /** Nutrient detail data */
    nutrient: NutrientDetail;
    /** Current intake amount */
    currentIntake: number;
    /** Whether this is a weekly view */
    isWeekly?: boolean;
    /** Callback when back button clicked */
    onBack: () => void;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get CSS class for progress bar color
 */
function getProgressColorClass(color: ProgressColor): string {
    switch (color) {
        case 'green':
            return 'bg-green-500';
        case 'yellow':
            return 'bg-yellow-500';
        case 'red':
            return 'bg-red-500';
        default:
            return 'bg-gray-400';
    }
}

/**
 * Format number for display
 */
function formatNumber(value: number): string {
    if (Number.isInteger(value)) {
        return value.toString();
    }
    return Math.round(value * 10) / 10 + '';
}

// ============================================================================
// Sub-components
// ============================================================================

interface InfoSectionProps {
    icon: React.ReactNode;
    title: string;
    content: string;
}

function InfoSection({ icon, title, content }: InfoSectionProps): React.ReactElement {
    return (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-blue-600">{icon}</span>
                <h3 className="text-base font-medium text-gray-900">{title}</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{content}</p>
        </section>
    );
}

interface FoodSourceItemProps {
    source: NutrientFoodSource;
}

function FoodSourceItem({ source }: FoodSourceItemProps): React.ReactElement {
    return (
        <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-900">{source.foodName}</span>
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                    {formatNumber(source.amount)} {source.unit}
                </span>
                <span className="text-xs text-gray-400">
                    ({formatNumber(source.contribution)}%)
                </span>
            </div>
        </div>
    );
}

// ============================================================================
// Component
// ============================================================================

export function NutrientDetailPage({
    nutrient,
    currentIntake,
    isWeekly = false,
    onBack,
    className = '',
}: NutrientDetailPageProps): React.ReactElement {
    const {
        name,
        description,
        benefits,
        effects,
        minRecommendation,
        optimalRecommendation,
        unit,
        sourcesInDiet,
    } = nutrient;

    // Calculate progress
    const percentage = useMemo(
        () => getPercentage(currentIntake, optimalRecommendation),
        [currentIntake, optimalRecommendation]
    );

    // Get progress bar color
    const progressColor = useMemo(
        () => getProgressColor(currentIntake, optimalRecommendation),
        [currentIntake, optimalRecommendation]
    );

    // Cap progress bar at 100% for display
    const displayPercentage = Math.min(percentage, 100);

    return (
        <div className={`min-h-screen bg-gray-50 ${className}`}>
            {/* Header */}
            <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
                <div className="flex items-center gap-3 px-4 py-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label="Назад к рекомендациям"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-semibold text-gray-900">
                        {name}
                        {isWeekly && (
                            <span className="ml-2 text-sm font-normal text-gray-500">
                                (неделя)
                            </span>
                        )}
                    </h1>
                </div>
            </header>

            {/* Content */}
            <main className="p-4 space-y-4">
                {/* Progress Section */}
                <section
                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
                    aria-label="Прогресс потребления"
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                            Текущее потребление
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                            {formatNumber(currentIntake)} / {formatNumber(optimalRecommendation)} {unit}
                        </span>
                    </div>

                    {/* Progress bar */}
                    <div
                        className="h-3 bg-gray-200 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={Math.round(percentage)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${name} прогресс: ${Math.round(percentage)}%`}
                    >
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${getProgressColorClass(progressColor)}`}
                            style={{ width: `${displayPercentage}%` }}
                        />
                    </div>

                    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                        <span>{Math.round(percentage)}% от нормы</span>
                        <span>
                            Мин: {formatNumber(minRecommendation)} {unit} | Оптимум: {formatNumber(optimalRecommendation)} {unit}
                        </span>
                    </div>
                </section>

                {/* What is it and why take it */}
                <InfoSection
                    icon={<Info className="w-5 h-5" />}
                    title="Что это и зачем принимать"
                    content={description || 'Информация недоступна'}
                />

                {/* What it affects and how */}
                <InfoSection
                    icon={<Heart className="w-5 h-5" />}
                    title="На что влияет и как"
                    content={effects || 'Информация недоступна'}
                />

                {/* Benefits */}
                {benefits && (
                    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h3 className="text-base font-medium text-gray-900 mb-3">
                            Польза
                        </h3>
                        <p className="text-sm text-gray-600 leading-relaxed">{benefits}</p>
                    </section>
                )}

                {/* Sources in diet */}
                <section
                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
                    aria-label="Источники в рационе"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-blue-600">
                            <Utensils className="w-5 h-5" />
                        </span>
                        <h3 className="text-base font-medium text-gray-900">
                            Источники в рационе
                        </h3>
                    </div>

                    {sourcesInDiet && sourcesInDiet.length > 0 ? (
                        <div className="divide-y divide-gray-100">
                            {sourcesInDiet.map((source, index) => (
                                <FoodSourceItem key={index} source={source} />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 text-center py-4">
                            В вашем рационе пока нет продуктов с этим нутриентом
                        </p>
                    )}
                </section>

                {/* Recommendations */}
                <section className="bg-blue-50 rounded-xl p-4">
                    <h3 className="text-base font-medium text-blue-900 mb-2">
                        Рекомендации
                    </h3>
                    <ul className="text-sm text-blue-800 space-y-1">
                        <li>
                            • Минимальная норма: {formatNumber(minRecommendation)} {unit}
                        </li>
                        <li>
                            • Оптимальная норма: {formatNumber(optimalRecommendation)} {unit}
                        </li>
                    </ul>
                </section>
            </main>
        </div>
    );
}

export default NutrientDetailPage;
