/**
 * DietTab Component
 *
 * Main tab for daily diet tracking. Integrates KBZHUSummary, MealSlot components,
 * WaterTracker, and provides a FAB for quick food entry.
 *
 * @module food-tracker/components/DietTab
 */

'use client';

import React, { useCallback, useState } from 'react';
import { QuickAddBar, type QuickAddMethod } from '@/shared/components/ui/QuickAdd';
import { KBZHUSummary } from './KBZHUSummary';
import { MealSlot } from './MealSlot';
import { WaterTracker } from './WaterTracker';
import { FoodEntryModal } from './FoodEntryModal';
import { useFoodTrackerStore } from '../store/foodTrackerStore';
import type { MealType, FoodEntry, WaterLog, EntryMethodTab } from '../types';
import { CalculateTargetPrompt } from '@/features/nutrition-calc/components/CalculateTargetPrompt';
import type { MissingTargetInputs } from '@/features/nutrition-calc/types';
import { useDiaryPlan } from '@/features/meal-plan';
import { t } from '@/shared/i18n';

// ============================================================================
// Types
// ============================================================================

export interface DietTabProps {
    /** Food entries grouped by meal type */
    entries: Record<MealType, FoodEntry[]>;
    /** Daily totals for КБЖУ */
    dailyTotals: {
        calories: number;
        protein: number;
        fat: number;
        carbs: number;
    };
    /** Норма КБЖУ, или null — посчитать её не из чего. */
    targetGoals: {
        calories: number;
        protein: number;
        fat: number;
        carbs: number;
    } | null;
    /**
     * Чего не хватает для расчёта нормы, когда её нет. Необязательно: при
     * заданной норме приглашение не показывается, и знать нечего.
     */
    missingTargetInputs?: MissingTargetInputs | null;
    /** Loading state */
    isLoading: boolean;
    /** Callback to delete an entry */
    onDeleteEntry: (id: string, mealType: MealType) => Promise<boolean>;
    /**
     * Вкладка окна записи, на которой его следует открыть сразу при появлении
     * вкладки рациона. Пусто — окно не открывается само.
     */
    openEntryOn?: EntryMethodTab | null;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Приём пищи по часу: до 11 — завтрак, до 16 — обед, с 17 до 22 — ужин, иначе перекус. */
export function mealForHour(hour: number): MealType {
    if (hour >= 5 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 16) return 'lunch';
    if (hour >= 17 && hour < 22) return 'dinner';
    return 'snack';
}

// ============================================================================
// Component
// ============================================================================

export function DietTab({
    entries,
    dailyTotals,
    targetGoals,
    missingTargetInputs = null,
    isLoading,
    onDeleteEntry,
    openEntryOn = null,
    className = '',
}: DietTabProps): React.ReactElement {
    // Store state for water tracking
    const {
        waterIntake,
        waterGoal,
        glassSize,
        waterEnabled,
        selectedDate,
        addWater,
        fetchDayData,
    } = useFoodTrackerStore();

    // Блюда плана под приёмами пищи. Передаются сохранённые записи (без
    // временных оптимистичных): удалённая или перенесённая запись съеденного
    // блюда возвращает его под «По плану».
    const savedEntries = MEAL_TYPES.flatMap((mealType) =>
        (entries[mealType] ?? [])
            .filter((entry) => !entry.id.startsWith('temp_'))
            .map((entry) => ({ id: entry.id, mealType }))
    );
    const diaryPlan = useDiaryPlan(selectedDate, savedEntries, () => {
        void fetchDayData(selectedDate);
    });

    // Local state for modal
    const [isModalOpen, setIsModalOpen] = useState(openEntryOn !== null);
    // Способ, выбранный на панели быстрого ввода: окно открывается сразу на нём.
    const [quickTab, setQuickTab] = useState<EntryMethodTab | null>(null);

    // Ссылка вида /food-tracker?add=photo должна привести прямо к распознаванию.
    // Начальное состояние выше берёт указание сразу, поэтому окно открывается
    // первым же рендером, а не эффектом после него.
    
    const [selectedMealType, setSelectedMealType] = useState<MealType>('breakfast');
    const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);

    // Handle add entry button click
    const handleAddEntry = useCallback((mealType: MealType) => {
        setSelectedMealType(mealType);
        setEditingEntry(null);
        setIsModalOpen(true);
    }, []);

    // Handle entry click (for editing)
    const handleEntryClick = useCallback((entry: FoodEntry) => {
        setEditingEntry(entry);
        setSelectedMealType(entry.mealType);
        setIsModalOpen(true);
    }, []);

    // Handle entry edit
    const handleEditEntry = useCallback((entry: FoodEntry) => {
        setEditingEntry(entry);
        setSelectedMealType(entry.mealType);
        setIsModalOpen(true);
    }, []);

    // Handle entry delete
    const handleDeleteEntry = useCallback(async (entry: FoodEntry) => {
        await onDeleteEntry(entry.id, entry.mealType);
    }, [onDeleteEntry]);

    // Handle modal close
    const handleModalClose = useCallback(() => {
        setIsModalOpen(false);
        setEditingEntry(null);
        setQuickTab(null);
    }, []);

    // Handle add water
    const handleAddWater = useCallback(() => {
        addWater(1);
    }, [addWater]);

    // Быстрый ввод: окно записи открывается сразу на выбранном способе, а
    // приём пищи угадывается по времени — чаще всего человек записывает то,
    // что только что съел.
    const handleQuickAdd = useCallback((method: QuickAddMethod) => {
        setSelectedMealType(mealForHour(new Date().getHours()));
        setEditingEntry(null);
        setQuickTab(method);
        setIsModalOpen(true);
    }, []);

    // Create water log object for WaterTracker
    const waterLog: WaterLog = {
        date: selectedDate,
        glasses: waterIntake,
        goal: waterGoal,
        glassSize,
    };

    return (
        <div className={`space-y-4 pb-28 ${className}`}>
            {/* КБЖУ Summary. Без нормы сводка показывает съеденное числом, а
                рядом стоит приглашение её посчитать — вместо придуманных цифр. */}
            <KBZHUSummary
                current={dailyTotals}
                target={targetGoals}
            />

            {!targetGoals && <CalculateTargetPrompt missing={missingTargetInputs} />}

            {/* Meal Slots - responsive grid on larger screens */}
            <div className="space-y-3 sm:space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                {MEAL_TYPES.map((mealType) => (
                    <MealSlot
                        key={mealType}
                        mealType={mealType}
                        entries={entries[mealType]}
                        onAddEntry={handleAddEntry}
                        onEntryClick={handleEntryClick}
                        onEditEntry={handleEditEntry}
                        onDeleteEntry={handleDeleteEntry}
                        planned={diaryPlan.plannedFor(mealType)}
                        onLogPlanned={diaryPlan.log}
                        loggingPlanned={diaryPlan.logging === mealType}
                    />
                ))}
            </div>

            {/* Water Tracker */}
            {waterEnabled && (
                <WaterTracker
                    waterLog={waterLog}
                    onAddGlass={handleAddWater}
                    isLoading={isLoading}
                />
            )}

            {/* Быстрый ввод над нижней навигацией: поиск, штрихкод, фото —
                в одно касание, без выбора приёма пищи и способа. */}
            <div
                className="fixed inset-x-0 z-40 mx-auto max-w-md px-screen-x"
                style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px))' }}
                data-testid="quick-add-bar"
            >
                <QuickAddBar onSelect={handleQuickAdd} />
            </div>

            {/* Food Entry Modal */}
            {/* Keyed on what it is editing: opening the modal remounts it, so
                its state starts correct instead of being corrected by an
                effect after the first render. */}
            <FoodEntryModal
                key={isModalOpen ? (editingEntry?.id ?? `new-${selectedMealType}-${quickTab ?? openEntryOn ?? ''}`) : 'closed'}
                isOpen={isModalOpen}
                onClose={handleModalClose}
                mealType={selectedMealType}
                editingEntry={editingEntry}
                initialTab={quickTab ?? openEntryOn ?? undefined}
            />

            {/* Loading Overlay */}
            {isLoading && (
                <div
                    className="fixed inset-0 bg-surface/50 flex items-center justify-center z-40"
                    aria-live="polite"
                    aria-busy="true"
                >
                    <div className="flex flex-col items-center gap-2">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
                        <span className="text-sm text-fg-muted">{t('common.loading')}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DietTab;
