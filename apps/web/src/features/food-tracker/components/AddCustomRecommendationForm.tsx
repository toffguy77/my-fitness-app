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
import { Button, IconButton } from '@/shared/components/ui/Button';

/** Поле 48 px и 16 px текста — как `Input`; рамка (норма или ошибка) ставится отдельно. */
const FIELD_CLASS =
    'h-12 w-full rounded-field border bg-surface px-4 text-base text-fg placeholder:text-fg-subtle ' +
    'transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30';

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

// Stored values. What a person reads is UNIT_LABELS below.
const UNITS: CustomRecommendationUnit[] = ['g', 'mg', 'mcg', 'IU'];

const UNIT_LABELS: Record<CustomRecommendationUnit, string> = {
    g: t('foodTracker.customRecommendation.unitGrams'),
    mg: t('foodTracker.customRecommendation.unitMilligrams'),
    mcg: t('foodTracker.customRecommendation.unitMicrograms'),
    IU: t('foodTracker.customRecommendation.unitIU'),
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
    const [unit, setUnit] = useState<CustomRecommendationUnit>('mg');
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
                setUnit('mg');
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
            className={`fixed inset-0 z-[60] flex items-end justify-center bg-scrim sm:items-center sm:p-4 ${className}`}
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-recommendation-title"
        >
            <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-sheet bg-surface shadow-overlay sm:max-w-md sm:rounded-sheet">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-6">
                    <h2
                        id="add-recommendation-title"
                        className="type-title-2 text-fg"
                    >
                        {t('foodTracker.customRecommendation.title')}
                    </h2>
                    <IconButton
                        variant="ghost"
                        onClick={onClose}
                        className="-mr-2"
                        aria-label={t('common.close')}
                    >
                        <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
                    {/* Name Input */}
                    <div>
                        <label
                            htmlFor="recommendation-name"
                            className="mb-1.5 block text-sm font-medium text-fg-muted"
                        >
                            {t('foodTracker.customRecommendation.name')} <span className="text-danger-fg">*</span>
                        </label>
                        <input
                            type="text"
                            id="recommendation-name"
                            value={name}
                            onChange={handleNameChange}
                            onBlur={() => handleBlur('name')}
                            placeholder={t('foodTracker.customRecommendation.namePlaceholder')}
                            className={`${FIELD_CLASS} ${errors.name && touched.name ? 'border-danger' : 'border-line'}`}
                            aria-invalid={errors.name && touched.name ? 'true' : 'false'}
                            aria-describedby={errors.name ? 'name-error' : undefined}
                        />
                        {errors.name && touched.name && (
                            <p
                                id="name-error"
                                className="mt-1 text-sm text-danger-fg"
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
                            className="mb-1.5 block text-sm font-medium text-fg-muted"
                        >
                            {t('foodTracker.customRecommendation.dailyTarget')} <span className="text-danger-fg">*</span>
                        </label>
                        <input
                            type="text"
                            inputMode="decimal"
                            id="recommendation-target"
                            value={dailyTarget}
                            onChange={handleDailyTargetChange}
                            onBlur={() => handleBlur('dailyTarget')}
                            placeholder={t('foodTracker.customRecommendation.targetPlaceholder')}
                            className={`${FIELD_CLASS} ${errors.dailyTarget && touched.dailyTarget ? 'border-danger' : 'border-line'}`}
                            aria-invalid={errors.dailyTarget && touched.dailyTarget ? 'true' : 'false'}
                            aria-describedby={errors.dailyTarget ? 'target-error' : undefined}
                        />
                        {errors.dailyTarget && touched.dailyTarget && (
                            <p
                                id="target-error"
                                className="mt-1 text-sm text-danger-fg"
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
                            className="mb-1.5 block text-sm font-medium text-fg-muted"
                        >
                            {t('foodTracker.customRecommendation.unit')}
                        </label>
                        <select
                            id="recommendation-unit"
                            value={unit}
                            onChange={handleUnitChange}
                            className={`${FIELD_CLASS} border-line`}
                        >
                            {UNITS.map((u) => (
                                <option key={u} value={u}>
                                    {UNIT_LABELS[u]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-3 pt-2 sm:justify-end">
                        <Button
                            type="button"
                            variant="secondary"
                            size="lg"
                            className="flex-1 sm:flex-none"
                            onClick={onClose}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            size="lg"
                            className="flex-1 sm:flex-none"
                            disabled={!isFormValid}
                        >
                            <Plus className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                            {t('common.add')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AddCustomRecommendationForm;
