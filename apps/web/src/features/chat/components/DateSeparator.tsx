'use client'

interface DateSeparatorProps {
    date: string
}

export function DateSeparator({ date }: DateSeparatorProps) {
    return (
        <div className="flex items-center gap-3 my-4 px-4">
            <div className="h-px flex-1 bg-line" />
            <span className="whitespace-nowrap text-xs font-medium text-fg-subtle tabular-nums">{date}</span>
            <div className="h-px flex-1 bg-line" />
        </div>
    )
}
