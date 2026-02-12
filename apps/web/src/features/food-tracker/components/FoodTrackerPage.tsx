'use client';

/**
 * FoodTrackerPage Component
 *
 * Main client component for the food tracker feature.
 * Integrates DatePicker, FoodTrackerTabs, and tab content.
 * Includes FooterNavigation for consistent app navigation.
 *
 * @module food-tracker/components/FoodTrackerPage
 */

import { useState, useCallback, useEffect } from 'react';
import { DatePicker } from './DatePicker';
import { FoodTrackerTabs } from './FoodTrackerTabs';
import { DietTab } from './DietTab';
import { RecommendationsTab } from './RecommendationsTab';
import { useFoodTracker } from '../hooks/useFoodTracker';
import { FooterNavigation } from '@/features/dashboard/components/FooterNavigation';
import type { FoodTrackerTab } from '../types';
import type { NavigationItemId } from '@/features/dashboard/types';

// ============================================================================
// Types
// ============================================================================

export interface FoodTrackerPageProps {
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function FoodTrackerPage({ className = '' }: FoodTrackerPageProps) {
    const [activeTab, setActiveTab] = useState<FoodTrackerTab>('diet');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    const {
        entries,
        dailyTotals,
        targetGoals,
        isLoading,
        error,
        isOffline,
        fetchDayData,
        addEntry,
        updateEntry,
        deleteEntry,
        clearError,
    } = useFoodTracker({ autoFetch: false });

    // Fetch data when date changes
    useEffect(() => {
        const dateString = selectedDate.toISOString().split('T')[0];
        fetchDayData(dateString);
    }, [selectedDate, fetchDayData]);

    // Handle date change
    const handleDateChange = useCallback((date: Date) => {
        setSelectedDate(date);
    }, []);

    // Handle tab change
    const handleTabChange = useCallback((tab: FoodTrackerTab) => {
        setActiveTab(tab);
    }, []);

    // Handle navigation (FooterNavigation handles routing internally)
    const handleNavigate = useCallback((_itemId: NavigationItemId) => {
        // Navigation is handled by FooterNavigation component
    }, []);

    return (
        <div className={`min-h-screen bg-gray-50 pb-20 ${className}`}>
            {/* Offline indicator */}
            {isOffline && (
                <div
                    className="bg-yellow-50 border-b border-yellow-200 px-3 py-2 text-center sm:px-4"
                    role="alert"
                    aria-live="polite"
                >
                    <span className="text-xs text-yellow-800 sm:text-sm">
                        📡 Нет подключения к интернету. Данные могут быть устаревшими.
                    </span>
                </div>
            )}

            {/* Main content - responsive container */}
            <div className="mx-auto px-3 py-3 space-y-3 sm:px-4 sm:py-4 sm:space-y-4 md:max-w-2xl lg:max-w-4xl xl:max-w-5xl">
                {/* Date Picker */}
                <DatePicker
                    selectedDate={selectedDate}
                    onDateChange={handleDateChange}
                    preventFutureDates={true}
                />

                {/* Tabs */}
                <FoodTrackerTabs
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                />

                {/* Tab Content */}
                <div
                    role="tabpanel"
                    id={`tabpanel-${activeTab}`}
                    aria-labelledby={`tab-${activeTab}`}
                    className="transition-opacity duration-200"
                >
                    {activeTab === 'diet' && (
                        <DietTab
                            entries={entries}
                            dailyTotals={dailyTotals}
                            targetGoals={targetGoals}
                            isLoading={isLoading}
                            onAddEntry={addEntry}
                            onUpdateEntry={updateEntry}
                            onDeleteEntry={deleteEntry}
                        />
                    )}

                    {activeTab === 'recommendations' && (
                        <RecommendationsTab date={selectedDate.toISOString().split('T')[0]} />
                    )}
                </div>

                {/* Error display - responsive positioning */}
                {error && (
                    <div
                        className="fixed bottom-20 left-3 right-3 max-w-sm mx-auto bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg sm:bottom-20 sm:left-4 sm:right-4 sm:max-w-md sm:p-4 z-40"
                        role="alert"
                        aria-live="assertive"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start flex-1 min-w-0">
                                <span className="text-red-500 mr-2 flex-shrink-0" aria-hidden="true">⚠️</span>
                                <p className="text-xs text-red-800 sm:text-sm">{error.message}</p>
                            </div>
                            <button
                                type="button"
                                onClick={clearError}
                                className="text-red-500 hover:text-red-700 p-1 -m-1 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
                                aria-label="Закрыть сообщение об ошибке"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Navigation */}
            <FooterNavigation
                activeItem="food-tracker"
                onNavigate={handleNavigate}
            />
        </div>
    );
}

export default FoodTrackerPage;
