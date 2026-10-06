'use client';

/**
 * MealSlot Component
 *
 * Displays a meal slot (Завтрак, Обед, Ужин, Перекус) with food entries,
 * subtotals, and add button.
 *
 * @module food-tracker/components/MealSlot
 */

import { useMemo } from 'react';
import { Plus, Sunrise, Sun, Moon, Cookie } from 'lucide-react';
import type { MealType, FoodEntry, KBZHU } from '../types';
import { getMealSlotLabel, calculateSlotSubtotal, getFirstEntryTime } from '../utils/mealSlotUtils';
import { FoodEntryItem } from './FoodEntryItem';
import { t } from '@/shared/i18n';
import { MACRO_COLORS } from '@/shared/constants/macros';

// ============================================================================
// Types
// ============================================================================

export interface MealSlotProps {
    /** Meal type (breakfast, lunch, dinner, snack) */
    mealType: MealType;
    /** Food entries for this meal slot */
    entries: FoodEntry[];
    /** Callback when add button is clicked */
    onAddEntry: (mealType: MealType) => void;
    /** Callback when an entry is clicked */
    onEntryClick?: (entry: FoodEntry) => void;
    /** Callback when edit is requested */
    onEditEntry?: (entry: FoodEntry) => void;
    /** Callback when delete is requested */
    onDeleteEntry?: (entry: FoodEntry) => void;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Icon Component
// ============================================================================

interface MealIconProps {
    mealType: MealType;
    className?: string;
}

function MealIcon({ mealType, className = '' }: MealIconProps) {
    // Default size classes are handled by parent, just pass through className
    switch (mealType) {
        case 'breakfast':
            return <Sunrise className={className} aria-hidden="true" />;
        case 'lunch':
            return <Sun className={className} aria-hidden="true" />;
        case 'dinner':
            return <Moon className={className} aria-hidden="true" />;
        case 'snack':
        default:
            return <Cookie className={className} aria-hidden="true" />;
    }
}

// ============================================================================
// Subtotal Display Component
// ============================================================================

interface SubtotalDisplayProps {
    subtotal: KBZHU;
}

function MacroSubtotal({
    label,
    value,
    color,
}: {
    label: string;
    value: number;
    color: string;
}) {
    return (
        <span className="inline-flex items-center gap-1">
            <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
                aria-hidden="true"
            />
            {label}: {Math.round(value)}{t('units.gram')}
        </span>
    );
}

function SubtotalDisplay({ subtotal }: SubtotalDisplayProps) {
    return (
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-fg-muted mt-2 pt-2 border-t border-line sm:gap-3 sm:text-xs">
            <span className="font-medium">{t('foodTracker.mealSlot.subtotal')}</span>
            <span>{Math.round(subtotal.calories)} {t('units.kcal')}</span>
            <span className="text-fg-subtle hidden sm:inline">|</span>
            {/* Подытог приёма пищи — то, что новичок видит чаще кольца, и до
                этого он был целиком серым. Цвет опознаёт нутриент и ничего не
                утверждает о норме, поэтому уместен и здесь, где нормы нет. */}
            <MacroSubtotal
                label={t('macros.proteinShort')}
                value={subtotal.protein}
                color={MACRO_COLORS.protein}
            />
            <MacroSubtotal
                label={t('macros.fatShort')}
                value={subtotal.fat}
                color={MACRO_COLORS.fat}
            />
            <MacroSubtotal
                label={t('macros.carbsShort')}
                value={subtotal.carbs}
                color={MACRO_COLORS.carbs}
            />
        </div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

export function MealSlot({
    mealType,
    entries,
    onAddEntry,
    onEntryClick,
    onEditEntry,
    onDeleteEntry,
    className = '',
}: MealSlotProps) {
    // Calculate subtotals
    const subtotal = useMemo(() => calculateSlotSubtotal(entries), [entries]);

    // Get first entry time
    const firstTime = useMemo(() => getFirstEntryTime(entries), [entries]);

    // Get Russian label
    const label = getMealSlotLabel(mealType);

    // Check if slot has entries
    const hasEntries = entries.length > 0;

    return (
        <section
            className={`bg-surface rounded-xl shadow-sm border border-line overflow-hidden ${className}`}
            aria-label={t('foodTracker.mealSlot.aria', { label })}
        >
            {/* Header - responsive padding */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-canvas border-b border-line sm:px-4 sm:py-3">
                <div className="flex items-center gap-2 sm:gap-3">
                    <MealIcon mealType={mealType} className="text-fg-muted w-4 h-4 sm:w-5 sm:h-5" />
                    <div>
                        <h3 className="text-xs font-semibold text-fg sm:text-sm">{label}</h3>
                        {firstTime && (
                            <p className="text-[10px] text-fg-muted sm:text-xs">{firstTime}</p>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onAddEntry(mealType)}
                    className="p-1.5 rounded-full bg-primary text-on-primary hover:bg-primary active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 sm:p-2 touch-manipulation"
                    aria-label={t('foodTracker.mealSlot.addAria', { label })}
                >
                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
            </div>

            {/* Content - responsive padding */}
            <div className="px-3 py-2 sm:px-4">
                {hasEntries ? (
                    <>
                        {/* Entry list */}
                        <div className="divide-y divide-line">
                            {entries.map((entry) => (
                                <FoodEntryItem
                                    key={entry.id}
                                    entry={entry}
                                    onClick={onEntryClick}
                                    onEdit={onEditEntry}
                                    onDelete={onDeleteEntry}
                                />
                            ))}
                        </div>

                        {/* Subtotals - responsive text */}
                        <SubtotalDisplay subtotal={subtotal} />
                    </>
                ) : (
                    /* Empty state */
                    <div className="py-4 text-center sm:py-6">
                        <p className="text-xs text-fg-subtle sm:text-sm">
                            {t('foodTracker.mealSlot.empty')}
                        </p>
                        <button
                            type="button"
                            onClick={() => onAddEntry(mealType)}
                            className="mt-1.5 text-xs text-primary hover:text-primary font-medium focus:outline-none focus-visible:underline sm:mt-2 sm:text-sm touch-manipulation"
                        >
                            {t('foodTracker.mealSlot.addFood')}
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}

export default MealSlot;
