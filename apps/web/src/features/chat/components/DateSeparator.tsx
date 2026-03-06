'use client'

interface DateSeparatorProps {
    date: string
}

export function DateSeparator({ date }: DateSeparatorProps) {
    return (
        <div className="flex items-center gap-3 my-4 px-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 whitespace-nowrap">{date}</span>
            <div className="flex-1 h-px bg-gray-200" />
        </div>
    )
}
