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
    grams: 'Граммы',
    milliliters: 'Миллилитры',
    portion: 'Порция',
};

const PORTION_TYPE_UNITS: Record<PortionType, string> = {
    grams: 'г',
    milliliters: 'мл',
    portion: 'шт',
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
            setError(validation.error || 'Неверное значение');
            return;
        }

        if (newAmount > maxValue) {
            setError(`Максимальное значение: ${maxValue} ${PORTION_TYPE_UNITS[portionType]}`);
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
            setError('Введите значение порции');
            return;
        }

        const numValue = parseFloat(value);

        if (isNaN(numValue)) {
            setError('Порция должна быть числом');
            return;
        }

        updateAmount(numValue);
    }, [updateAmount]);

    // Handle input blur - reset to valid value if invalid
    const handleInputBlur = useCallback(() => {
        if (inputValue === '' || isNaN(parseFloat(inputValue))) {
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
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg" role="tablist" aria-label="Тип порции">
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
                            flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors
                            ${portionType === type
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
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
                            Количество порции
                        </label>
                        <input
                            id="portion-input"
                            type="number"
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
                                w-24 px-3 py-2 text-center text-lg font-medium
                                border rounded-lg focus:outline-none focus:ring-2
                                ${error
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                                }
                                ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
                            `}
                        />
                        <span className="text-gray-600 font-medium">
                            {PORTION_TYPE_UNITS[portionType]}
                        </span>
                    </div>

                    {/* Slider */}
                    <div className="px-1">
                        <label htmlFor="portion-slider" className="sr-only">
                            Ползунок порции
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
                                w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer
                                accent-blue-600
                                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
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
                                    px-3 py-1.5 text-sm font-medium rounded-full border transition-colors
                                    ${amount === quickAmount
                                        ? 'bg-blue-100 border-blue-500 text-blue-700'
                                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
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
                            className="text-sm text-red-600 flex items-center gap-1"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                aria-hidden="true"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                    clipRule="evenodd"
                                />
                            </svg>
                            {error}
                        </p>
                    )}
                </div>
            </div>

            {/* КБЖУ Display */}
            <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Пищевая ценность
                </h4>
                <div className="grid grid-cols-4 gap-3">
                    <NutrientDisplay
                        label="Ккал"
                        value={calculatedNutrition.calories}
                        unit=""
                        highlight
                    />
                    <NutrientDisplay
                        label="Белки"
                        value={calculatedNutrition.protein}
                        unit="г"
                    />
                    <NutrientDisplay
                        label="Жиры"
                        value={calculatedNutrition.fat}
                        unit="г"
                    />
                    <NutrientDisplay
                        label="Углеводы"
                        value={calculatedNutrition.carbs}
                        unit="г"
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
    highlight?: boolean;
}

function NutrientDisplay({ label, value, unit, highlight = false }: NutrientDisplayProps): React.ReactElement {
    return (
        <div className="text-center">
            <div className={`text-lg font-semibold ${highlight ? 'text-blue-600' : 'text-gray-900'}`}>
                {value}{unit && <span className="text-sm font-normal text-gray-500 ml-0.5">{unit}</span>}
            </div>
            <div className="text-xs text-gray-500">{label}</div>
        </div>
    );
}

export default PortionSelector;
