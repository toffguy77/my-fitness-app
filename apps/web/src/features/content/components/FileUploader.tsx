'use client'

import { useRef } from 'react'

// ============================================================================
// Types
// ============================================================================

interface FileUploaderProps {
    onFileLoaded: (content: string, filename: string) => void
}

// ============================================================================
// Component
// ============================================================================

export function FileUploader({ onFileLoaded }: FileUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null)

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = () => {
            const content = reader.result as string
            onFileLoaded(content, file.name)
        }
        reader.readAsText(file)

        // Reset so the same file can be selected again
        if (inputRef.current) {
            inputRef.current.value = ''
        }
    }

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
                Импорт .md файла
            </button>
            <input
                ref={inputRef}
                type="file"
                accept=".md,.markdown,text/markdown"
                onChange={handleChange}
                className="hidden"
            />
        </div>
    )
}
