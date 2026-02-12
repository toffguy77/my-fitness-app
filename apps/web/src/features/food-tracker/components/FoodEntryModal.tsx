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
import { X, Search, Barcode, Camera, MessageCircle } from 'lucide-react';
import type { EntryMethodTab, FoodEntry, FoodItem, MealType } from '../types';

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
    /** Callback when a food item is selected with portion */
    onSelectFood?: (food: FoodItem, portionAmount: number, portionType: 'grams' | 'milliliters' | 'portion') => Promise<void>;
    /** Entry being edited (null for new entry) */
    editingEntry?: FoodEntry | null;
    /** Callback when entry is saved */
    onSave?: (entry: unknown) => void;
    /** Additional CSS classes */
    className?: string;
}

interface TabConfig {
    id: EntryMethodTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}

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
    mealType,
    onSave,
    className = '',
}: FoodEntryModalProps) {
    const [activeTab, setActiveTab] = useState<EntryMethodTab>(DEFAULT_TAB);
    const modalRef = useRef<HTMLDivElement>(null);
    const firstFocusableRef = useRef<HTMLButtonElement>(null);

    // Reset to default tab when modal opens
    useEffect(() => {
        if (isOpen) {
            setActiveTab(DEFAULT_TAB);
            // Focus first focusable element when modal opens
            setTimeout(() => {
                firstFocusableRef.current?.focus();
            }, 0);
        }
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

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
                {/* Header - responsive padding */}
                <div className="flex items-center justify-between p-3 border-b border-gray-200 sm:p-4">
                    <h2
                        id="food-entry-modal-title"
                        className="text-base font-semibold text-gray-900 sm:text-lg"
                    >
                        Добавить запись
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

                {/* Tabs - responsive */}
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

                {/* Tab Content - responsive padding */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                    {TABS.map((tab) => (
                        <div
                            key={tab.id}
                            id={`tabpanel-${tab.id}`}
                            role="tabpanel"
                            aria-labelledby={`tab-${tab.id}`}
                            hidden={activeTab !== tab.id}
                            tabIndex={0}
                        >
                            {activeTab === tab.id && (
                                <TabContent
                                    tab={tab.id}
                                    mealType={mealType}
                                    onSave={onSave}
                                    onClose={onClose}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Tab Content Component (Placeholder)
// ============================================================================

interface TabContentProps {
    tab: EntryMethodTab;
    mealType?: MealType;
    onSave?: (entry: unknown) => void;
    onClose: () => void;
}

function TabContent({ tab, mealType }: TabContentProps) {
    // Placeholder content for each tab
    // These will be replaced with actual components in subsequent tasks
    const placeholders: Record<EntryMethodTab, { title: string; description: string }> = {
        search: {
            title: 'Поиск продуктов',
            description: 'Найдите продукт по названию или выберите из недавних',
        },
        barcode: {
            title: 'Сканирование штрих-кода',
            description: 'Наведите камеру на штрих-код продукта',
        },
        photo: {
            title: 'Распознавание по фото',
            description: 'Сфотографируйте еду для автоматического распознавания',
        },
        chat: {
            title: 'Чат с куратором',
            description: 'Опишите что вы съели, и куратор поможет добавить запись',
        },
    };

    const content = placeholders[tab];

    return (
        <div className="flex flex-col items-center justify-center py-6 text-center sm:py-8">
            <h3 className="text-base font-medium text-gray-900 mb-1.5 sm:text-lg sm:mb-2">{content.title}</h3>
            <p className="text-xs text-gray-500 max-w-xs sm:text-sm">{content.description}</p>
            {mealType && (
                <p className="mt-3 text-[10px] text-gray-400 sm:mt-4 sm:text-xs">
                    Приём пищи: {getMealTypeLabel(mealType)}
                </p>
            )}
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
