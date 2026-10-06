'use client';

/**
 * VirtualizedFoodList Component
 *
 * A virtualized list component for displaying large food item lists.
 * Uses react-window for efficient rendering of lists with 50+ items.
 *
 * @module food-tracker/components/VirtualizedFoodList
 */

import { useCallback } from 'react';
import { List } from 'react-window';
import type { CSSProperties } from 'react';
import type { FoodItem } from '../types';
import { t } from '@/shared/i18n';

import { unitLabel } from '../utils/unitLabel'
// ============================================================================
// Types
// ============================================================================

export interface VirtualizedFoodListProps {
    /** Array of food items to display */
    foods: FoodItem[];
    /** Callback when a food item is selected */
    onSelect: (food: FoodItem) => void;
    /** Height of the list container */
    height?: number;
    /** Height of each row */
    rowHeight?: number;
    /** Additional CSS classes */
    className?: string;
}

interface RowProps {
    foods: FoodItem[];
    onSelect: (food: FoodItem) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HEIGHT = 400;
const DEFAULT_ROW_HEIGHT = 72;
const VIRTUALIZATION_THRESHOLD = 50;

// ============================================================================
// Row Component
// ============================================================================

function FoodRow({
    index,
    style,
    foods,
    onSelect,
}: RowProps & { index: number; style: CSSProperties }) {
    const food = foods[index];

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
    const servingInfo = `${food.servingSize} ${unitLabel(food.servingUnit)}`;

    return (
        <div style={style}>
            <div
                role="option"
                aria-selected={false}
                tabIndex={0}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                className="mx-1 flex cursor-pointer items-center justify-between rounded-tile px-3 py-2.5 transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                aria-label={t('foodTracker.search.itemAria', { name: food.name, serving: servingInfo, calories: Math.round(food.nutritionPer100.calories) })}
            >
                <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg">{food.name}</p>
                    <p className="type-caption text-fg-muted tabular-nums">{servingInfo}</p>
                </div>
                <div className="ml-4 text-right">
                    <p className="font-semibold text-fg tabular-nums">
                        {Math.round(food.nutritionPer100.calories)} {t('units.kcal')}
                    </p>
                    <p className="type-caption text-fg-muted">{t('foodTracker.search.per100')}</p>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Component
// ============================================================================

export function VirtualizedFoodList({
    foods,
    onSelect,
    height = DEFAULT_HEIGHT,
    rowHeight = DEFAULT_ROW_HEIGHT,
    className = '',
}: VirtualizedFoodListProps) {
    // For small lists, use regular rendering
    if (foods.length < VIRTUALIZATION_THRESHOLD) {
        return (
            <ul
                className={`divide-y divide-line ${className}`}
                role="listbox"
                aria-label={t('foodTracker.search.listAria')}
            >
                {foods.map((food) => (
                    <FoodListItem key={food.id} food={food} onSelect={onSelect} />
                ))}
            </ul>
        );
    }

    // For large lists, use virtualization
    return (
        <div className={className} role="listbox" aria-label={t('foodTracker.search.listAria')}>
            <List<RowProps>
                defaultHeight={height}
                rowComponent={FoodRow}
                rowCount={foods.length}
                rowHeight={rowHeight}
                rowProps={{ foods, onSelect }}
            />
        </div>
    );
}

// ============================================================================
// Non-virtualized Item (for small lists)
// ============================================================================

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

    const servingInfo = `${food.servingSize} ${unitLabel(food.servingUnit)}`;

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
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-fg">{food.name}</p>
                <p className="type-caption text-fg-muted tabular-nums">{servingInfo}</p>
            </div>
            <div className="ml-4 text-right">
                <p className="font-semibold text-fg tabular-nums">
                    {Math.round(food.nutritionPer100.calories)} {t('units.kcal')}
                </p>
                <p className="type-caption text-fg-muted">{t('foodTracker.search.per100')}</p>
            </div>
        </li>
    );
}

export default VirtualizedFoodList;
