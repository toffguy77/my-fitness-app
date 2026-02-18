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
import type { FoodItem, KBZHU } from '../types';

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
            newErrors.name = 'Введите название продукта';
        }

        const calories = parseFloat(formData.calories);
        if (isNaN(calories) || calories < 0) {
            newErrors.calories = 'Введите корректное значение калорий';
        }

        const protein = parseFloat(formData.protein);
        if (formData.protein && (isNaN(protein) || protein < 0)) {
            newErrors.protein = 'Введите корректное значение белков';
        }

        const fat = parseFloat(formData.fat);
        if (formData.fat && (isNaN(fat) || fat < 0)) {
            newErrors.fat = 'Введите корректное значение жиров';
        }

        const carbs = parseFloat(formData.carbs);
        if (formData.carbs && (isNaN(carbs) || carbs < 0)) {
            newErrors.carbs = 'Введите корректное значение углеводов';
        }

        const servingSize = parseFloat(formData.servingSize);
        if (isNaN(servingSize) || servingSize <= 0) {
            newErrors.servingSize = 'Введите корректный размер порции';
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
            const nutrition: KBZHU = {
                calories: parseFloat(formData.calories) || 0,
                protein: parseFloat(formData.protein) || 0,
                fat: parseFloat(formData.fat) || 0,
                carbs: parseFloat(formData.carbs) || 0,
            };

            const food: FoodItem = {
                id: `manual_${Date.now()}`,
                name: formData.name.trim(),
                brand: formData.brand.trim() || undefined,
                category: 'user',
                servingSize: parseFloat(formData.servingSize) || 100,
                servingUnit: 'г',
                nutritionPer100: nutrition,
                source: 'user',
                verified: false,
            };

            onSubmit(food);
        } finally {
            setIsSubmitting(false);
        }
    }, [formData, validateForm, onSubmit]);

    return (
        <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Ввести продукт вручную
            </h3>

            {/* Name */}
            <div>
                <label htmlFor="manual-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Название продукта *
                </label>
                <input
                    id="manual-name"
                    type="text"
                    value={formData.name}
                    onChange={handleChange('name')}
                    placeholder="Например: Овсяная каша"
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-500' : 'border-gray-300'
                        }`}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? 'name-error' : undefined}
                />
                {errors.name && (
                    <p id="name-error" className="mt-1 text-sm text-red-600">{errors.name}</p>
                )}
            </div>

            {/* Brand (optional) */}
            <div>
                <label htmlFor="manual-brand" className="block text-sm font-medium text-gray-700 mb-1">
                    Бренд (необязательно)
                </label>
                <input
                    id="manual-brand"
                    type="text"
                    value={formData.brand}
                    onChange={handleChange('brand')}
                    placeholder="Например: Myllyn Paras"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Nutrition per 100g */}
            <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-3">
                    Пищевая ценность на 100г
                </p>

                <div className="grid grid-cols-2 gap-3">
                    {/* Calories */}
                    <div>
                        <label htmlFor="manual-calories" className="block text-xs text-gray-500 mb-1">
                            Калории (ккал) *
                        </label>
                        <input
                            id="manual-calories"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.1"
                            value={formData.calories}
                            onChange={handleChange('calories')}
                            placeholder="0"
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.calories ? 'border-red-500' : 'border-gray-300'
                                }`}
                            aria-invalid={!!errors.calories}
                        />
                        {errors.calories && (
                            <p className="mt-1 text-xs text-red-600">{errors.calories}</p>
                        )}
                    </div>

                    {/* Protein */}
                    <div>
                        <label htmlFor="manual-protein" className="block text-xs text-gray-500 mb-1">
                            Белки (г)
                        </label>
                        <input
                            id="manual-protein"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.1"
                            value={formData.protein}
                            onChange={handleChange('protein')}
                            placeholder="0"
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.protein ? 'border-red-500' : 'border-gray-300'
                                }`}
                            aria-invalid={!!errors.protein}
                        />
                        {errors.protein && (
                            <p className="mt-1 text-xs text-red-600">{errors.protein}</p>
                        )}
                    </div>

                    {/* Fat */}
                    <div>
                        <label htmlFor="manual-fat" className="block text-xs text-gray-500 mb-1">
                            Жиры (г)
                        </label>
                        <input
                            id="manual-fat"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.1"
                            value={formData.fat}
                            onChange={handleChange('fat')}
                            placeholder="0"
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.fat ? 'border-red-500' : 'border-gray-300'
                                }`}
                            aria-invalid={!!errors.fat}
                        />
                        {errors.fat && (
                            <p className="mt-1 text-xs text-red-600">{errors.fat}</p>
                        )}
                    </div>

                    {/* Carbs */}
                    <div>
                        <label htmlFor="manual-carbs" className="block text-xs text-gray-500 mb-1">
                            Углеводы (г)
                        </label>
                        <input
                            id="manual-carbs"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.1"
                            value={formData.carbs}
                            onChange={handleChange('carbs')}
                            placeholder="0"
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.carbs ? 'border-red-500' : 'border-gray-300'
                                }`}
                            aria-invalid={!!errors.carbs}
                        />
                        {errors.carbs && (
                            <p className="mt-1 text-xs text-red-600">{errors.carbs}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Serving Size */}
            <div>
                <label htmlFor="manual-serving" className="block text-sm font-medium text-gray-700 mb-1">
                    Размер порции (г) *
                </label>
                <input
                    id="manual-serving"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="1"
                    value={formData.servingSize}
                    onChange={handleChange('servingSize')}
                    placeholder="100"
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.servingSize ? 'border-red-500' : 'border-gray-300'
                        }`}
                    aria-invalid={!!errors.servingSize}
                />
                {errors.servingSize && (
                    <p className="mt-1 text-sm text-red-600">{errors.servingSize}</p>
                )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                >
                    <X className="w-5 h-5" />
                    <span>Отмена</span>
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Сохранение...</span>
                        </>
                    ) : (
                        <>
                            <Save className="w-5 h-5" />
                            <span>Сохранить</span>
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}

export default ManualEntryForm;
