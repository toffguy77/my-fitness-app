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
import { t } from '@/shared/i18n';

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
    { id: 'diet', label: t('foodTracker.tabs2.diet') },
    { id: 'recommendations', label: t('foodTracker.tabs2.recommendations') },
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
        <div className={`w-full ${className}`} role="tablist" aria-label={t('foodTracker.tabs2.aria')}>
            <div className="flex gap-6 border-b border-line">
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
                            // Вкладки — подчёркиванием, как оглавление: на экране
                            // уже есть заливки карточек, и ещё одна «таблетка»
                            // спорила бы с ними за внимание.
                            className={`-mb-px h-11 border-b-2 text-base transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation ${isActive
                                ? 'border-line-strong font-semibold text-fg'
                                : 'border-transparent font-medium text-fg-subtle hover:text-fg'
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
