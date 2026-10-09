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
        <div className="-mx-screen-x flex gap-2 overflow-x-auto px-screen-x pb-2 scrollbar-hide sm:mx-0 sm:px-0">
            <button
                type="button"
                onClick={() => onSelect(null)}
                aria-pressed={selected === null}
                className={cn(
                    'h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    selected === null
                        ? 'bg-fg text-fg-inverse'
                        : 'border border-line bg-surface text-fg-muted hover:bg-subtle'
                )}
            >
                Все
            </button>
            {categories.map((cat) => (
                <button
                    key={cat}
                    type="button"
                    onClick={() => onSelect(cat)}
                    aria-pressed={selected === cat}
                    className={cn(
                        'h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                        selected === cat
                            ? 'bg-fg text-fg-inverse'
                            : 'border border-line bg-surface text-fg-muted hover:bg-subtle'
                    )}
                >
                    {CATEGORY_LABELS[cat]}
                </button>
            ))}
        </div>
    )
}
