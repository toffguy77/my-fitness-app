'use client';

/**
 * SearchTab Component
 *
 * Search interface for finding food items by name.
 * Features debounced search, recent foods, and manual entry option.
 *
 * @module food-tracker/components/SearchTab
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Search, Clock, Star, Plus, ChevronRight } from 'lucide-react';
import type { FoodItem, MealType } from '../types';
import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors';

import { unitLabel } from '../utils/unitLabel'
// ============================================================================
// Types
// ============================================================================

export interface SearchTabProps {
    /** Callback when a food item is selected */
    onSelectFood: (food: FoodItem) => void;
    /** Callback when manual entry is requested */
    onManualEntry?: () => void;
    /** Pre-selected meal type */
    mealType?: MealType;
    /** Recent foods to display when search is empty */
    recentFoods?: FoodItem[];
    /**
     * Избранные продукты.
     *
     * Пропс звался `popularFoods`, а получал избранное, и раздел был подписан
     * «Популярные» — при том, что список приходит из `/food-tracker/favorites`.
     * Имя и подпись врали в одну сторону, теперь оба говорят про избранное.
     */
    favoriteFoods?: FoodItem[];
    /** Идентификаторы избранных продуктов: по ним зажигается отметка. */
    favoriteIds?: Set<string>;
    /** Переключить избранное. Без него отметка не показывается вовсе. */
    onToggleFavorite?: (foodId: string) => void;
    /** Продукт, по которому отметка сейчас меняется. */
    pendingFavoriteId?: string | null;
    /** Сообщение, если отметку не удалось сохранить. */
    favoriteError?: string | null;
    /** External search function */
    onSearch?: (query: string) => Promise<FoodItem[]>;
    /** External search results (if provided, overrides internal results) */
    searchResults?: FoodItem[];
    /** Whether search is loading */
    isLoading?: boolean;
    /** Whether there are more results to load */
    hasMore?: boolean;
    /** Callback to load more results */
    onLoadMore?: () => void;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEBOUNCE_DELAY = 300; // ms
const MIN_SEARCH_LENGTH = 2;

// ============================================================================
// Component
// ============================================================================

export function SearchTab({
    onSelectFood,
    onManualEntry,
    recentFoods = [],
    favoriteFoods = [],
    favoriteIds,
    onToggleFavorite,
    pendingFavoriteId = null,
    favoriteError = null,
    onSearch,
    searchResults,
    isLoading = false,
    hasMore = false,
    onLoadMore,
    className = '',
}: SearchTabProps) {
    const [query, setQuery] = useState('');
    const [internalResults, setInternalResults] = useState<FoodItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    // Отдельно от пустого результата: «Ничего не найдено» — утверждение о базе
    // продуктов, и на упавшем запросе оно отправляет человека заводить руками
    // то, что в базе есть.
    const [searchError, setSearchError] = useState<string | null>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Use external results if provided, otherwise use internal
    const results = searchResults !== undefined ? searchResults : internalResults;

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Debounced search
    useEffect(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Every state change here happens on a timer or in its callback: the
        // short-query reset used to run in the effect body, rendering twice for
        // every keystroke below the minimum length.
        const resetTimer = setTimeout(() => {
            if (query.length < MIN_SEARCH_LENGTH) {
                setInternalResults([]);
                setHasSearched(false);
            } else {
                setIsSearching(true);
            }
        }, 0);

        if (query.length < MIN_SEARCH_LENGTH) {
            return () => clearTimeout(resetTimer);
        }

        debounceTimerRef.current = setTimeout(async () => {
            try {
                if (onSearch) {
                    const searchResultsFromApi = await onSearch(query);
                    setInternalResults(searchResultsFromApi);
                } else {
                    // Mock search for demo
                    setInternalResults([]);
                }
                setSearchError(null);
                setHasSearched(true);
            } catch (err) {
                setInternalResults([]);
                setHasSearched(true);
                setSearchError(messageForOr(err, t('foodTracker.search.failed')));
            } finally {
                setIsSearching(false);
            }
        }, DEBOUNCE_DELAY);

        return () => {
            clearTimeout(resetTimer);
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [query, onSearch]);

    // Results supplied from outside mean a search has happened. Deferred by a
    // tick for the same reason: it is a consequence of a render, not a
    // synchronous correction to one.
    useEffect(() => {
        if (searchResults === undefined || query.length < MIN_SEARCH_LENGTH) return;

        const timer = setTimeout(() => setHasSearched(true), 0);
        return () => clearTimeout(timer);
    }, [searchResults, query]);

    // Handle input change
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
    }, []);

    // Handle food selection
    const handleSelectFood = useCallback(
        (food: FoodItem) => {
            onSelectFood(food);
        },
        [onSelectFood]
    );

    // Handle manual entry click
    const handleManualEntry = useCallback(() => {
        onManualEntry?.();
    }, [onManualEntry]);

    // Infinite scroll: IntersectionObserver on sentinel
    useEffect(() => {
        if (!hasMore || !onLoadMore) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    onLoadMore();
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, onLoadMore]);

    // Determine what to show
    const showResults = query.length >= MIN_SEARCH_LENGTH;
    const showFailure = showResults && !!searchError && !isSearching;
    const showEmptyState = showResults && hasSearched && results.length === 0 && !isSearching && !showFailure;
    // Раздел избранного показывается и пустым: до этой правки он был пуст
    // всегда, и человеку не за что было зацепиться, чтобы это изменить.
    const canFavorite = !!onToggleFavorite;
    const showRecentAndPopular =
        !showResults && (recentFoods.length > 0 || favoriteFoods.length > 0 || canFavorite);

    // Loading state
    const loading = isLoading || isSearching;

    return (
        <div className={`flex flex-col h-full ${className}`}>
            {/* Search Input */}
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    placeholder={t('foodTracker.search.placeholder')}
                    className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                    aria-label={t('foodTracker.search.placeholder')}
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>

            {/* Отметку не удалось сохранить: прежнее состояние осталось видимым. */}
            {favoriteError && (
                <p className="mb-2 text-sm text-red-600" role="alert">
                    {favoriteError}
                </p>
            )}

            {/* Поиск не состоялся — это не то же самое, что «такого нет» */}
            {showFailure && (
                <div className="flex-1 flex flex-col items-center justify-center py-8">
                    <p className="text-sm text-red-500">{searchError}</p>
                </div>
            )}

            {/* Search Results */}
            {showResults && !showEmptyState && !showFailure && (
                <div className="flex-1 overflow-y-auto">
                    <FoodList
                        foods={results}
                        onSelect={handleSelectFood}
                        emptyMessage=""
                        favoriteIds={favoriteIds}
                        onToggleFavorite={onToggleFavorite}
                        pendingFavoriteId={pendingFavoriteId}
                    />
                    {/* Infinite scroll sentinel */}
                    {hasMore && (
                        <div ref={sentinelRef} className="flex justify-center py-4">
                            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                </div>
            )}

            {/* Empty State */}
            {showEmptyState && (
                <div className="flex-1 flex flex-col items-center justify-center py-8">
                    <p className="text-gray-500 mb-4">{t('foodTracker.search.nothingFound')}</p>
                    {onManualEntry && (
                        <button
                            type="button"
                            onClick={handleManualEntry}
                            className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <Plus className="w-4 h-4" />
                            <span>{t('foodTracker.entryModal.enterManually')}</span>
                        </button>
                    )}
                </div>
            )}

            {/* Recent and Popular Foods */}
            {showRecentAndPopular && (
                <div className="flex-1 overflow-y-auto space-y-6">
                    {recentFoods.length > 0 && (
                        <FoodSection
                            title={t('foodTracker.search.recent')}
                            icon={<Clock className="w-4 h-4" />}
                            foods={recentFoods}
                            onSelect={handleSelectFood}
                            favoriteIds={favoriteIds}
                            onToggleFavorite={onToggleFavorite}
                            pendingFavoriteId={pendingFavoriteId}
                        />
                    )}
                    {(favoriteFoods.length > 0 || canFavorite) && (
                        <FoodSection
                            title={t('foodTracker.search.popular')}
                            icon={<Star className="w-4 h-4" />}
                            foods={favoriteFoods}
                            onSelect={handleSelectFood}
                            favoriteIds={favoriteIds}
                            onToggleFavorite={onToggleFavorite}
                            pendingFavoriteId={pendingFavoriteId}
                            emptyMessage={t('foodTracker.search.noFavorites')}
                        />
                    )}
                </div>
            )}

            {/* Manual Entry Option (always visible at bottom) */}
            {onManualEntry && !showEmptyState && (
                <div className="pt-4 border-t border-gray-200 mt-auto">
                    <button
                        type="button"
                        onClick={handleManualEntry}
                        className="w-full flex items-center justify-between px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        <div className="flex items-center gap-3">
                            <Plus className="w-5 h-5 text-gray-400" />
                            <span>{t('foodTracker.entryModal.enterManually')}</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                    </button>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Sub-components
// ============================================================================

interface FavoriteControls {
    favoriteIds?: Set<string>;
    onToggleFavorite?: (foodId: string) => void;
    pendingFavoriteId?: string | null;
}

interface FoodSectionProps extends FavoriteControls {
    title: string;
    icon: React.ReactNode;
    foods: FoodItem[];
    onSelect: (food: FoodItem) => void;
    emptyMessage?: string;
}

function FoodSection({ title, icon, foods, onSelect, emptyMessage, ...favorites }: FoodSectionProps) {
    return (
        <section>
            <div className="flex items-center gap-2 mb-2 text-gray-500">
                {icon}
                <h3 className="text-sm font-medium">{title}</h3>
            </div>
            <FoodList foods={foods} onSelect={onSelect} emptyMessage={emptyMessage} {...favorites} />
        </section>
    );
}

interface FoodListProps extends FavoriteControls {
    foods: FoodItem[];
    onSelect: (food: FoodItem) => void;
    emptyMessage?: string;
}

function FoodList({ foods, onSelect, emptyMessage, ...favorites }: FoodListProps) {
    if (foods.length === 0 && emptyMessage) {
        return <p className="text-gray-500 text-center py-4">{emptyMessage}</p>;
    }

    return (
        <ul className="space-y-1" role="listbox" aria-label={t('foodTracker.search.listAria')}>
            {foods.map((food) => (
                <FoodListItem key={food.id} food={food} onSelect={onSelect} {...favorites} />
            ))}
        </ul>
    );
}

interface FoodListItemProps extends FavoriteControls {
    food: FoodItem;
    onSelect: (food: FoodItem) => void;
}

function FoodListItem({ food, onSelect, favoriteIds, onToggleFavorite, pendingFavoriteId }: FoodListItemProps) {
    const handleClick = useCallback(() => {
        onSelect(food);
    }, [food, onSelect]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(food);
            }
        },
        [food, onSelect]
    );

    // Format serving info
    const servingInfo = useMemo(() => {
        return `${food.servingSize} ${unitLabel(food.servingUnit)}`;
    }, [food.servingSize, food.servingUnit]);

    return (
        <li
            role="option"
            aria-selected={false}
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="flex items-center justify-between px-3 py-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            aria-label={t('foodTracker.search.itemAria', { name: food.name, serving: servingInfo, calories: Math.round(food.nutritionPer100.calories) })}
        >
            <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-medium truncate">{food.name}</p>
                <p className="text-sm text-gray-500">{servingInfo}</p>
            </div>
            <div className="ml-4 text-right">
                <p className="text-gray-900 font-medium">
                    {Math.round(food.nutritionPer100.calories)} {t('units.kcal')}
                </p>
                <p className="text-xs text-gray-500">{t('foodTracker.search.per100')}</p>
            </div>

            {/* Отметка избранного. Раньше её не было вовсе, и раздел избранного
                оставался пустым навсегда. */}
            {onToggleFavorite && (
                <button
                    type="button"
                    onClick={(event) => {
                        // Клик по звёздочке не должен открывать продукт.
                        event.stopPropagation();
                        onToggleFavorite(food.id);
                    }}
                    disabled={pendingFavoriteId === food.id}
                    className="ml-3 p-1.5 -m-1.5 text-gray-300 hover:text-yellow-500 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded touch-manipulation"
                    aria-pressed={favoriteIds?.has(food.id) ?? false}
                    aria-label={
                        favoriteIds?.has(food.id)
                            ? t('foodTracker.search.removeFavoriteAria', { name: food.name })
                            : t('foodTracker.search.addFavoriteAria', { name: food.name })
                    }
                >
                    <Star
                        className={`w-4 h-4 ${favoriteIds?.has(food.id) ? 'fill-yellow-400 text-yellow-500' : ''}`}
                        aria-hidden="true"
                    />
                </button>
            )}
        </li>
    );
}

export default SearchTab;
