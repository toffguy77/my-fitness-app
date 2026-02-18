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
    /** Popular/favorite foods to display */
    popularFoods?: FoodItem[];
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
    popularFoods = [],
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

        if (query.length < MIN_SEARCH_LENGTH) {
            setInternalResults([]);
            setHasSearched(false);
            return;
        }

        setIsSearching(true);

        debounceTimerRef.current = setTimeout(async () => {
            try {
                if (onSearch) {
                    const searchResultsFromApi = await onSearch(query);
                    setInternalResults(searchResultsFromApi);
                } else {
                    // Mock search for demo
                    setInternalResults([]);
                }
                setHasSearched(true);
            } catch {
                setInternalResults([]);
                setHasSearched(true);
            } finally {
                setIsSearching(false);
            }
        }, DEBOUNCE_DELAY);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [query, onSearch]);

    // Update hasSearched when external results change
    useEffect(() => {
        if (searchResults !== undefined && query.length >= MIN_SEARCH_LENGTH) {
            setHasSearched(true);
        }
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
    const showEmptyState = showResults && hasSearched && results.length === 0 && !isSearching;
    const showRecentAndPopular = !showResults && (recentFoods.length > 0 || popularFoods.length > 0);

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
                    placeholder="Поиск блюд и продуктов"
                    className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                    aria-label="Поиск блюд и продуктов"
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>

            {/* Search Results */}
            {showResults && !showEmptyState && (
                <div className="flex-1 overflow-y-auto">
                    <FoodList
                        foods={results}
                        onSelect={handleSelectFood}
                        emptyMessage=""
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
                    <p className="text-gray-500 mb-4">Ничего не найдено</p>
                    {onManualEntry && (
                        <button
                            type="button"
                            onClick={handleManualEntry}
                            className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Ввести вручную</span>
                        </button>
                    )}
                </div>
            )}

            {/* Recent and Popular Foods */}
            {showRecentAndPopular && (
                <div className="flex-1 overflow-y-auto space-y-6">
                    {recentFoods.length > 0 && (
                        <FoodSection
                            title="Недавние"
                            icon={<Clock className="w-4 h-4" />}
                            foods={recentFoods}
                            onSelect={handleSelectFood}
                        />
                    )}
                    {popularFoods.length > 0 && (
                        <FoodSection
                            title="Популярные"
                            icon={<Star className="w-4 h-4" />}
                            foods={popularFoods}
                            onSelect={handleSelectFood}
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
                            <span>Ввести вручную</span>
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

interface FoodSectionProps {
    title: string;
    icon: React.ReactNode;
    foods: FoodItem[];
    onSelect: (food: FoodItem) => void;
}

function FoodSection({ title, icon, foods, onSelect }: FoodSectionProps) {
    return (
        <section>
            <div className="flex items-center gap-2 mb-2 text-gray-500">
                {icon}
                <h3 className="text-sm font-medium">{title}</h3>
            </div>
            <FoodList foods={foods} onSelect={onSelect} />
        </section>
    );
}

interface FoodListProps {
    foods: FoodItem[];
    onSelect: (food: FoodItem) => void;
    emptyMessage?: string;
}

function FoodList({ foods, onSelect, emptyMessage }: FoodListProps) {
    if (foods.length === 0 && emptyMessage) {
        return <p className="text-gray-500 text-center py-4">{emptyMessage}</p>;
    }

    return (
        <ul className="space-y-1" role="listbox" aria-label="Список продуктов">
            {foods.map((food) => (
                <FoodListItem key={food.id} food={food} onSelect={onSelect} />
            ))}
        </ul>
    );
}

interface FoodListItemProps {
    food: FoodItem;
    onSelect: (food: FoodItem) => void;
}

function FoodListItem({ food, onSelect }: FoodListItemProps) {
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
        return `${food.servingSize} ${food.servingUnit}`;
    }, [food.servingSize, food.servingUnit]);

    return (
        <li
            role="option"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="flex items-center justify-between px-3 py-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            aria-label={`${food.name}, ${servingInfo}, ${Math.round(food.nutritionPer100.calories)} ккал`}
        >
            <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-medium truncate">{food.name}</p>
                <p className="text-sm text-gray-500">{servingInfo}</p>
            </div>
            <div className="ml-4 text-right">
                <p className="text-gray-900 font-medium">
                    {Math.round(food.nutritionPer100.calories)} ккал
                </p>
                <p className="text-xs text-gray-500">на 100г</p>
            </div>
        </li>
    );
}

export default SearchTab;
