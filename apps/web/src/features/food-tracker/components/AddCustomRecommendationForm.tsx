/**
 * AddCustomRecommendationForm Component
 *
 * Form for adding custom nutrient recommendations.
 * Features:
 * - Name input (required)
 * - Daily target input (required)
 * - Unit selector (г, мг, мкг, МЕ)
 * - Validation with Russian error messages
 *
 * @module food-tracker/components/AddCustomRecommendationForm
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, Plus } from 'lucide-react';
import type { CustomRecommendationUnit, CustomRecommendation } from '../types';
import { t } from '@/shared/i18n';

// ============================================================================
// Types
// ============================================================================

export interface AddCustomRecommendationFormProps {
    /** Whether modal is open */
    isOpen: boolean;
    /** Callback when modal is closed */
    onClose: () => void;
    /** Callback when recommendation is added */
    onAdd: (recommendation: Omit<CustomRecommendation, 'id' | 'currentIntake'>) => void;
    /** Additional CSS classes */
    className?: string;
}

interface FormErrors {
    name?: string;
    dailyTarget?: string;
}

// ============================================================================
// Constants
// ============================================================================

// i18n-exempt: these are stored values, not labels — user_nutrient_preferences
// keeps the unit as written here, so a translated copy would not match the rows
// already in the database. What a person reads is UNIT_LABELS below.
const UNITS: CustomRecommendationUnit[] = ['г', 'мг', 'мкг', 'МЕ'];

const UNIT_LABELS: Record<CustomRecommendationUnit, string> = {
    // i18n-exempt: keys, matching the stored values above.
    'г': t('foodTracker.customRecommendation.unitGrams'),
    'мг': t('foodTracker.customRecommendation.unitMilligrams'),
    'мкг': t('foodTracker.customRecommendation.unitMicrograms'),
    'МЕ': t('foodTracker.customRecommendation.unitIU'),
};

// ============================================================================
// Validation
// ============================================================================

function validateName(name: string): string | undefined {
    const trimmed = name.trim();
    if (!trimmed) {
        return t('foodTracker.customRecommendation.nameRequired');
    }
    if (trimmed.length < 2) {
        return t('foodTracker.customRecommendation.nameTooShort');
    }
    if (trimmed.length > 50) {
        return t('foodTracker.customRecommendation.nameTooLong');
    }
    return undefined;
}

function validateDailyTarget(value: string): string | undefined {
    if (!value.trim()) {
        return t('foodTracker.customRecommendation.targetRequired');
    }

    const num = parseFloat(value);
    if (isNaN(num)) {
        return t('foodTracker.customRecommendation.targetNotANumber');
    }
    if (num <= 0) {
        return t('foodTracker.customRecommendation.targetNotPositive');
    }
    if (num > 1000000) {
        return t('foodTracker.customRecommendation.targetTooLarge');
    }

    return undefined;
}

// ============================================================================
// Component
// ============================================================================

export function AddCustomRecommendationForm({
    isOpen,
    onClose,
    onAdd,
    className = '',
}: AddCustomRecommendationFormProps): React.ReactElement | null {
    // Form state
    const [name, setName] = useState('');
    const [dailyTarget, setDailyTarget] = useState('');
    const [unit, setUnit] = useState<CustomRecommendationUnit>('мг' /* i18n-exempt: stored value */);
    const [errors, setErrors] = useState<FormErrors>({});
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    // Track if modal was previously open
    const wasOpenRef = useRef(false);

    // Reset form when modal opens (only on transition from closed to open)
    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            // Modal just opened - reset form (deferred to avoid lint warning)
            setTimeout(() => {
                setName('');
                setDailyTarget('');
                setUnit('мг'); // i18n-exempt: stored value
                setErrors({});
                setTouched({});
            }, 0);
        }
        wasOpenRef.current = isOpen;
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Validate field on blur
    const handleBlur = useCallback((field: 'name' | 'dailyTarget') => {
        setTouched((prev) => ({ ...prev, [field]: true }));

        if (field === 'name') {
            const error = validateName(name);
            setErrors((prev) => ({ ...prev, name: error }));
        } else if (field === 'dailyTarget') {
            const error = validateDailyTarget(dailyTarget);
            setErrors((prev) => ({ ...prev, dailyTarget: error }));
        }
    }, [name, dailyTarget]);

    // Handle name change
    const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setName(value);

        // Clear error if field was touched and is now valid
        if (touched.name) {
            const error = validateName(value);
            setErrors((prev) => ({ ...prev, name: error }));
        }
    }, [touched.name]);

    // Handle daily target change
    const handleDailyTargetChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Allow only numbers and decimal point
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            setDailyTarget(value);

            // Clear error if field was touched and is now valid
            if (touched.dailyTarget) {
                const error = validateDailyTarget(value);
                setErrors((prev) => ({ ...prev, dailyTarget: error }));
            }
        }
    }, [touched.dailyTarget]);

    // Handle unit change
    const handleUnitChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        setUnit(e.target.value as CustomRecommendationUnit);
    }, []);

    // Handle form submit
    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();

        // Validate all fields
        const nameError = validateName(name);
        const dailyTargetError = validateDailyTarget(dailyTarget);

        setErrors({
            name: nameError,
            dailyTarget: dailyTargetError,
        });

        setTouched({
            name: true,
            dailyTarget: true,
        });

        // If no errors, submit
        if (!nameError && !dailyTargetError) {
            onAdd({
                name: name.trim(),
                dailyTarget: parseFloat(dailyTarget),
                unit,
            });
            onClose();
        }
    }, [name, dailyTarget, unit, onAdd, onClose]);

    // Handle backdrop click
    const handleBackdropClick = useCallback(
        (e: React.MouseEvent) => {
            if (e.target === e.currentTarget) {
                onClose();
            }
        },
        [onClose]
    );

    // Don't render if not open
    if (!isOpen) {
        return null;
    }

    const isFormValid = !validateName(name) && !validateDailyTarget(dailyTarget);

    return (
        <div
            className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/50 ${className}`}
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-recommendation-title"
        >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2
                        id="add-recommendation-title"
                        className="text-lg font-semibold text-gray-900"
                    >
                        {t('foodTracker.customRecommendation.title')}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label={t('common.close')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
                    {/* Name Input */}
                    <div>
                        <label
                            htmlFor="recommendation-name"
                            className="block text-sm font-medium text-gray-700 mb-1"
                        >
                            {t('foodTracker.customRecommendation.name')} <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            id="recommendation-name"
                            value={name}
                            onChange={handleNameChange}
                            onBlur={() => handleBlur('name')}
                            placeholder={t('foodTracker.customRecommendation.namePlaceholder')}
                            className={`w-full px-4 py-2.5 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name && touched.name
                                ? 'border-red-500 bg-red-50'
                                : 'border-gray-300 hover:border-gray-400'
                                }`}
                            aria-invalid={errors.name && touched.name ? 'true' : 'false'}
                            aria-describedby={errors.name ? 'name-error' : undefined}
                        />
                        {errors.name && touched.name && (
                            <p
                                id="name-error"
                                className="mt-1 text-sm text-red-600"
                                role="alert"
                            >
                                {errors.name}
                            </p>
                        )}
                    </div>

                    {/* Daily Target Input */}
                    <div>
                        <label
                            htmlFor="recommendation-target"
                            className="block text-sm font-medium text-gray-700 mb-1"
                        >
                            {t('foodTracker.customRecommendation.dailyTarget')} <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            inputMode="decimal"
                            id="recommendation-target"
                            value={dailyTarget}
                            onChange={handleDailyTargetChange}
                            onBlur={() => handleBlur('dailyTarget')}
                            placeholder={t('foodTracker.customRecommendation.targetPlaceholder')}
                            className={`w-full px-4 py-2.5 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.dailyTarget && touched.dailyTarget
                                ? 'border-red-500 bg-red-50'
                                : 'border-gray-300 hover:border-gray-400'
                                }`}
                            aria-invalid={errors.dailyTarget && touched.dailyTarget ? 'true' : 'false'}
                            aria-describedby={errors.dailyTarget ? 'target-error' : undefined}
                        />
                        {errors.dailyTarget && touched.dailyTarget && (
                            <p
                                id="target-error"
                                className="mt-1 text-sm text-red-600"
                                role="alert"
                            >
                                {errors.dailyTarget}
                            </p>
                        )}
                    </div>

                    {/* Unit Selector */}
                    <div>
                        <label
                            htmlFor="recommendation-unit"
                            className="block text-sm font-medium text-gray-700 mb-1"
                        >
                            {t('foodTracker.customRecommendation.unit')}
                        </label>
                        <select
                            id="recommendation-unit"
                            value={unit}
                            onChange={handleUnitChange}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {UNITS.map((u) => (
                                <option key={u} value={u}>
                                    {UNIT_LABELS[u]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={!isFormValid}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                            <Plus className="w-4 h-4" />
                            {t('common.add')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AddCustomRecommendationForm;
