/**
 * ConfigureNutrientsModal Component
 *
 * Modal for configuring which nutrients to track in recommendations.
 * Features:
 * - List all nutrients by category
 * - Checkbox for each nutrient
 * - "Выбрать все" / "Снять выбор" per category
 * - Save preferences
 *
 * @module food-tracker/components/ConfigureNutrientsModal
 */

'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { NutrientRecommendation, NutrientCategoryType } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ConfigureNutrientsModalProps {
    /** Whether modal is open */
    isOpen: boolean;
    /** All available nutrients */
    nutrients: NutrientRecommendation[];
    /** Currently selected nutrient IDs */
    selectedIds: string[];
    /** Callback when modal is closed */
    onClose: () => void;
    /** Callback when preferences are saved */
    onSave: (selectedIds: string[]) => void;
    /** Additional CSS classes */
    className?: string;
}

interface CategoryState {
    isExpanded: boolean;
    nutrients: NutrientRecommendation[];
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_LABELS: Record<NutrientCategoryType, string> = {
    vitamins: 'Витамины',
    minerals: 'Минералы',
    lipids: 'Липиды',
    fiber: 'Клетчатка',
    plant: 'Растительность',
};

const CATEGORY_ORDER: NutrientCategoryType[] = [
    'vitamins',
    'minerals',
    'lipids',
    'fiber',
    'plant',
];

// ============================================================================
// Sub-components
// ============================================================================

interface NutrientCheckboxProps {
    nutrient: NutrientRecommendation;
    isSelected: boolean;
    onToggle: (id: string) => void;
}

function NutrientCheckbox({
    nutrient,
    isSelected,
    onToggle,
}: NutrientCheckboxProps): React.ReactElement {
    const handleChange = useCallback(() => {
        onToggle(nutrient.id);
    }, [nutrient.id, onToggle]);

    return (
        <label
            className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            htmlFor={`nutrient-${nutrient.id}`}
        >
            <input
                type="checkbox"
                id={`nutrient-${nutrient.id}`}
                checked={isSelected}
                onChange={handleChange}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer"
            />
            <span className="text-sm text-gray-900 flex-1">{nutrient.name}</span>
            <span className="text-xs text-gray-500">{nutrient.unit}</span>
        </label>
    );
}

interface CategorySectionProps {
    category: NutrientCategoryType;
    nutrients: NutrientRecommendation[];
    selectedIds: Set<string>;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onToggleNutrient: (id: string) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
}

function CategorySection({
    category,
    nutrients,
    selectedIds,
    isExpanded,
    onToggleExpand,
    onToggleNutrient,
    onSelectAll,
    onDeselectAll,
}: CategorySectionProps): React.ReactElement {
    const selectedCount = nutrients.filter((n) => selectedIds.has(n.id)).length;
    const allSelected = selectedCount === nutrients.length;
    const noneSelected = selectedCount === 0;

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Category Header */}
            <button
                type="button"
                onClick={onToggleExpand}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
                aria-expanded={isExpanded}
                aria-controls={`category-${category}-content`}
            >
                <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                        {CATEGORY_LABELS[category]}
                    </span>
                    <span className="text-sm text-gray-500">
                        ({selectedCount} / {nutrients.length})
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
            </button>

            {/* Category Content */}
            {isExpanded && (
                <div
                    id={`category-${category}-content`}
                    className="px-4 py-3 space-y-2"
                >
                    {/* Select All / Deselect All */}
                    <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                        <button
                            type="button"
                            onClick={onSelectAll}
                            disabled={allSelected}
                            className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed focus:outline-none focus-visible:underline"
                            aria-label={`Выбрать все ${CATEGORY_LABELS[category]}`}
                        >
                            Выбрать все
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                            type="button"
                            onClick={onDeselectAll}
                            disabled={noneSelected}
                            className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed focus:outline-none focus-visible:underline"
                            aria-label={`Снять выбор ${CATEGORY_LABELS[category]}`}
                        >
                            Снять выбор
                        </button>
                    </div>

                    {/* Nutrient List */}
                    <div className="space-y-1">
                        {nutrients.map((nutrient) => (
                            <NutrientCheckbox
                                key={nutrient.id}
                                nutrient={nutrient}
                                isSelected={selectedIds.has(nutrient.id)}
                                onToggle={onToggleNutrient}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Component
// ============================================================================

export function ConfigureNutrientsModal({
    isOpen,
    nutrients,
    selectedIds: initialSelectedIds,
    onClose,
    onSave,
    className = '',
}: ConfigureNutrientsModalProps): React.ReactElement | null {
    // Local state for selected nutrients
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        new Set(initialSelectedIds)
    );

    // Track expanded categories
    const [expandedCategories, setExpandedCategories] = useState<Set<NutrientCategoryType>>(
        new Set(['vitamins'])
    );

    // Track if modal was previously open
    const wasOpenRef = useRef(false);

    // Reset state when modal opens (only on transition from closed to open)
    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            // Modal just opened - reset to initial selection (deferred to avoid lint warning)
            const newSelectedIds = new Set(initialSelectedIds);
            setTimeout(() => {
                setSelectedIds(newSelectedIds);
            }, 0);
        }
        wasOpenRef.current = isOpen;
    }, [isOpen, initialSelectedIds]);

    // Group nutrients by category
    const nutrientsByCategory = useMemo(() => {
        const grouped: Record<NutrientCategoryType, NutrientRecommendation[]> = {
            vitamins: [],
            minerals: [],
            lipids: [],
            fiber: [],
            plant: [],
        };

        nutrients.forEach((nutrient) => {
            if (grouped[nutrient.category]) {
                grouped[nutrient.category].push(nutrient);
            }
        });

        return grouped;
    }, [nutrients]);

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

    // Toggle nutrient selection
    const handleToggleNutrient = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    // Toggle category expansion
    const handleToggleExpand = useCallback((category: NutrientCategoryType) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    }, []);

    // Select all in category
    const handleSelectAll = useCallback(
        (category: NutrientCategoryType) => {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                nutrientsByCategory[category].forEach((n) => next.add(n.id));
                return next;
            });
        },
        [nutrientsByCategory]
    );

    // Deselect all in category
    const handleDeselectAll = useCallback(
        (category: NutrientCategoryType) => {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                nutrientsByCategory[category].forEach((n) => next.delete(n.id));
                return next;
            });
        },
        [nutrientsByCategory]
    );

    // Handle save
    const handleSave = useCallback(() => {
        onSave(Array.from(selectedIds));
        onClose();
    }, [selectedIds, onSave, onClose]);

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

    const totalSelected = selectedIds.size;
    const totalNutrients = nutrients.length;

    return (
        <div
            className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/50 ${className}`}
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby="configure-nutrients-title"
        >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <div>
                        <h2
                            id="configure-nutrients-title"
                            className="text-lg font-semibold text-gray-900"
                        >
                            Настроить список
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Выбрано: {totalSelected} из {totalNutrients}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label="Закрыть"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {CATEGORY_ORDER.map((category) => {
                        const categoryNutrients = nutrientsByCategory[category];
                        if (categoryNutrients.length === 0) return null;

                        return (
                            <CategorySection
                                key={category}
                                category={category}
                                nutrients={categoryNutrients}
                                selectedIds={selectedIds}
                                isExpanded={expandedCategories.has(category)}
                                onToggleExpand={() => handleToggleExpand(category)}
                                onToggleNutrient={handleToggleNutrient}
                                onSelectAll={() => handleSelectAll(category)}
                                onDeselectAll={() => handleDeselectAll(category)}
                            />
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        Отмена
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                        <Check className="w-4 h-4" />
                        Сохранить
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConfigureNutrientsModal;
