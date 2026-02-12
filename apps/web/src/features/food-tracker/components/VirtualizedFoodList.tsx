'use client';

/**
 * VirtualizedFoodList Component
 *
 * A virtualized list component for displaying large food item lists.
 * Uses react-window for efficient rendering of lists with 50+ items.
 *
 * @module food-tracker/components/VirtualizedFoodList
 */

import { useCallback, memo } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import type { FoodItem } from '../types';

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

interface RowData {
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

const FoodRow = memo(function FoodRow({
    index,
    style,
    data,
}: ListChildComponentProps<RowData>) {
    const { foods, onSelect } = data;
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
    const servingInfo = `${food.servingSize} ${food.servingUnit}`;

    return (
        <div style={style}>
            <div
                role="option"
                tabIndex={0}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                className="flex items-center justify-between px-3 py-3 mx-1 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
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
            </div>
        </div>
    );
});

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
                className={`space-y-1 ${className}`}
                role="listbox"
                aria-label="Список продуктов"
            >
                {foods.map((food) => (
                    <FoodListItem key={food.id} food={food} onSelect={onSelect} />
                ))}
            </ul>
        );
    }

    // For large lists, use virtualization
    const itemData: RowData = { foods, onSelect };

    return (
        <div className={className} role="listbox" aria-label="Список продуктов">
            <List
                height={height}
                itemCount={foods.length}
                itemSize={rowHeight}
                itemData={itemData}
                width="100%"
            >
                {FoodRow}
            </List>
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

    const servingInfo = `${food.servingSize} ${food.servingUnit}`;

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

export default VirtualizedFoodList;
