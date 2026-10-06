'use client';

/**
 * FoodEntryModal Component
 *
 * Modal for adding food entries with multiple entry methods:
 * - Поиск (Search)
 * - Штрих-код (Barcode)
 * - Фото еды (Photo)
 * - Чат (Chat)
 *
 * @module food-tracker/components/FoodEntryModal
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, Search, Barcode, Camera, MessageCircle, ArrowLeft, Check, Pencil, Edit3, Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';
import type { EntryMethodTab, FoodEntry, FoodItem, MealType, PortionType, KBZHU, CloneUserFoodRequest, UserFood } from '../types';
import { SearchTab } from './SearchTab';
import { BarcodeTab } from './BarcodeTab';
import { AIPhotoTab } from './AIPhotoTab';
import { MACRO_COLORS } from '@/shared/constants/macros';
import { ChatTab } from './ChatTab';
import { recognizeFood } from '../api/recognizeFood';
import { PortionSelector } from './PortionSelector';
import { ManualEntryForm } from './ManualEntryForm';
import { useFoodSearch } from '../hooks/useFoodSearch';
import { useFoodTrackerStore } from '../store/foodTrackerStore';
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import { t } from '@/shared/i18n';
import { Button, IconButton } from '@/shared/components/ui/Button';

// ============================================================================
// Types
// ============================================================================

export interface FoodEntryModalProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback when modal is closed */
    onClose: () => void;
    /** Pre-selected meal type */
    mealType?: MealType;
    /** Entry being edited (null for new entry) */
    editingEntry?: FoodEntry | null;
    /**
     * Вкладка, на которой окно открывается. Нужна, чтобы ссылка могла привести
     * человека прямо к распознаванию по фото: без неё пункт чек-листа
     * «фото тарелки» высаживал бы его на поиск, откуда нужное искать три клика
     * вглубь.
     */
    initialTab?: EntryMethodTab;
    /** Additional CSS classes */
    className?: string;
}

interface TabConfig {
    id: EntryMethodTab;
    label: string;
    icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

type ModalStep = 'select-food' | 'select-portion' | 'manual-entry';

// ============================================================================
// Constants
// ============================================================================

const TABS: TabConfig[] = [
    { id: 'search', label: t('foodTracker.tabs.search'), icon: Search },
    { id: 'barcode', label: t('foodTracker.tabs.barcode'), icon: Barcode },
    { id: 'manual', label: t('foodTracker.tabs.manual'), icon: Edit3 },
    { id: 'photo', label: t('foodTracker.tabs.photo'), icon: Camera },
    { id: 'chat', label: t('foodTracker.tabs.chat'), icon: MessageCircle },
];

const DEFAULT_TAB: EntryMethodTab = 'search';

// ============================================================================
// Component
// ============================================================================

/** Nutrition per 100 units, from an entry recorded as a portion. */
function per100Of(entry: FoodEntry): KBZHU {
    const scale = (value: number) =>
        entry.portionAmount > 0 ? (value / entry.portionAmount) * 100 : 0;

    return {
        calories: scale(entry.nutrition.calories),
        protein: scale(entry.nutrition.protein),
        fat: scale(entry.nutrition.fat),
        carbs: scale(entry.nutrition.carbs),
    };
}

export function FoodEntryModal({
    isOpen,
    onClose,
    mealType = 'breakfast',
    editingEntry,
    initialTab,
    className = '',
}: FoodEntryModalProps) {
    // Initial state, computed once at mount.
    //
    // The modal used to reset itself in an effect that fired when `isOpen` went
    // true, which meant a render with the previous entry's data before the
    // correction landed. The parent now remounts it with a key instead, so
    // "opening" and "having the right state" are the same event.
    const [activeTab, setActiveTab] = useState<EntryMethodTab>(initialTab ?? DEFAULT_TAB);
    const [step, setStep] = useState<ModalStep>(editingEntry ? 'select-portion' : 'select-food');
    const [selectedFood, setSelectedFood] = useState<FoodItem | null>(
        editingEntry
            ? ({
                  id: editingEntry.foodId,
                  name: editingEntry.foodName,
                  nutritionPer100: per100Of(editingEntry),
                  servingSize: editingEntry.portionAmount,
                  servingUnit: editingEntry.portionType === 'milliliters' ? 'ml' : 'g',
              } as FoodItem)
            : null
    );
    const [portionType, setPortionType] = useState<PortionType>(
        editingEntry ? editingEntry.portionType : 'grams'
    );
    const [portionAmount, setPortionAmount] = useState<number>(
        editingEntry ? editingEntry.portionAmount : 100
    );
    const [calculatedNutrition, setCalculatedNutrition] = useState<KBZHU | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [batchFoods, setBatchFoods] = useState<FoodItem[]>([]);
    const [batchIndex, setBatchIndex] = useState(0);
    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [editedName, setEditedName] = useState(editingEntry?.foodName ?? '');
    const [editedNutritionPer100, setEditedNutritionPer100] = useState<KBZHU>(
        editingEntry ? per100Of(editingEntry) : { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    // Refs
    const modalRef = useRef<HTMLDivElement>(null);
    const firstFocusableRef = useRef<HTMLButtonElement>(null);

    // Store hooks
    const addEntry = useFoodTrackerStore((state) => state.addEntry);
    const updateEntry = useFoodTrackerStore((state) => state.updateEntry);
    const selectedDate = useFoodTrackerStore((state) => state.selectedDate);

    // Focus lands on the first control when the modal opens. Everything else
    // the reset used to do is now the mount itself.
    useEffect(() => {
        if (!isOpen) return

        const timer = setTimeout(() => firstFocusableRef.current?.focus(), 0);
        return () => clearTimeout(timer);
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isOpen) {
                if (step === 'select-portion') {
                    setStep('select-food');
                    setSelectedFood(null);
                } else {
                    onClose();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, step]);

    // Handle click outside
    const handleBackdropClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget) {
                onClose();
            }
        },
        [onClose]
    );

    // Handle tab change
    const handleTabChange = useCallback((tab: EntryMethodTab) => {
        setActiveTab(tab);
    }, []);

    // Handle keyboard navigation for tabs
    const handleTabKeyDown = useCallback(
        (event: React.KeyboardEvent, currentIndex: number) => {
            let newIndex = currentIndex;

            if (event.key === 'ArrowRight') {
                newIndex = (currentIndex + 1) % TABS.length;
            } else if (event.key === 'ArrowLeft') {
                newIndex = (currentIndex - 1 + TABS.length) % TABS.length;
            } else if (event.key === 'Home') {
                newIndex = 0;
            } else if (event.key === 'End') {
                newIndex = TABS.length - 1;
            } else {
                return;
            }

            event.preventDefault();
            setActiveTab(TABS[newIndex].id);
        },
        []
    );

    // Handle food selection from any tab
    const handleSelectFood = useCallback((food: FoodItem) => {
        setSelectedFood(food);
        setPortionType('grams');
        setPortionAmount(food.servingSize || 100);
        setEditedName(food.name);
        setEditedNutritionPer100({ ...food.nutritionPer100 });
        setIsEditingDetails(false);
        setStep('select-portion');
    }, []);

    // Handle multiple foods selection (from AI photo)
    const handleSelectFoods = useCallback((foods: FoodItem[]) => {
        if (foods.length === 1) {
            handleSelectFood(foods[0]);
        } else if (foods.length > 1) {
            setBatchFoods(foods);
            setBatchIndex(0);
            handleSelectFood(foods[0]);
        }
    }, [handleSelectFood]);

    // Handle portion change
    const handlePortionChange = useCallback((type: PortionType, amount: number, nutrition: KBZHU) => {
        setPortionType(type);
        setPortionAmount(amount);
        setCalculatedNutrition(nutrition);
    }, []);

    // Handle back to food selection
    const handleBackToFoodSelection = useCallback(() => {
        setStep('select-food');
        setSelectedFood(null);
    }, []);

    // Handle manual entry request
    const handleManualEntry = useCallback(() => {
        setStep('manual-entry');
    }, []);

    // Handle manual entry form submit
    const handleManualEntrySubmit = useCallback((food: FoodItem) => {
        setSelectedFood(food);
        setPortionType('grams');
        setPortionAmount(food.servingSize || 100);
        setEditedName(food.name);
        setEditedNutritionPer100({ ...food.nutritionPer100 });
        setIsEditingDetails(false);
        setStep('select-portion');
    }, []);

    // Handle manual entry cancel
    const handleManualEntryCancel = useCallback(() => {
        setStep('select-food');
    }, []);

    // Handle clone food to user foods
    const handleCloneFood = useCallback(async (food: FoodItem) => {
        try {
            const payload: CloneUserFoodRequest = {
                source_food_id: food.id,
            };
            const url = getApiUrl('/food-tracker/user-foods/clone');
            await apiClient.post<UserFood>(url, payload);
            toast.success(t('foodTracker.entryModal.savedAsOwn'));
        } catch (error) {
            console.error('Failed to clone food:', error);
            toast.error(t('foodTracker.entryModal.saveAsOwnFailed'));
        }
    }, []);

    // Handle skipping a batch item
    const handleSkipBatchItem = useCallback(() => {
        const nextIndex = batchIndex + 1;
        if (nextIndex < batchFoods.length) {
            setBatchIndex(nextIndex);
            handleSelectFood(batchFoods[nextIndex]);
        } else {
            setBatchFoods([]);
            setBatchIndex(0);
            onClose();
        }
    }, [batchIndex, batchFoods, handleSelectFood, onClose]);

    // Build effective food with user edits applied (for PortionSelector)
    const effectiveFood = useMemo(() => {
        if (!selectedFood) return null;
        return {
            ...selectedFood,
            name: editedName,
            nutritionPer100: editedNutritionPer100,
        } as FoodItem;
    }, [selectedFood, editedName, editedNutritionPer100]);

    // Handle nutrition per-100g field change
    const handleNutritionPer100Change = useCallback((field: keyof KBZHU, value: string) => {
        const numValue = parseFloat(value) || 0;
        setEditedNutritionPer100(prev => ({ ...prev, [field]: numValue }));
    }, []);

    // Handle save entry
    const handleSaveEntry = useCallback(async () => {
        if (!selectedFood || !calculatedNutrition) return;

        setIsSaving(true);

        try {
            if (editingEntry) {
                await updateEntry(editingEntry.id, {
                    mealType,
                    portionType,
                    portionAmount,
                    time: editingEntry.time,
                    foodName: editedName,
                    calories: calculatedNutrition.calories,
                    protein: calculatedNutrition.protein,
                    fat: calculatedNutrition.fat,
                    carbs: calculatedNutrition.carbs,
                });
                onClose();
            } else {
                const now = new Date();
                const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

                await addEntry(mealType, {
                    foodId: selectedFood.id,
                    mealType,
                    portionType,
                    portionAmount,
                    time,
                    date: selectedDate,
                    foodName: editedName,
                    calories: calculatedNutrition.calories,
                    protein: calculatedNutrition.protein,
                    fat: calculatedNutrition.fat,
                    carbs: calculatedNutrition.carbs,
                });

                const nextIndex = batchIndex + 1;
                if (batchFoods.length > 0 && nextIndex < batchFoods.length) {
                    setBatchIndex(nextIndex);
                    handleSelectFood(batchFoods[nextIndex]);
                } else {
                    setBatchFoods([]);
                    setBatchIndex(0);
                    onClose();
                }
            }
        } catch (error) {
            console.error('Failed to save entry:', error);
        } finally {
            setIsSaving(false);
        }
    }, [selectedFood, calculatedNutrition, mealType, portionType, portionAmount, selectedDate, addEntry, updateEntry, editingEntry, onClose, batchIndex, batchFoods, handleSelectFood, editedName]);

    if (!isOpen) {
        return null;
    }

    // Поле КБЖУ на 100 г: число по центру, 48 px и 16 px текста, как `Input`.
    const per100FieldClass =
        'h-12 w-full rounded-field border border-line bg-surface px-2 text-center text-base text-fg tabular-nums ' +
        'transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30';
    const macroFields: { key: 'protein' | 'fat' | 'carbs'; label: string }[] = [
        { key: 'protein', label: t('macros.protein') },
        { key: 'fat', label: t('macros.fat') },
        { key: 'carbs', label: t('macros.carbs') },
    ];

    return (
        <div
            className={`fixed inset-0 z-[60] flex items-end justify-center bg-scrim sm:items-center sm:p-4 ${className}`}
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby="food-entry-modal-title"
        >
            {/* Шторка снизу на телефоне, окно по центру на десктопе — как
                `ConfirmDialog` и формы куратора. */}
            <div
                ref={modalRef}
                className="flex max-h-[90vh] w-full flex-col rounded-t-sheet bg-surface pb-[env(safe-area-inset-bottom)] shadow-overlay sm:max-w-lg sm:rounded-sheet sm:pb-0"
            >
                {/* Header */}
                <div className="flex items-center gap-2 px-3 pb-2 pt-4 sm:px-4">
                    {(step === 'select-portion' || step === 'manual-entry') ? (
                        <IconButton
                            variant="ghost"
                            onClick={step === 'manual-entry' ? handleManualEntryCancel : handleBackToFoodSelection}
                            aria-label={t('common.back')}
                            className="touch-manipulation"
                        >
                            <ArrowLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                        </IconButton>
                    ) : (
                        <div className="w-11 shrink-0" aria-hidden="true" />
                    )}
                    <h2
                        id="food-entry-modal-title"
                        className="type-title-2 min-w-0 flex-1 truncate text-center text-fg"
                    >
                        {step === 'select-food'
                            ? t('foodTracker.entryModal.addEntry')
                            : step === 'manual-entry'
                                ? t('foodTracker.entryModal.enterManually')
                                : editingEntry
                                    ? t('common.edit')
                                    : selectedFood?.name || t('foodTracker.entryModal.choosePortion')}
                    </h2>
                    <IconButton
                        ref={firstFocusableRef}
                        variant="ghost"
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className="touch-manipulation"
                    >
                        <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                </div>

                {/* Content */}
                {step === 'select-food' && (
                    <>
                        {/* Способы записи — вкладками с подчёркиванием, как
                            вкладки дневника: выбранная — чернилами, не терракотой. */}
                        <div
                            className="flex border-b border-line px-2 sm:px-3"
                            role="tablist"
                            aria-label={t('foodTracker.tabs.label')}
                        >
                            {TABS.map((tab, index) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;

                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={isActive}
                                        aria-controls={`tabpanel-${tab.id}`}
                                        id={`tab-${tab.id}`}
                                        tabIndex={isActive ? 0 : -1}
                                        onClick={() => handleTabChange(tab.id)}
                                        onKeyDown={(e) => handleTabKeyDown(e, index)}
                                        className={`-mb-px flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 border-b-2 px-1 text-xs transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus touch-manipulation ${isActive
                                            ? 'border-line-strong font-semibold text-fg'
                                            : 'border-transparent font-medium text-fg-subtle hover:text-fg'
                                            }`}
                                    >
                                        <Icon className="h-5 w-5" aria-hidden="true" />
                                        <span className="truncate">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Tab Content */}
                        <div className="min-h-[300px] flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                            {activeTab === 'search' && (
                                <SearchTabWithHook
                                    onSelectFood={handleSelectFood}
                                    onManualEntry={handleManualEntry}
                                />
                            )}
                            {activeTab === 'barcode' && (
                                <BarcodeTab
                                    onSelectFood={handleSelectFood}
                                    onManualEntry={handleManualEntry}
                                />
                            )}
                            {activeTab === 'photo' && (
                                <AIPhotoTab
                                    onSelectFoods={handleSelectFoods}
                                    onManualSearch={() => setActiveTab('search')}
                                    onRecognize={recognizeFood}
                                />
                            )}
                            {activeTab === 'chat' && (
                                <ChatTab
                                    onSelectFood={handleSelectFood}
                                />
                            )}
                            {activeTab === 'manual' && step === 'select-food' && (
                                <ManualEntryForm
                                    onSubmit={handleManualEntrySubmit}
                                    onCancel={onClose}
                                />
                            )}
                        </div>
                    </>
                )}

                {step === 'manual-entry' && (
                    /* Manual Entry Step */
                    <div className="flex-1 overflow-y-auto border-t border-line px-4 py-4 sm:px-5">
                        <ManualEntryForm
                            onSubmit={handleManualEntrySubmit}
                            onCancel={handleManualEntryCancel}
                        />
                    </div>
                )}

                {step === 'select-portion' && (
                    /* Portion Selection Step */
                    <div className="flex-1 overflow-y-auto border-t border-line px-4 py-4 sm:px-5">
                        {selectedFood && (
                            <>
                                {/* Batch Progress Indicator — сообщает, а не зовёт */}
                                {batchFoods.length > 1 && (
                                    <div className="mb-4 flex items-center justify-between gap-3 rounded-tile bg-info-soft py-1 pl-4 pr-1">
                                        <p className="text-sm text-info-fg tabular-nums">
                                            {t('foodTracker.entryModal.batchProgress', { current: batchIndex + 1, total: batchFoods.length })}
                                        </p>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="md"
                                            onClick={handleSkipBatchItem}
                                        >
                                            {t('common.skip')}
                                        </Button>
                                    </div>
                                )}

                                {/* Food Info — Editable */}
                                <div className="mb-4 rounded-tile border border-line p-4" data-testid="entry-food-details">
                                    {isEditingDetails ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label htmlFor="entry-food-name" className="mb-1.5 block text-sm font-medium text-fg-muted">{t('foodTracker.entryModal.name')}</label>
                                                <input
                                                    id="entry-food-name"
                                                    type="text"
                                                    value={editedName}
                                                    onChange={(e) => setEditedName(e.target.value)}
                                                    className="h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                                                />
                                            </div>
                                            <p className="type-overline text-fg-subtle">{t('foodTracker.entryModal.macrosPer100')}</p>
                                            <div className="grid grid-cols-4 gap-2">
                                                <div>
                                                    <label className="mb-1 block truncate text-xs font-medium text-fg-muted">{t('macros.calories')}</label>
                                                    <input
                                                        type="number"
                                                        inputMode="decimal"
                                                        value={editedNutritionPer100.calories || ''}
                                                        onChange={(e) => handleNutritionPer100Change('calories', e.target.value)}
                                                        className={per100FieldClass}
                                                        min="0"
                                                        step="1"
                                                    />
                                                </div>
                                                {macroFields.map(({ key, label }) => (
                                                    <div key={key}>
                                                        <label className="mb-1 flex items-center gap-1 text-xs font-medium text-fg-muted">
                                                            <span
                                                                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                                                                style={{ backgroundColor: MACRO_COLORS[key] }}
                                                                aria-hidden="true"
                                                            />
                                                            <span className="truncate">{label}</span>
                                                        </label>
                                                        <input
                                                            type="number"
                                                            inputMode="decimal"
                                                            value={editedNutritionPer100[key] || ''}
                                                            onChange={(e) => handleNutritionPer100Change(key, e.target.value)}
                                                            className={per100FieldClass}
                                                            min="0"
                                                            step="0.1"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => setIsEditingDetails(false)}
                                            >
                                                {t('common.done')}
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <h3 className="type-headline text-fg">{editedName}</h3>
                                                {selectedFood.brand && (
                                                    <p className="text-sm text-fg-muted">{selectedFood.brand}</p>
                                                )}
                                                <p className="type-caption mt-1 text-fg-muted tabular-nums">
                                                    {t('foodTracker.entryModal.per100Summary', { calories: Math.round(editedNutritionPer100.calories) })}
                                                    {' · '}{t('macros.proteinShort')} {Math.round(editedNutritionPer100.protein)}
                                                    {' · '}{t('macros.fatShort')} {Math.round(editedNutritionPer100.fat)}
                                                    {' · '}{t('macros.carbsShort')} {Math.round(editedNutritionPer100.carbs)}
                                                </p>
                                            </div>
                                            <div className="-mr-2 -mt-2 flex shrink-0 items-center">
                                                {selectedFood.source !== 'user' && (
                                                    <IconButton
                                                        variant="ghost"
                                                        onClick={() => handleCloneFood(selectedFood)}
                                                        aria-label={t('foodTracker.entryModal.saveAsOwn')}
                                                        title={t('foodTracker.entryModal.saveAsOwn')}
                                                    >
                                                        <Bookmark className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                                                    </IconButton>
                                                )}
                                                <IconButton
                                                    variant="ghost"
                                                    onClick={() => setIsEditingDetails(true)}
                                                    aria-label={t('common.edit')}
                                                >
                                                    <Pencil className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                                                </IconButton>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Portion Selector */}
                                <PortionSelector
                                    food={effectiveFood!}
                                    initialPortionType={portionType}
                                    initialAmount={portionAmount}
                                    onPortionChange={handlePortionChange}
                                />

                                {/* Meal Type Info — сведение, не действие */}
                                <div className="mt-4 rounded-tile bg-info-soft px-4 py-3">
                                    <p className="text-sm text-info-fg">
                                        {t('foodTracker.entryModal.mealLabel')} <span className="font-semibold">{getMealTypeLabel(mealType)}</span>
                                    </p>
                                </div>

                                {/* Save Button — единственное главное действие шторки */}
                                <div className="mt-6">
                                    <Button
                                        type="button"
                                        size="lg"
                                        block
                                        onClick={handleSaveEntry}
                                        disabled={!calculatedNutrition}
                                        isLoading={isSaving}
                                    >
                                        {isSaving ? (
                                            <span>{t('common.saving')}</span>
                                        ) : (
                                            <>
                                                <Check className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                                                <span>
                                                    {editingEntry
                                                        ? t('common.save')
                                                        : batchFoods.length > 0 && batchIndex + 1 < batchFoods.length
                                                            ? t('foodTracker.entryModal.addAndNext')
                                                            : t('common.add')}
                                                </span>
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Helpers
// ============================================================================

function getMealTypeLabel(mealType: MealType): string {
    const labels: Record<MealType, string> = {
        breakfast: t('meals.breakfast'),
        lunch: t('meals.lunch'),
        dinner: t('meals.dinner'),
        snack: t('meals.snack'),
    };
    return labels[mealType];
}

export default FoodEntryModal;

// ============================================================================
// SearchTab Wrapper with Hook
// ============================================================================

interface SearchTabWithHookProps {
    onSelectFood: (food: FoodItem) => void;
    onManualEntry?: () => void;
}

function SearchTabWithHook({ onSelectFood, onManualEntry }: SearchTabWithHookProps) {
    const {
        results,
        recentFoods,
        favoriteFoods,
        favoriteIds,
        pendingFavoriteId,
        favoriteError,
        toggleFavorite,
        isSearching,
        setQuery,
    } = useFoodSearch({ autoLoadRecent: true });

    const handleSearch = useCallback(async (query: string): Promise<FoodItem[]> => {
        setQuery(query);
        // Return empty - the component will use the searchResults prop
        return [];
    }, [setQuery]);

    // Pass results directly to SearchTab via searchResults prop
    return (
        <SearchTab
            onSelectFood={onSelectFood}
            onManualEntry={onManualEntry}
            recentFoods={recentFoods}
            favoriteFoods={favoriteFoods}
            favoriteIds={favoriteIds}
            onToggleFavorite={toggleFavorite}
            pendingFavoriteId={pendingFavoriteId}
            favoriteError={favoriteError}
            searchResults={results}
            onSearch={handleSearch}
            isLoading={isSearching}
        />
    );
}
