'use client';

/**
 * ManualEntryForm Component
 *
 * Form for manually entering food items with custom КБЖУ values.
 * Used when food is not found in search or barcode lookup.
 *
 * @module food-tracker/components/ManualEntryForm
 */

import { useState, useCallback } from 'react';
import { Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import type { FoodItem } from '../types';
import type { CreateUserFoodRequest, UserFood } from '../types';
import { userFoodToFoodItem } from '../types';
import { t } from '@/shared/i18n';
import { Button } from '@/shared/components/ui/Button';
import { MACRO_COLORS } from '@/shared/constants/macros';

/** Поле 48 px, текст 16 px — как `Input`; рамка ставится отдельно (ошибка — `danger`). */
const FIELD_CLASS =
    'h-12 w-full rounded-field border bg-surface px-4 text-base text-fg tabular-nums placeholder:text-fg-subtle ' +
    'transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30';

// ============================================================================
// Types
// ============================================================================

export interface ManualEntryFormProps {
    /** Callback when food item is created */
    onSubmit: (food: FoodItem) => void;
    /** Callback when form is cancelled */
    onCancel: () => void;
    /** Pre-filled name (e.g., from failed search) */
    initialName?: string;
    /** Additional CSS classes */
    className?: string;
}

interface FormData {
    name: string;
    brand: string;
    calories: string;
    protein: string;
    fat: string;
    carbs: string;
    servingSize: string;
}

interface FormErrors {
    name?: string;
    calories?: string;
    protein?: string;
    fat?: string;
    carbs?: string;
    servingSize?: string;
}

// ============================================================================
// Constants
// ============================================================================

const INITIAL_FORM_DATA: FormData = {
    name: '',
    brand: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
    servingSize: '100',
};

// ============================================================================
// Component
// ============================================================================

export function ManualEntryForm({
    onSubmit,
    onCancel,
    initialName = '',
    className = '',
}: ManualEntryFormProps) {
    const [formData, setFormData] = useState<FormData>({
        ...INITIAL_FORM_DATA,
        name: initialName,
    });
    const [errors, setErrors] = useState<FormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Handle input change
    const handleChange = useCallback((field: keyof FormData) => (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const value = e.target.value;
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear error when user starts typing
        if (errors[field as keyof FormErrors]) {
            setErrors(prev => ({ ...prev, [field]: undefined }));
        }
    }, [errors]);

    // Validate form
    const validateForm = useCallback((): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = t('foodTracker.manualEntry.nameRequired');
        }

        const calories = parseFloat(formData.calories.replace(',', '.'));
        if (isNaN(calories) || calories < 0) {
            newErrors.calories = t('foodTracker.manualEntry.caloriesInvalid');
        }

        const protein = parseFloat(formData.protein.replace(',', '.'));
        if (formData.protein && (isNaN(protein) || protein < 0)) {
            newErrors.protein = t('foodTracker.manualEntry.proteinInvalid');
        }

        const fat = parseFloat(formData.fat.replace(',', '.'));
        if (formData.fat && (isNaN(fat) || fat < 0)) {
            newErrors.fat = t('foodTracker.manualEntry.fatInvalid');
        }

        const carbs = parseFloat(formData.carbs.replace(',', '.'));
        if (formData.carbs && (isNaN(carbs) || carbs < 0)) {
            newErrors.carbs = t('foodTracker.manualEntry.carbsInvalid');
        }

        const servingSize = parseFloat(formData.servingSize.replace(',', '.'));
        if (isNaN(servingSize) || servingSize <= 0) {
            newErrors.servingSize = t('foodTracker.manualEntry.servingInvalid');
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [formData]);

    // Handle form submit
    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);

        try {
            const payload: CreateUserFoodRequest = {
                name: formData.name.trim(),
                brand: formData.brand.trim() || undefined,
                calories_per_100: parseFloat(formData.calories.replace(',', '.')) || 0,
                protein_per_100: parseFloat(formData.protein.replace(',', '.')) || 0,
                fat_per_100: parseFloat(formData.fat.replace(',', '.')) || 0,
                carbs_per_100: parseFloat(formData.carbs.replace(',', '.')) || 0,
                serving_size: parseFloat(formData.servingSize.replace(',', '.')) || 100,
                // A stored value, not a label: the screen looks up what to show.
            serving_unit: 'g',
            };

            const url = getApiUrl('/food-tracker/user-foods');
            const response = await apiClient.post<UserFood>(url, payload);
            const food = userFoodToFoodItem(response);

            onSubmit(food);
        } catch (error) {
            console.error('Failed to create user food:', error);
            toast.error(t('foodTracker.manualEntry.createFailed'));
        } finally {
            setIsSubmitting(false);
        }
    }, [formData, validateForm, onSubmit]);

    return (
        <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
            <h3 className="type-title-3 text-fg">
                {t('foodTracker.manualEntry.title')}
            </h3>

            {/* Name */}
            <div>
                <label htmlFor="manual-name" className="mb-1.5 block text-sm font-medium text-fg-muted">
                    {t('foodTracker.manualEntry.productName')}
                </label>
                <input
                    id="manual-name"
                    type="text"
                    value={formData.name}
                    onChange={handleChange('name')}
                    placeholder={t('foodTracker.manualEntry.namePlaceholder')}
                    className={`${FIELD_CLASS} ${errors.name ? 'border-danger' : 'border-line'}`}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? 'name-error' : undefined}
                />
                {errors.name && (
                    <p id="name-error" className="mt-1 text-sm text-danger-fg">{errors.name}</p>
                )}
            </div>

            {/* Brand (optional) */}
            <div>
                <label htmlFor="manual-brand" className="mb-1.5 block text-sm font-medium text-fg-muted">
                    {t('foodTracker.manualEntry.brand')}
                </label>
                <input
                    id="manual-brand"
                    type="text"
                    value={formData.brand}
                    onChange={handleChange('brand')}
                    placeholder={t('foodTracker.manualEntry.brandPlaceholder')}
                    className={`${FIELD_CLASS} border-line`}
                />
            </div>

            {/* Nutrition per 100g */}
            <div className="rounded-tile border border-line p-4">
                <p className="type-overline mb-3 text-fg-subtle">
                    {t('foodTracker.manualEntry.per100Heading')}
                </p>

                <div className="grid grid-cols-2 gap-3">
                    {/* Calories */}
                    <div>
                        <label htmlFor="manual-calories" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-fg-muted">
                            {t('foodTracker.manualEntry.caloriesField')}
                        </label>
                        <input
                            id="manual-calories"
                            type="text"
                            inputMode="decimal"
                            min="0"
                            step="0.1"
                            value={formData.calories}
                            onChange={handleChange('calories')}
                            placeholder="0"
                            className={`${FIELD_CLASS} ${errors.calories ? 'border-danger' : 'border-line'}`}
                            aria-invalid={!!errors.calories}
                        />
                        {errors.calories && (
                            <p className="mt-1 text-sm text-danger-fg">{errors.calories}</p>
                        )}
                    </div>

                    {/* Protein */}
                    <div>
                        <label htmlFor="manual-protein" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-fg-muted">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: MACRO_COLORS.protein }} aria-hidden="true" />
                            {t('foodTracker.manualEntry.proteinField')}
                        </label>
                        <input
                            id="manual-protein"
                            type="text"
                            inputMode="decimal"
                            min="0"
                            step="0.1"
                            value={formData.protein}
                            onChange={handleChange('protein')}
                            placeholder="0"
                            className={`${FIELD_CLASS} ${errors.protein ? 'border-danger' : 'border-line'}`}
                            aria-invalid={!!errors.protein}
                        />
                        {errors.protein && (
                            <p className="mt-1 text-sm text-danger-fg">{errors.protein}</p>
                        )}
                    </div>

                    {/* Fat */}
                    <div>
                        <label htmlFor="manual-fat" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-fg-muted">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: MACRO_COLORS.fat }} aria-hidden="true" />
                            {t('foodTracker.manualEntry.fatField')}
                        </label>
                        <input
                            id="manual-fat"
                            type="text"
                            inputMode="decimal"
                            min="0"
                            step="0.1"
                            value={formData.fat}
                            onChange={handleChange('fat')}
                            placeholder="0"
                            className={`${FIELD_CLASS} ${errors.fat ? 'border-danger' : 'border-line'}`}
                            aria-invalid={!!errors.fat}
                        />
                        {errors.fat && (
                            <p className="mt-1 text-sm text-danger-fg">{errors.fat}</p>
                        )}
                    </div>

                    {/* Carbs */}
                    <div>
                        <label htmlFor="manual-carbs" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-fg-muted">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: MACRO_COLORS.carbs }} aria-hidden="true" />
                            {t('foodTracker.manualEntry.carbsField')}
                        </label>
                        <input
                            id="manual-carbs"
                            type="text"
                            inputMode="decimal"
                            min="0"
                            step="0.1"
                            value={formData.carbs}
                            onChange={handleChange('carbs')}
                            placeholder="0"
                            className={`${FIELD_CLASS} ${errors.carbs ? 'border-danger' : 'border-line'}`}
                            aria-invalid={!!errors.carbs}
                        />
                        {errors.carbs && (
                            <p className="mt-1 text-sm text-danger-fg">{errors.carbs}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Serving Size */}
            <div>
                <label htmlFor="manual-serving" className="mb-1.5 block text-sm font-medium text-fg-muted">
                    {t('foodTracker.manualEntry.servingField')}
                </label>
                <input
                    id="manual-serving"
                    type="text"
                    inputMode="decimal"
                    min="1"
                    step="1"
                    value={formData.servingSize}
                    onChange={handleChange('servingSize')}
                    placeholder="100"
                    className={`${FIELD_CLASS} ${errors.servingSize ? 'border-danger' : 'border-line'}`}
                    aria-invalid={!!errors.servingSize}
                />
                {errors.servingSize && (
                    <p className="mt-1 text-sm text-danger-fg">{errors.servingSize}</p>
                )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
                <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="flex-1"
                    onClick={onCancel}
                >
                    <X className="h-5 w-5" aria-hidden="true" />
                    <span>{t('common.cancel')}</span>
                </Button>
                <Button
                    type="submit"
                    size="lg"
                    className="flex-1"
                    isLoading={isSubmitting}
                >
                    {isSubmitting ? (
                        <span>{t('common.saving')}</span>
                    ) : (
                        <>
                            <Save className="h-5 w-5" aria-hidden="true" />
                            <span>{t('common.save')}</span>
                        </>
                    )}
                </Button>
            </div>
        </form>
    );
}

export default ManualEntryForm;
