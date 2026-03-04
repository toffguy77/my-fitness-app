'use client'

import { cn } from '@/shared/utils/cn'
import { CATEGORY_LABELS } from '@/features/content/types'
import type { ContentCategory } from '@/features/content/types'

export interface CategoryFilterProps {
    selected: string | null
    onSelect: (category: string | null) => void
}

const categories = Object.keys(CATEGORY_LABELS) as ContentCategory[]

export function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
    return (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
                type="button"
                onClick={() => onSelect(null)}
                className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    selected === null
                        ? 'bg-gray-900 text-white'
                        : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                )}
            >
                Все
            </button>
            {categories.map((cat) => (
                <button
                    key={cat}
                    type="button"
                    onClick={() => onSelect(cat)}
                    className={cn(
                        'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                        selected === cat
                            ? 'bg-gray-900 text-white'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                    )}
                >
                    {CATEGORY_LABELS[cat]}
                </button>
            ))}
        </div>
    )
}
