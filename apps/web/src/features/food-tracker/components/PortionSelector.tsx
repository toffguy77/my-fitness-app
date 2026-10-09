/**
 * PortionSelector Component
 *
 * Allows users to select portion type and amount with real-time КБЖУ calculation.
 * Supports grams, milliliters, and portion-based measurements.
 *
 * @module food-tracker/components/PortionSelector
 */

'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { FoodItem, PortionType, KBZHU } from '../types';
import { calculateKBZHU, validatePortionAmount } from '../utils/kbzhuCalculator';
import { t } from '@/shared/i18n';
import { AlertCircle } from 'lucide-react';
import { MACRO_COLORS, type MacroKey } from '@/shared/constants/macros';

// ============================================================================
// Types
// ============================================================================

export interface PortionSelectorProps {
    /** Food item to calculate nutrition for */
    food: FoodItem;
    /** Initial portion type */
    initialPortionType?: PortionType;
    /** Initial portion amount */
    initialAmount?: number;
    /** Callback when portion changes */
    onPortionChange: (portionType: PortionType, amount: number, nutrition: KBZHU) => void;
    /** Whether the selector is disabled */
    disabled?: boolean;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const PORTION_TYPE_LABELS: Record<PortionType, string> = {
    grams: t('foodTracker.portion.typeGrams'),
    milliliters: t('foodTracker.portion.typeMilliliters'),
    portion: t('foodTracker.portion.typePortion'),
};

const PORTION_TYPE_UNITS: Record<PortionType, string> = {
    grams: t('units.gram'),
    milliliters: t('units.milliliter'),
    portion: t('units.piece'),
};

const QUICK_PORTIONS: Record<PortionType, number[]> = {
    grams: [50, 100, 150, 200, 250],
    milliliters: [100, 200, 250, 330, 500],
    portion: [0.5, 1, 1.5, 2, 3],
};

const MIN_PORTION = 1;
const MAX_PORTION_GRAMS = 2000;
const MAX_PORTION_ML = 2000;
const MAX_PORTION_UNITS = 10;

// ============================================================================
// Component
// ============================================================================

export function PortionSelector({
    food,
    initialPortionType = 'grams',
    initialAmount = 100,
    onPortionChange,
    disabled = false,
    className = '',
}: PortionSelectorProps): React.ReactElement {
    // State
    const [portionType, setPortionType] = useState<PortionType>(initialPortionType);
    const [amount, setAmount] = useState<number>(initialAmount);
    const [inputValue, setInputValue] = useState<string>(String(initialAmount));
    const [error, setError] = useState<string | null>(null);

    // Calculate max value based on portion type
    const maxValue = useMemo(() => {
        switch (portionType) {
            case 'grams':
                return MAX_PORTION_GRAMS;
            case 'milliliters':
                return MAX_PORTION_ML;
            case 'portion':
                return MAX_PORTION_UNITS;
            default:
                return MAX_PORTION_GRAMS;
        }
    }, [portionType]);

    // Calculate nutrition based on current portion
    const calculatedNutrition = useMemo(() => {
        if (portionType === 'portion') {
            // For portions, multiply by serving size
            const effectiveAmount = amount * food.servingSize;
            return calculateKBZHU(food.nutritionPer100, effectiveAmount);
        }
        return calculateKBZHU(food.nutritionPer100, amount);
    }, [food, portionType, amount]);

    // Validate and update amount
    const updateAmount = useCallback((newAmount: number) => {
        const validation = validatePortionAmount(newAmount);

        if (!validation.isValid) {
            setError(validation.error || t('common.invalidValue'));
            return;
        }

        if (newAmount > maxValue) {
            setError(t('foodTracker.portion.maxValue', { max: maxValue, unit: PORTION_TYPE_UNITS[portionType] }));
            return;
        }

        setError(null);
        setAmount(newAmount);
    }, [maxValue, portionType]);

    // Handle input change
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInputValue(value);

        // Allow empty input while typing
        if (value === '') {
            setError(t('foodTracker.portion.required'));
            return;
        }

        const numValue = parseFloat(value.replace(',', '.'));

        if (isNaN(numValue)) {
            setError(t('foodTracker.portion.notANumber'));
            return;
        }

        updateAmount(numValue);
    }, [updateAmount]);

    // Handle input blur - reset to valid value if invalid
    const handleInputBlur = useCallback(() => {
        if (inputValue === '' || isNaN(parseFloat(inputValue.replace(',', '.')))) {
            setInputValue(String(amount));
            setError(null);
        }
    }, [inputValue, amount]);

    // Handle slider change
    const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value);
        setInputValue(String(value));
        updateAmount(value);
    }, [updateAmount]);

    // Handle portion type change
    const handlePortionTypeChange = useCallback((newType: PortionType) => {
        setPortionType(newType);
        // Reset to default amount for new type
        const defaultAmount = newType === 'portion' ? 1 : 100;
        setAmount(defaultAmount);
        setInputValue(String(defaultAmount));
        setError(null);
    }, []);

    // Handle quick portion button click
    const handleQuickPortionClick = useCallback((quickAmount: number) => {
        setInputValue(String(quickAmount));
        updateAmount(quickAmount);
    }, [updateAmount]);

    // Notify parent of changes
    useEffect(() => {
        if (!error && amount > 0) {
            onPortionChange(portionType, amount, calculatedNutrition);
        }
    }, [portionType, amount, calculatedNutrition, error, onPortionChange]);

    // Slider step based on portion type
    const sliderStep = portionType === 'portion' ? 0.5 : 1;

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Portion Type Toggle */}
            {/* Переключатель из трёх вариантов — сегменты, выбранный чернилами. */}
            <div className="flex gap-1 rounded-full border border-line p-1" role="tablist" aria-label={t('foodTracker.portion.typeAria')}>
                {(Object.keys(PORTION_TYPE_LABELS) as PortionType[]).map((type) => (
                    <button
                        key={type}
                        type="button"
                        role="tab"
                        aria-selected={portionType === type}
                        aria-controls={`portion-panel-${type}`}
                        onClick={() => handlePortionTypeChange(type)}
                        disabled={disabled}
                        className={`
                            h-10 flex-1 rounded-full px-3 text-sm font-semibold transition-colors duration-150
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation
                            ${portionType === type
                                ? 'bg-fg text-fg-inverse'
                                : 'text-fg-muted hover:bg-subtle hover:text-fg'
                            }
                            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {PORTION_TYPE_LABELS[type]}
                    </button>
                ))}
            </div>

            {/* Portion Input */}
            <div
                id={`portion-panel-${portionType}`}
                role="tabpanel"
                aria-labelledby={`portion-tab-${portionType}`}
            >
                <div className="space-y-3">
                    {/* Numeric Input with Unit */}
                    <div className="flex items-center gap-2">
                        <label htmlFor="portion-input" className="sr-only">
                            {t('foodTracker.portion.amount')}
                        </label>
                        <input
                            id="portion-input"
                            type="text"
                            inputMode="decimal"
                            min={MIN_PORTION}
                            max={maxValue}
                            step={sliderStep}
                            value={inputValue}
                            onChange={handleInputChange}
                            onBlur={handleInputBlur}
                            disabled={disabled}
                            aria-invalid={!!error}
                            aria-describedby={error ? 'portion-error' : undefined}
                            className={`
                                h-12 w-28 rounded-field border px-3 text-center text-lg font-semibold text-fg tabular-nums
                                transition-colors focus:outline-none focus:ring-2
                                ${error
                                    ? 'border-danger focus:ring-danger'
                                    : 'border-line focus:border-line-strong focus:ring-focus/30'
                                }
                                ${disabled ? 'bg-subtle cursor-not-allowed' : 'bg-surface'}
                            `}
                        />
                        <span className="font-medium text-fg-muted">
                            {PORTION_TYPE_UNITS[portionType]}
                        </span>
                    </div>

                    {/* Slider */}
                    <div className="px-1">
                        <label htmlFor="portion-slider" className="sr-only">
                            {t('foodTracker.portion.slider')}
                        </label>
                        <input
                            id="portion-slider"
                            type="range"
                            min={MIN_PORTION}
                            max={maxValue}
                            step={sliderStep}
                            value={amount}
                            onChange={handleSliderChange}
                            disabled={disabled}
                            className={`
                                h-11 w-full cursor-pointer accent-primary
                                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                        />
                        <div className="flex justify-between text-xs text-fg-muted tabular-nums">
                            <span>{MIN_PORTION}</span>
                            <span>{maxValue} {PORTION_TYPE_UNITS[portionType]}</span>
                        </div>
                    </div>

                    {/* Quick Portion Buttons */}
                    <div className="flex flex-wrap gap-2">
                        {QUICK_PORTIONS[portionType].map((quickAmount) => (
                            <button
                                key={quickAmount}
                                type="button"
                                onClick={() => handleQuickPortionClick(quickAmount)}
                                disabled={disabled}
                                className={`
                                    h-11 rounded-full border px-4 text-sm font-semibold tabular-nums transition-colors duration-150
                                    focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation
                                    ${amount === quickAmount
                                        ? 'border-fg bg-fg text-fg-inverse'
                                        : 'border-line bg-surface text-fg hover:bg-subtle'
                                    }
                                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                                `}
                                aria-pressed={amount === quickAmount}
                            >
                                {quickAmount} {PORTION_TYPE_UNITS[portionType]}
                            </button>
                        ))}
                    </div>

                    {/* Error Message */}
                    {error && (
                        <p
                            id="portion-error"
                            role="alert"
                            className="text-sm text-danger-fg flex items-center gap-1"
                        >
                            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                            {error}
                        </p>
                    )}
                </div>
            </div>

            {/* КБЖУ Display */}
            <div className="rounded-tile bg-subtle p-4">
                <h4 className="type-overline mb-3 text-fg-subtle">
                    {t('foodTracker.portion.nutrition')}
                </h4>
                <div className="grid grid-cols-4 gap-3">
                    <NutrientDisplay
                        label={t('macros.calories')}
                        value={calculatedNutrition.calories}
                        unit=""
                    />
                    <NutrientDisplay
                        label={t('macros.protein')}
                        macro="protein"
                        value={calculatedNutrition.protein}
                        unit={t('units.gram')}
                    />
                    <NutrientDisplay
                        label={t('macros.fat')}
                        macro="fat"
                        value={calculatedNutrition.fat}
                        unit={t('units.gram')}
                    />
                    <NutrientDisplay
                        label={t('macros.carbs')}
                        macro="carbs"
                        value={calculatedNutrition.carbs}
                        unit={t('units.gram')}
                    />
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Helper Components
// ============================================================================

interface NutrientDisplayProps {
    label: string;
    value: number;
    unit: string;
    /** Нутриент: точка его цвета опознаёт строку и ничего не оценивает. */
    macro?: MacroKey;
}

function NutrientDisplay({ label, value, unit, macro }: NutrientDisplayProps): React.ReactElement {
    return (
        <div className="text-center">
            <div className="text-lg font-semibold text-fg tabular-nums">
                {value}{unit && <span className="ml-0.5 text-sm font-normal text-fg-muted">{unit}</span>}
            </div>
            <div className="flex items-center justify-center gap-1 text-xs text-fg-muted">
                {macro && (
                    <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: MACRO_COLORS[macro] }}
                        aria-hidden="true"
                    />
                )}
                {label}
            </div>
        </div>
    );
}

export default PortionSelector;
