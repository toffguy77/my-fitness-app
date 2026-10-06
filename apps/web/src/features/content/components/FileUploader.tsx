'use client'

import { useRef } from 'react'
import { FileUp } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { parseArticleMarkdown, type ParsedArticle } from '@/features/content/utils/parseFrontmatter'

// ============================================================================
// Types
// ============================================================================

interface FileUploaderProps {
    onFileLoaded: (parsed: ParsedArticle, filename: string) => void
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
            const parsed = parseArticleMarkdown(content)
            onFileLoaded(parsed, file.name)
        }
        reader.onerror = () => {
            console.error('Failed to read file:', reader.error)
        }
        reader.readAsText(file)

        // Reset so the same file can be selected again
        if (inputRef.current) {
            inputRef.current.value = ''
        }
    }

    return (
        <div className="flex items-center gap-2">
            <Button
                type="button"
                variant="secondary"
                onClick={() => inputRef.current?.click()}
            >
                <FileUp className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Импорт .md файла
            </Button>
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
