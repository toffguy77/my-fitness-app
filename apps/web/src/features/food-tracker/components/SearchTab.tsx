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
import Link from 'next/link';
import { Search, Clock, Star, Plus, ChevronRight, BookOpen } from 'lucide-react';
import type { FoodItem, MealType } from '../types';
import { t } from '@/shared/i18n'
import { Button } from '@/shared/components/ui/Button';
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
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    placeholder={t('foodTracker.search.placeholder')}
                    className="h-12 w-full rounded-field border border-line bg-surface pl-11 pr-11 text-base text-fg placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                    aria-label={t('foodTracker.search.placeholder')}
                />
                {loading && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2" aria-hidden="true">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary" />
                    </div>
                )}
            </div>

            {/* Отметку не удалось сохранить: прежнее состояние осталось видимым. */}
            {favoriteError && (
                <p className="mb-2 text-sm text-danger-fg" role="alert">
                    {favoriteError}
                </p>
            )}

            {/* Поиск не состоялся — это не то же самое, что «такого нет» */}
            {showFailure && (
                <div className="flex-1 flex flex-col items-center justify-center py-8">
                    <p className="text-sm text-danger-fg">{searchError}</p>
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
                        <div ref={sentinelRef} className="flex justify-center py-4" aria-hidden="true">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary" />
                        </div>
                    )}
                </div>
            )}

            {/* Empty State */}
            {showEmptyState && (
                <div className="flex-1 flex flex-col items-center justify-center py-8">
                    <p className="mb-4 text-fg-muted">{t('foodTracker.search.nothingFound')}</p>
                    {onManualEntry && (
                        <Button type="button" variant="secondary" onClick={handleManualEntry}>
                            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            <span>{t('foodTracker.entryModal.enterManually')}</span>
                        </Button>
                    )}
                </div>
            )}

            {/* Recent and Popular Foods */}
            {showRecentAndPopular && (
                <div className="flex-1 overflow-y-auto space-y-6">
                    {recentFoods.length > 0 && (
                        <FoodSection
                            title={t('foodTracker.search.recent')}
                            icon={<Clock className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
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
                            icon={<Star className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
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
                <div className="mt-auto border-t border-line pt-3">
                    <button
                        type="button"
                        onClick={handleManualEntry}
                        className="flex min-h-14 w-full items-center justify-between rounded-tile px-3 text-fg transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        <div className="flex items-center gap-3">
                            <Plus className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                            <span>{t('foodTracker.entryModal.enterManually')}</span>
                        </div>
                        <ChevronRight className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
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
            <div className="mb-2 flex items-center gap-2 text-fg-subtle">
                {icon}
                <h3 className="type-overline">{title}</h3>
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
        return <p className="py-4 text-center text-sm text-fg-muted">{emptyMessage}</p>;
    }

    return (
        <ul className="divide-y divide-line" role="listbox" aria-label={t('foodTracker.search.listAria')}>
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
            className="flex min-h-14 cursor-pointer items-center justify-between rounded-tile px-3 py-2.5 transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
            aria-label={t('foodTracker.search.itemAria', { name: food.name, serving: servingInfo, calories: Math.round(food.nutritionPer100.calories) })}
        >
            <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-fg">{food.name}</p>
                <p className="flex items-center gap-2 type-caption text-fg-muted tabular-nums">
                    {/* Блюдо из каталога рецептов: пометка — чтобы его не путали
                        с продуктом, ссылка — к составу и фото. */}
                    {food.source === 'recipe' && (
                        <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">
                            {t('foodTracker.search.recipeBadge')}
                        </span>
                    )}
                    {servingInfo}
                </p>
            </div>
            {food.source === 'recipe' && food.recipeId && (
                <Link
                    href={`/menu/recipes/${food.recipeId}`}
                    // Переход к карточке не должен записывать блюдо.
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    className="ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-subtle hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    aria-label={t('foodTracker.search.openRecipeAria', { name: food.name })}
                >
                    <BookOpen className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </Link>
            )}
            <div className="ml-4 text-right">
                <p className="font-semibold text-fg tabular-nums">
                    {Math.round(food.nutritionPer100.calories)} {t('units.kcal')}
                </p>
                <p className="type-caption text-fg-muted">{t('foodTracker.search.per100')}</p>
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
                    className="-mr-2 ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-subtle hover:text-fg disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation"
                    aria-pressed={favoriteIds?.has(food.id) ?? false}
                    aria-label={
                        favoriteIds?.has(food.id)
                            ? t('foodTracker.search.removeFavoriteAria', { name: food.name })
                            : t('foodTracker.search.addFavoriteAria', { name: food.name })
                    }
                >
                    <Star
                        // Отмеченное — чернилами, как любой выбор в системе: `warning`
                        // занят оценкой «мимо нормы» и звезде не подходит.
                        className={`h-5 w-5 ${favoriteIds?.has(food.id) ? 'fill-current text-fg' : ''}`}
                        strokeWidth={1.8}
                        aria-hidden="true"
                    />
                </button>
            )}
        </li>
    );
}

export default SearchTab;
