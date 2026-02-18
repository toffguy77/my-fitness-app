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

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, Barcode, Camera, MessageCircle, ArrowLeft, Check } from 'lucide-react';
import type { EntryMethodTab, FoodEntry, FoodItem, MealType, PortionType, KBZHU } from '../types';
import { SearchTab } from './SearchTab';
import { BarcodeTab } from './BarcodeTab';
import { AIPhotoTab } from './AIPhotoTab';
import { ChatTab } from './ChatTab';
import { PortionSelector } from './PortionSelector';
import { ManualEntryForm } from './ManualEntryForm';
import { useFoodSearch } from '../hooks/useFoodSearch';
import { useFoodTrackerStore } from '../store/foodTrackerStore';

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
    { id: 'search', label: 'Поиск', icon: Search },
    { id: 'barcode', label: 'Штрих-код', icon: Barcode },
    { id: 'photo', label: 'Фото еды', icon: Camera },
    { id: 'chat', label: 'Чат', icon: MessageCircle },
];

const DEFAULT_TAB: EntryMethodTab = 'search';

// ============================================================================
// Component
// ============================================================================

export function FoodEntryModal({
    isOpen,
    onClose,
    mealType = 'breakfast',
    editingEntry,
    className = '',
}: FoodEntryModalProps) {
    // State
    const [activeTab, setActiveTab] = useState<EntryMethodTab>(DEFAULT_TAB);
    const [step, setStep] = useState<ModalStep>('select-food');
    const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
    const [portionType, setPortionType] = useState<PortionType>('grams');
    const [portionAmount, setPortionAmount] = useState<number>(100);
    const [calculatedNutrition, setCalculatedNutrition] = useState<KBZHU | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [batchFoods, setBatchFoods] = useState<FoodItem[]>([]);
    const [batchIndex, setBatchIndex] = useState(0);

    // Refs
    const modalRef = useRef<HTMLDivElement>(null);
    const firstFocusableRef = useRef<HTMLButtonElement>(null);
    const wasOpenRef = useRef(false);

    // Store hooks
    const addEntry = useFoodTrackerStore((state) => state.addEntry);
    const updateEntry = useFoodTrackerStore((state) => state.updateEntry);
    const selectedDate = useFoodTrackerStore((state) => state.selectedDate);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            if (editingEntry) {
                // Edit mode: pre-fill with existing data
                setActiveTab(DEFAULT_TAB);
                setStep('select-portion');
                setSelectedFood({
                    id: editingEntry.foodId,
                    name: editingEntry.foodName,
                    nutritionPer100: {
                        calories: editingEntry.portionAmount > 0
                            ? (editingEntry.nutrition.calories / editingEntry.portionAmount) * 100
                            : 0,
                        protein: editingEntry.portionAmount > 0
                            ? (editingEntry.nutrition.protein / editingEntry.portionAmount) * 100
                            : 0,
                        fat: editingEntry.portionAmount > 0
                            ? (editingEntry.nutrition.fat / editingEntry.portionAmount) * 100
                            : 0,
                        carbs: editingEntry.portionAmount > 0
                            ? (editingEntry.nutrition.carbs / editingEntry.portionAmount) * 100
                            : 0,
                    },
                    servingSize: editingEntry.portionAmount,
                    servingUnit: editingEntry.portionType === 'milliliters' ? 'мл' : 'г',
                } as FoodItem);
                setPortionType(editingEntry.portionType);
                setPortionAmount(editingEntry.portionAmount);
            } else {
                // New entry mode
                setActiveTab(DEFAULT_TAB);
                setStep('select-food');
                setSelectedFood(null);
                setPortionType('grams');
                setPortionAmount(100);
            }
            setCalculatedNutrition(null);
            setBatchFoods([]);
            setBatchIndex(0);
            setTimeout(() => firstFocusableRef.current?.focus(), 0);
        }
        wasOpenRef.current = isOpen;
    }, [isOpen, editingEntry]);

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
        setStep('select-portion');
    }, []);

    // Handle manual entry cancel
    const handleManualEntryCancel = useCallback(() => {
        setStep('select-food');
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
    }, [selectedFood, calculatedNutrition, mealType, portionType, portionAmount, selectedDate, addEntry, updateEntry, editingEntry, onClose, batchIndex, batchFoods, handleSelectFood]);

    if (!isOpen) {
        return null;
    }

    return (
        <div
            className={`fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center ${className}`}
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
                            aria-label="Назад"
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
                            ? 'Добавить запись'
                            : step === 'manual-entry'
                                ? 'Ввести вручную'
                                : editingEntry
                                    ? 'Редактировать'
                                    : selectedFood?.name || 'Выбор порции'}
                    </h2>
                    <button
                        ref={firstFocusableRef}
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-2 touch-manipulation"
                        aria-label="Закрыть"
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
                            aria-label="Способы добавления"
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
                                />
                            )}
                            {activeTab === 'chat' && (
                                <ChatTab
                                    onSelectFood={handleSelectFood}
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
                                            Добавляем {batchIndex + 1} из {batchFoods.length}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleSkipBatchItem}
                                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                            Пропустить
                                        </button>
                                    </div>
                                )}

                                {/* Food Info */}
                                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                    <h3 className="font-medium text-gray-900">{selectedFood.name}</h3>
                                    {selectedFood.brand && (
                                        <p className="text-sm text-gray-500">{selectedFood.brand}</p>
                                    )}
                                    <p className="text-xs text-gray-400 mt-1">
                                        На 100г: {Math.round(selectedFood.nutritionPer100.calories)} ккал
                                    </p>
                                </div>

                                {/* Portion Selector */}
                                <PortionSelector
                                    food={selectedFood}
                                    initialPortionType={portionType}
                                    initialAmount={portionAmount}
                                    onPortionChange={handlePortionChange}
                                />

                                {/* Meal Type Info */}
                                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                                    <p className="text-sm text-blue-700">
                                        Приём пищи: <span className="font-medium">{getMealTypeLabel(mealType)}</span>
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
                                                <span>Сохранение...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Check className="w-5 h-5" />
                                                <span>
                                                    {editingEntry
                                                        ? 'Сохранить'
                                                        : batchFoods.length > 0 && batchIndex + 1 < batchFoods.length
                                                            ? 'Добавить и далее'
                                                            : 'Добавить'}
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
        breakfast: 'Завтрак',
        lunch: 'Обед',
        dinner: 'Ужин',
        snack: 'Перекус',
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
