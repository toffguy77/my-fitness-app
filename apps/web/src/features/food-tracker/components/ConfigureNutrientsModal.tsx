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
import { t } from '@/shared/i18n';
import { Button, IconButton } from '@/shared/components/ui/Button';

import { unitLabel } from '../utils/unitLabel'
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

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_LABELS: Record<NutrientCategoryType, string> = {
    vitamins: t('foodTracker.nutrientCategories.vitamins'),
    minerals: t('foodTracker.nutrientCategories.minerals'),
    lipids: t('foodTracker.nutrientCategories.lipids'),
    fiber: t('foodTracker.nutrientCategories.fiber'),
    plant: t('foodTracker.nutrientCategories.plant'),
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
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-tile px-3 transition-colors hover:bg-subtle"
            htmlFor={`nutrient-${nutrient.id}`}
        >
            <input
                type="checkbox"
                id={`nutrient-${nutrient.id}`}
                checked={isSelected}
                onChange={handleChange}
                className="h-5 w-5 cursor-pointer rounded-xs border-line accent-primary focus:ring-2 focus:ring-focus focus:ring-offset-2"
            />
            <span className="flex-1 text-sm text-fg">{nutrient.name}</span>
            <span className="text-[13px] text-fg-muted">{unitLabel(nutrient.unit)}</span>
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
        <div className="overflow-hidden rounded-tile border border-line">
            {/* Category Header */}
            <button
                type="button"
                onClick={onToggleExpand}
                className="flex min-h-14 w-full items-center justify-between px-4 transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                aria-expanded={isExpanded}
                aria-controls={`category-${category}-content`}
            >
                <div className="flex items-center gap-2">
                    <span className="type-headline text-fg">
                        {CATEGORY_LABELS[category]}
                    </span>
                    <span className="text-sm text-fg-muted tabular-nums">
                        ({selectedCount} / {nutrients.length})
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                ) : (
                    <ChevronDown className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                )}
            </button>

            {/* Category Content */}
            {isExpanded && (
                <div
                    id={`category-${category}-content`}
                    className="space-y-1 border-t border-line px-2 py-2"
                >
                    {/* Select All / Deselect All */}
                    <div className="flex items-center gap-1 border-b border-line pb-1">
                        <button
                            type="button"
                            onClick={onSelectAll}
                            disabled={allSelected}
                            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-fg transition-colors hover:bg-subtle disabled:cursor-not-allowed disabled:text-fg-subtle disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            aria-label={t('foodTracker.configureNutrients.selectAllAria', { category: CATEGORY_LABELS[category] })}
                        >
                            {t('foodTracker.configureNutrients.selectAll')}
                        </button>
                        <span className="text-fg-subtle" aria-hidden="true">|</span>
                        <button
                            type="button"
                            onClick={onDeselectAll}
                            disabled={noneSelected}
                            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-fg transition-colors hover:bg-subtle disabled:cursor-not-allowed disabled:text-fg-subtle disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            aria-label={t('foodTracker.configureNutrients.clearAria', { category: CATEGORY_LABELS[category] })}
                        >
                            {t('foodTracker.configureNutrients.clear')}
                        </button>
                    </div>

                    {/* Nutrient List */}
                    <div>
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
            className={`fixed inset-0 z-[60] flex items-end justify-center bg-scrim sm:items-center sm:p-4 ${className}`}
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby="configure-nutrients-title"
        >
            <div className="flex max-h-[90vh] w-full flex-col rounded-t-sheet bg-surface shadow-overlay sm:max-w-lg sm:rounded-sheet">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-6">
                    <div>
                        <h2
                            id="configure-nutrients-title"
                            className="type-title-2 text-fg"
                        >
                            {t('foodTracker.configureNutrients.title')}
                        </h2>
                        <p className="mt-1 text-sm text-fg-muted tabular-nums">
                            {t('foodTracker.configureNutrients.selectedCount', { selected: totalSelected, total: totalNutrients })}
                        </p>
                    </div>
                    <IconButton
                        variant="ghost"
                        onClick={onClose}
                        className="-mr-2 -mt-1"
                        aria-label={t('common.close')}
                    >
                        <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-3 overflow-y-auto border-t border-line px-6 py-4">
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
                <div className="flex items-center gap-3 border-t border-line px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:justify-end sm:pb-4">
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
                        type="button"
                        size="lg"
                        className="flex-1 sm:flex-none"
                        onClick={handleSave}
                    >
                        <Check className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                        {t('common.save')}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default ConfigureNutrientsModal;
