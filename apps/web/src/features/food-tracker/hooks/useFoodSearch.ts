/**
 * useFoodSearch Hook
 *
 * Custom hook for food search functionality with debouncing.
 * Handles search queries, results management, and recent foods loading.
 *
 * @module food-tracker/hooks/useFoodSearch
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import type { FoodItem, SearchFoodsResponse } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseFoodSearchState {
    /** Current search query */
    query: string;
    /** Search results */
    results: FoodItem[];
    /** Recent foods for the user */
    recentFoods: FoodItem[];
    /** Favorite foods for the user */
    favoriteFoods: FoodItem[];
    /** Loading state for search */
    isSearching: boolean;
    /** Loading state for recent foods */
    isLoadingRecent: boolean;
    /** Error message (in Russian) */
    error: string | null;
    /** Whether there are more results to load */
    hasMore: boolean;
    /** Total results count */
    totalResults: number;
}

export interface UseFoodSearchActions {
    /** Set search query (triggers debounced search) */
    setQuery: (query: string) => void;
    /** Clear search results and query */
    clearSearch: () => void;
    /** Load recent foods */
    loadRecentFoods: () => Promise<void>;
    /** Load favorite foods */
    loadFavoriteFoods: () => Promise<void>;
    /** Load more results (pagination) */
    loadMore: () => Promise<void>;
    /** Search immediately without debounce */
    searchNow: (query: string) => Promise<void>;
}

export interface UseFoodSearch extends UseFoodSearchState, UseFoodSearchActions { }

export interface UseFoodSearchOptions {
    /** Debounce delay in milliseconds (default: 300) */
    debounceMs?: number;
    /** Minimum query length to trigger search (default: 3) */
    minQueryLength?: number;
    /** Results per page (default: 20) */
    pageSize?: number;
    /** Whether to auto-load recent foods on mount */
    autoLoadRecent?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_MIN_QUERY_LENGTH = 3;
const DEFAULT_PAGE_SIZE = 20;

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for food search functionality
 *
 * @param options - Configuration options
 * @returns Food search state and actions
 *
 * @example
 * ```tsx
 * const { query, results, setQuery, isSearching } = useFoodSearch();
 *
 * // Search for foods
 * setQuery('яблоко');
 *
 * // Results will be populated after debounce
 * ```
 */
export function useFoodSearch(options: UseFoodSearchOptions = {}): UseFoodSearch {
    const {
        debounceMs = DEFAULT_DEBOUNCE_MS,
        minQueryLength = DEFAULT_MIN_QUERY_LENGTH,
        pageSize = DEFAULT_PAGE_SIZE,
        autoLoadRecent = true,
    } = options;

    // State
    const [query, setQueryState] = useState('');
    const [results, setResults] = useState<FoodItem[]>([]);
    const [recentFoods, setRecentFoods] = useState<FoodItem[]>([]);
    const [favoriteFoods, setFavoriteFoods] = useState<FoodItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingRecent, setIsLoadingRecent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [totalResults, setTotalResults] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);

    // Refs
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    // Auto-load recent foods on mount
    useEffect(() => {
        if (autoLoadRecent) {
            loadRecentFoods();
        }
    }, [autoLoadRecent]);

    // Perform search
    const performSearch = useCallback(
        async (searchQuery: string, page: number = 0) => {
            // Cancel previous request
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }

            // Create new abort controller
            abortControllerRef.current = new AbortController();

            setIsSearching(true);
            setError(null);

            try {
                const offset = page * pageSize;
                const url = getApiUrl(
                    `/food-tracker/search?q=${encodeURIComponent(searchQuery)}&limit=${pageSize}&offset=${offset}`
                );

                const response = await apiClient.get<SearchFoodsResponse>(url, {
                    signal: abortControllerRef.current.signal,
                });

                if (page === 0) {
                    setResults(response.items);
                } else {
                    setResults((prev) => [...prev, ...response.items]);
                }

                setTotalResults(response.total);
                setHasMore(offset + response.items.length < response.total);
                setCurrentPage(page);
            } catch (err: any) {
                // Ignore abort errors
                if (err.name === 'AbortError') {
                    return;
                }

                setError('Ошибка при поиске продуктов');
                setResults([]);
                setTotalResults(0);
                setHasMore(false);
            } finally {
                setIsSearching(false);
            }
        },
        [pageSize]
    );

    // Set query with debounce
    const setQuery = useCallback(
        (newQuery: string) => {
            setQueryState(newQuery);

            // Clear previous timer
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            // Clear results if query is too short
            if (newQuery.length < minQueryLength) {
                setResults([]);
                setTotalResults(0);
                setHasMore(false);
                setError(null);
                return;
            }

            // Set debounce timer
            debounceTimerRef.current = setTimeout(() => {
                performSearch(newQuery, 0);
            }, debounceMs);
        },
        [debounceMs, minQueryLength, performSearch]
    );

    // Search immediately without debounce
    const searchNow = useCallback(
        async (searchQuery: string) => {
            // Clear debounce timer
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            setQueryState(searchQuery);

            if (searchQuery.length < minQueryLength) {
                setResults([]);
                setTotalResults(0);
                setHasMore(false);
                return;
            }

            await performSearch(searchQuery, 0);
        },
        [minQueryLength, performSearch]
    );

    // Clear search
    const clearSearch = useCallback(() => {
        // Clear debounce timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Cancel ongoing request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        setQueryState('');
        setResults([]);
        setTotalResults(0);
        setHasMore(false);
        setError(null);
        setCurrentPage(0);
    }, []);

    // Load recent foods
    const loadRecentFoods = useCallback(async () => {
        setIsLoadingRecent(true);

        try {
            const url = getApiUrl('/food-tracker/recent');
            const response = await apiClient.get<{ items: FoodItem[] }>(url);
            setRecentFoods(response.items);
        } catch {
            // Silently fail - recent foods are not critical
            setRecentFoods([]);
        } finally {
            setIsLoadingRecent(false);
        }
    }, []);

    // Load favorite foods
    const loadFavoriteFoods = useCallback(async () => {
        try {
            const url = getApiUrl('/food-tracker/favorites');
            const response = await apiClient.get<{ items: FoodItem[] }>(url);
            setFavoriteFoods(response.items);
        } catch {
            // Silently fail - favorites are not critical
            setFavoriteFoods([]);
        }
    }, []);

    // Load more results
    const loadMore = useCallback(async () => {
        if (!hasMore || isSearching || query.length < minQueryLength) {
            return;
        }

        await performSearch(query, currentPage + 1);
    }, [hasMore, isSearching, query, minQueryLength, performSearch, currentPage]);

    return {
        // State
        query,
        results,
        recentFoods,
        favoriteFoods,
        isSearching,
        isLoadingRecent,
        error,
        hasMore,
        totalResults,
        // Actions
        setQuery,
        clearSearch,
        loadRecentFoods,
        loadFavoriteFoods,
        loadMore,
        searchNow,
    };
}

export default useFoodSearch;
