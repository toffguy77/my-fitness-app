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
import { AlertTriangle, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { DatePicker } from './DatePicker';
import { FoodTrackerTabs } from './FoodTrackerTabs';
import { DietTab } from './DietTab';
import { RecommendationsTab } from './RecommendationsTab';
import { ConfigureNutrientsModal } from './ConfigureNutrientsModal';
import { AddCustomRecommendationForm } from './AddCustomRecommendationForm';
import { NutrientDetailPanel } from './NutrientDetailPanel';
import { useFoodTracker } from '../hooks/useFoodTracker';
import { useRecommendations } from '../hooks/useRecommendations';
import { formatLocalDate } from '@/shared/utils/format';
import type { CustomRecommendation, EntryMethodTab, FoodTrackerTab, NutrientRecommendation } from '../types';
import { t } from '@/shared/i18n';

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

/**
 * Способы записи, на которые можно привести ссылкой.
 *
 * Объявлены списком, а не приняты как есть: `?add=` приходит из адресной строки,
 * и подставлять оттуда произвольную строку во внутреннее состояние значит
 * доверять ей больше, чем следует.
 */
const LINKABLE_ENTRY_TABS: Record<string, EntryMethodTab> = {
    photo: 'photo',
    barcode: 'barcode',
    manual: 'manual',
    search: 'search',
};

export function FoodTrackerPage({ className = '' }: FoodTrackerPageProps) {
    const [activeTab, setActiveTab] = useState<FoodTrackerTab>('diet');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    // Пункт чек-листа «фото тарелки» ведёт сюда с ?add=photo: распознавание
    // живёт внутри окна записи, и без этого ссылка приводила бы на вкладку
    // рациона, откуда нужное искать три клика вглубь.
    const searchParams = useSearchParams();
    const openEntryOn = LINKABLE_ENTRY_TABS[searchParams?.get('add') ?? ''] ?? null;

    const {
        entries,
        dailyTotals,
        targetGoals,
        missingTargetInputs,
        isLoading,
        error,
        isOffline,
        fetchDayData,
        deleteEntry,
        clearError,
    } = useFoodTracker({ autoFetch: false });

    // Fetch data when date changes
    useEffect(() => {
        const dateString = formatLocalDate(selectedDate);
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

    // ------------------------------------------------------------------
    // Рекомендации
    //
    // Вкладка загружается только когда её открыли: до этого изменения она
    // монтировалась без единого пропса и не звала сервер вовсе.
    // ------------------------------------------------------------------
    const recommendations = useRecommendations({ enabled: activeTab === 'recommendations' });
    const [isConfigureOpen, setIsConfigureOpen] = useState(false);
    const [isAddCustomOpen, setIsAddCustomOpen] = useState(false);
    const [openNutrient, setOpenNutrient] = useState<NutrientRecommendation | null>(null);

    const handleSavePreferences = useCallback(
        (nutrientIds: string[]) => {
            void (async () => {
                // Экран закрывается только после успеха: закрыть раньше значило
                // бы показать выбор, которого на сервере нет.
                const saved = await recommendations.savePreferences(nutrientIds);
                if (saved) setIsConfigureOpen(false);
            })();
        },
        [recommendations]
    );

    const handleAddCustom = useCallback(
        (recommendation: Omit<CustomRecommendation, 'id' | 'currentIntake'>) => {
            void (async () => {
                const added = await recommendations.addCustomRecommendation(recommendation);
                if (added) setIsAddCustomOpen(false);
            })();
        },
        [recommendations]
    );

    // Потребление сервер считает за сегодня, а не за выбранный день. Для
    // другого дня мы не знаем, есть ли записи за сегодня, и не делаем вид, что
    // знаем.
    const today = formatLocalDate(new Date());
    const showsToday = formatLocalDate(selectedDate) === today;
    // entries разложены по приёмам пищи, а не списком.
    const hasEntries = Object.values(entries).some((meal) => meal.length > 0);

    return (
        <div className={`bg-canvas ${className}`}>
            {/* Offline indicator */}
            {isOffline && (
                <div
                    className="bg-warning-soft border-b border-warning/30 px-3 py-2 text-center sm:px-4"
                    role="alert"
                    aria-live="polite"
                >
                    <span className="text-xs text-warning-fg sm:text-sm">
                        {t('foodTracker.page.offlineBanner')}
                    </span>
                </div>
            )}

            {/* Main content - responsive container */}
            <div className="mx-auto max-w-content space-y-4 px-screen-x py-5 lg:max-w-4xl">
                <h1 className="type-title-1 text-fg">{t('foodTracker.page.heading')}</h1>

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
                            missingTargetInputs={missingTargetInputs}
                            isLoading={isLoading}
                            onDeleteEntry={deleteEntry}
                            openEntryOn={openEntryOn}
                        />
                    )}

                    {activeTab === 'recommendations' && (
                        <RecommendationsTab
                            recommendations={recommendations.trackedNutrients}
                            customRecommendations={recommendations.customRecommendations}
                            currentIntakes={recommendations.currentIntakes}
                            intakeCoverage={recommendations.intakeCoverage}
                            isLoading={recommendations.isLoading}
                            catalogueEmpty={recommendations.catalogueEmpty}
                            hasEntriesToday={showsToday ? hasEntries : undefined}
                            showsOtherDay={!showsToday}
                            error={recommendations.error}
                            onRetry={recommendations.reload}
                            onConfigureClick={() => setIsConfigureOpen(true)}
                            onAddRecommendationClick={() => setIsAddCustomOpen(true)}
                            onRecommendationClick={setOpenNutrient}
                        />
                    )}
                </div>

                {/* Error display - responsive positioning */}
                {error && (
                    <div
                        className="fixed bottom-20 left-3 right-3 max-w-sm mx-auto bg-surface border border-danger/30 rounded-tile p-3 shadow-overlay sm:bottom-20 sm:left-4 sm:right-4 sm:max-w-md sm:p-4 z-40"
                        role="alert"
                        aria-live="assertive"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start flex-1 min-w-0">
                                <AlertTriangle className="mr-2 h-4 w-4 flex-shrink-0 text-danger-fg" aria-hidden="true" />
                                <p className="text-sm text-danger-fg">{error.message}</p>
                            </div>
                            <button
                                type="button"
                                onClick={clearError}
                                className="-my-2.5 -mr-2.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-danger-fg transition-colors hover:bg-danger-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation"
                                aria-label={t('foodTracker.page.dismissError')}
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Настройка отслеживаемых нутриентов. Показываются все, выбранными —
                те, что пришли отслеживаемыми. */}
            <ConfigureNutrientsModal
                isOpen={isConfigureOpen}
                nutrients={recommendations.nutrients}
                selectedIds={recommendations.trackedIds}
                onClose={() => setIsConfigureOpen(false)}
                onSave={handleSavePreferences}
            />

            <AddCustomRecommendationForm
                isOpen={isAddCustomOpen}
                onClose={() => setIsAddCustomOpen(false)}
                onAdd={handleAddCustom}
            />

            {openNutrient && (
                <NutrientDetailPanel
                    nutrientId={openNutrient.id}
                    nutrientName={openNutrient.name}
                    onClose={() => setOpenNutrient(null)}
                />
            )}

            {/* Сохранение или добавление не удалось: прежнее состояние осталось видимым. */}
            {recommendations.actionError && (
                <div
                    className="fixed bottom-20 left-3 right-3 max-w-sm mx-auto bg-surface border border-danger/30 rounded-tile p-3 shadow-overlay sm:left-4 sm:right-4 sm:max-w-md sm:p-4 z-40"
                    role="alert"
                    aria-live="assertive"
                >
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-danger-fg">{recommendations.actionError}</p>
                        <button
                            type="button"
                            onClick={recommendations.clearActionError}
                            className="-my-2.5 -mr-2.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-danger-fg transition-colors hover:bg-danger-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation"
                            aria-label={t('foodTracker.page.dismissError')}
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FoodTrackerPage;
