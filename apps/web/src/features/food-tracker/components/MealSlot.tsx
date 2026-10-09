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
import { IconButton } from '@/shared/components/ui/Button';
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2.5 text-[13px] text-fg-muted tabular-nums">
            <span className="font-medium">{t('foodTracker.mealSlot.subtotal')}</span>
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

    // Лента дня: точка и линия слева, время, название засечками, калории
    // приёма справа. Пустой приём — пунктирная точка: «ещё впереди».
    return (
        <section
            className={`relative pl-7 ${className}`}
            aria-label={t('foodTracker.mealSlot.aria', { label })}
            data-meal={mealType}
        >
            <span aria-hidden="true" className="absolute bottom-0 left-[5px] top-4 w-px bg-line" />
            <span
                aria-hidden="true"
                className={`absolute left-0 top-2 h-[11px] w-[11px] rounded-full border-2 bg-canvas ${hasEntries ? 'border-fg' : 'border-dashed border-primary'}`}
            />

            <div className="flex items-center gap-2.5">
                <MealIcon mealType={mealType} className="h-4 w-4 shrink-0 text-fg-subtle" />
                {firstTime && (
                    <span className="text-[13px] font-semibold text-fg-subtle tabular-nums">{firstTime}</span>
                )}
                <h3 className="type-title-3 flex-1 text-fg">{label}</h3>
                {hasEntries && (
                    <span className="text-[15px] font-semibold text-fg tabular-nums">
                        {Math.round(subtotal.calories)} {t('units.kcal')}
                    </span>
                )}
                <IconButton
                    variant="secondary"
                    onClick={() => onAddEntry(mealType)}
                    aria-label={t('foodTracker.mealSlot.addAria', { label })}
                >
                    <Plus className="h-4 w-4" strokeWidth={2.2} />
                </IconButton>
            </div>

            <div className="mt-2 pb-5">
                {hasEntries ? (
                    <div className="rounded-card border border-line bg-surface px-4">
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
                        <SubtotalDisplay subtotal={subtotal} />
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => onAddEntry(mealType)}
                        className="flex min-h-12 w-full items-center justify-between rounded-card border border-dashed border-line px-4 text-left transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        <span className="text-sm text-fg-subtle">{t('foodTracker.mealSlot.empty')}</span>
                        <span className="text-sm font-semibold text-primary">{t('foodTracker.mealSlot.addFood')}</span>
                    </button>
                )}
            </div>
        </section>
    );
}

export default MealSlot;
