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
import { ChatTab } from './ChatTab';
import { recognizeFood } from '../api/recognizeFood';
import { PortionSelector } from './PortionSelector';
import { ManualEntryForm } from './ManualEntryForm';
import { useFoodSearch } from '../hooks/useFoodSearch';
import { useFoodTrackerStore } from '../store/foodTrackerStore';
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import { t } from '@/shared/i18n';

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
    /** Additional CSS classes */
    className?: string;
}

interface TabConfig {
    id: EntryMethodTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
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
    className = '',
}: FoodEntryModalProps) {
    // Initial state, computed once at mount.
    //
    // The modal used to reset itself in an effect that fired when `isOpen` went
    // true, which meant a render with the previous entry's data before the
    // correction landed. The parent now remounts it with a key instead, so
    // "opening" and "having the right state" are the same event.
    const [activeTab, setActiveTab] = useState<EntryMethodTab>(DEFAULT_TAB);
    const [step, setStep] = useState<ModalStep>(editingEntry ? 'select-portion' : 'select-food');
    const [selectedFood, setSelectedFood] = useState<FoodItem | null>(
        editingEntry
            ? ({
                  id: editingEntry.foodId,
                  name: editingEntry.foodName,
                  nutritionPer100: per100Of(editingEntry),
                  servingSize: editingEntry.portionAmount,
                  servingUnit: editingEntry.portionType === 'milliliters' ? t('units.milliliter') : t('units.gram'),
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

    return (
        <div
            className={`fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center ${className}`}
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby="food-entry-modal-title"
        >
            <div
                ref={modalRef}
                className="w-full bg-white rounded-t-2xl shadow-xl max-h-[85vh] flex flex-col sm:max-w-lg sm:rounded-2xl sm:max-h-[90vh]"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-gray-200 sm:p-4">
                    {(step === 'select-portion' || step === 'manual-entry') ? (
                        <button
                            type="button"
                            onClick={step === 'manual-entry' ? handleManualEntryCancel : handleBackToFoodSelection}
                            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-2 touch-manipulation"
                            aria-label={t('common.back')}
                        >
                            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    ) : (
                        <div className="w-8" /> // Spacer
                    )}
                    <h2
                        id="food-entry-modal-title"
                        className="text-base font-semibold text-gray-900 sm:text-lg"
                    >
                        {step === 'select-food'
                            ? t('foodTracker.entryModal.addEntry')
                            : step === 'manual-entry'
                                ? t('foodTracker.entryModal.enterManually')
                                : editingEntry
                                    ? t('common.edit')
                                    : selectedFood?.name || t('foodTracker.entryModal.choosePortion')}
                    </h2>
                    <button
                        ref={firstFocusableRef}
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-2 touch-manipulation"
                        aria-label={t('common.close')}
                    >
                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                </div>

                {/* Content */}
                {step === 'select-food' && (
                    <>
                        {/* Tabs */}
                        <div
                            className="flex border-b border-gray-200"
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
                                        className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:gap-1 sm:py-3 sm:px-2 sm:text-xs touch-manipulation ${isActive
                                            ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                                            : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-[300px]">
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
                    <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                        <ManualEntryForm
                            onSubmit={handleManualEntrySubmit}
                            onCancel={handleManualEntryCancel}
                        />
                    </div>
                )}

                {step === 'select-portion' && (
                    /* Portion Selection Step */
                    <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                        {selectedFood && (
                            <>
                                {/* Batch Progress Indicator */}
                                {batchFoods.length > 1 && (
                                    <div className="flex items-center justify-between mb-4 p-3 bg-blue-50 rounded-lg">
                                        <p className="text-sm text-blue-700">
                                            {t('foodTracker.entryModal.batchProgress', { current: batchIndex + 1, total: batchFoods.length })}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleSkipBatchItem}
                                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                            {t('common.skip')}
                                        </button>
                                    </div>
                                )}

                                {/* Food Info — Editable */}
                                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                    {isEditingDetails ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">{t('foodTracker.entryModal.name')}</label>
                                                <input
                                                    type="text"
                                                    value={editedName}
                                                    onChange={(e) => setEditedName(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <p className="text-xs text-gray-500 font-medium">{t('foodTracker.entryModal.macrosPer100')}</p>
                                            <div className="grid grid-cols-4 gap-2">
                                                <div>
                                                    <label className="block text-[10px] text-gray-400 mb-0.5">{t('macros.calories')}</label>
                                                    <input
                                                        type="number"
                                                        value={editedNutritionPer100.calories || ''}
                                                        onChange={(e) => handleNutritionPer100Change('calories', e.target.value)}
                                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        min="0"
                                                        step="1"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-gray-400 mb-0.5">{t('macros.protein')}</label>
                                                    <input
                                                        type="number"
                                                        value={editedNutritionPer100.protein || ''}
                                                        onChange={(e) => handleNutritionPer100Change('protein', e.target.value)}
                                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        min="0"
                                                        step="0.1"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-gray-400 mb-0.5">{t('macros.fat')}</label>
                                                    <input
                                                        type="number"
                                                        value={editedNutritionPer100.fat || ''}
                                                        onChange={(e) => handleNutritionPer100Change('fat', e.target.value)}
                                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        min="0"
                                                        step="0.1"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-gray-400 mb-0.5">{t('macros.carbs')}</label>
                                                    <input
                                                        type="number"
                                                        value={editedNutritionPer100.carbs || ''}
                                                        onChange={(e) => handleNutritionPer100Change('carbs', e.target.value)}
                                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        min="0"
                                                        step="0.1"
                                                    />
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setIsEditingDetails(false)}
                                                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                            >
                                                {t('common.done')}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h3 className="font-medium text-gray-900">{editedName}</h3>
                                                {selectedFood.brand && (
                                                    <p className="text-sm text-gray-500">{selectedFood.brand}</p>
                                                )}
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {t('foodTracker.entryModal.per100Summary', { calories: Math.round(editedNutritionPer100.calories) })}
                                                    {' · '}{t('macros.proteinShort')} {Math.round(editedNutritionPer100.protein)}
                                                    {' · '}{t('macros.fatShort')} {Math.round(editedNutritionPer100.fat)}
                                                    {' · '}{t('macros.carbsShort')} {Math.round(editedNutritionPer100.carbs)}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {selectedFood.source !== 'user' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCloneFood(selectedFood)}
                                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        aria-label={t('foodTracker.entryModal.saveAsOwn')}
                                                        title={t('foodTracker.entryModal.saveAsOwn')}
                                                    >
                                                        <Bookmark className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingDetails(true)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    aria-label={t('common.edit')}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
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

                                {/* Meal Type Info */}
                                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                                    <p className="text-sm text-blue-700">
                                        {t('foodTracker.entryModal.mealLabel')} <span className="font-medium">{getMealTypeLabel(mealType)}</span>
                                    </p>
                                </div>

                                {/* Save Button */}
                                <div className="mt-6">
                                    <button
                                        type="button"
                                        onClick={handleSaveEntry}
                                        disabled={isSaving || !calculatedNutrition}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                    >
                                        {isSaving ? (
                                            <>
                                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                <span>{t('common.saving')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Check className="w-5 h-5" />
                                                <span>
                                                    {editingEntry
                                                        ? t('common.save')
                                                        : batchFoods.length > 0 && batchIndex + 1 < batchFoods.length
                                                            ? t('foodTracker.entryModal.addAndNext')
                                                            : t('common.add')}
                                                </span>
                                            </>
                                        )}
                                    </button>
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
            popularFoods={favoriteFoods}
            searchResults={results}
            onSearch={handleSearch}
            isLoading={isSearching}
        />
    );
}
