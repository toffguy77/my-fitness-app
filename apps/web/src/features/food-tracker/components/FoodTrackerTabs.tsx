'use client';

/**
 * FoodTrackerTabs Component
 *
 * Tab navigation for food tracker with "Рацион" and "Рекомендации" tabs.
 * Supports keyboard navigation and accessibility.
 *
 * @module food-tracker/components/FoodTrackerTabs
 */

import { useCallback, useRef, KeyboardEvent } from 'react';
import type { FoodTrackerTab } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface FoodTrackerTabsProps {
    /** Currently active tab */
    activeTab: FoodTrackerTab;
    /** Callback when tab changes */
    onTabChange: (tab: FoodTrackerTab) => void;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Tab configuration with Russian labels
 */
const TABS: { id: FoodTrackerTab; label: string }[] = [
    { id: 'diet', label: 'Рацион' },
    { id: 'recommendations', label: 'Рекомендации' },
];

// ============================================================================
// Component
// ============================================================================

export function FoodTrackerTabs({
    activeTab,
    onTabChange,
    className = '',
}: FoodTrackerTabsProps) {
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // Handle tab click
    const handleTabClick = useCallback(
        (tab: FoodTrackerTab) => {
            onTabChange(tab);
        },
        [onTabChange]
    );

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
            let newIndex: number | null = null;

            switch (event.key) {
                case 'ArrowLeft':
                    event.preventDefault();
                    newIndex = currentIndex === 0 ? TABS.length - 1 : currentIndex - 1;
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    newIndex = currentIndex === TABS.length - 1 ? 0 : currentIndex + 1;
                    break;
                case 'Home':
                    event.preventDefault();
                    newIndex = 0;
                    break;
                case 'End':
                    event.preventDefault();
                    newIndex = TABS.length - 1;
                    break;
                default:
                    return;
            }

            if (newIndex !== null) {
                const newTab = TABS[newIndex];
                onTabChange(newTab.id);
                tabRefs.current[newIndex]?.focus();
            }
        },
        [onTabChange]
    );

    return (
        <div className={`w-full ${className}`} role="tablist" aria-label="Разделы дневника питания">
            <div className="flex bg-gray-100 rounded-lg p-0.5 sm:p-1">
                {TABS.map((tab, index) => {
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            ref={(el) => {
                                tabRefs.current[index] = el;
                            }}
                            type="button"
                            role="tab"
                            id={`tab-${tab.id}`}
                            aria-selected={isActive}
                            aria-controls={`tabpanel-${tab.id}`}
                            tabIndex={isActive ? 0 : -1}
                            onClick={() => handleTabClick(tab.id)}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:py-2.5 sm:px-4 sm:text-sm touch-manipulation ${isActive
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default FoodTrackerTabs;
