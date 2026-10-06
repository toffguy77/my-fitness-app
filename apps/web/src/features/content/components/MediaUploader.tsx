'use client'

import { useRef, useState } from 'react'
import { Check, ImagePlus } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { getToken } from '@/shared/utils/token-storage'

// ============================================================================
// Types
// ============================================================================

interface MediaUploaderProps {
    articleId: string
    onUpload: (url: string) => void
}

// ============================================================================
// Component
// ============================================================================

export function MediaUploader({ articleId, onUpload }: MediaUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [filename, setFilename] = useState<string | null>(null)
    const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)

    async function handleUpload() {
        const file = inputRef.current?.files?.[0]
        if (!file) return

        setUploading(true)
        setError(null)
        setUploadedUrl(null)

        try {
            const formData = new FormData()
            formData.append('file', file)

            const token = getToken()
            const res = await fetch(
                `/api/v1/content/articles/${articleId}/media`,
                {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    body: formData,
                }
            )

            if (!res.ok) {
                throw new Error('Ошибка загрузки файла')
            }

            const data = await res.json()
            const url = data.data?.url ?? data.url
            setUploadedUrl(url)
            onUpload(url)
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Ошибка загрузки'
            )
        } finally {
            setUploading(false)
        }
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        setFilename(file?.name ?? null)
        setUploadedUrl(null)
        setError(null)
    }

    return (
        <div className="space-y-2">
            <p className="text-sm font-medium text-fg-muted">
                Загрузить изображение
            </p>
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => inputRef.current?.click()}
                >
                    <ImagePlus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Выбрать файл
                </Button>
                {filename && (
                    <span className="min-w-0 max-w-[12rem] truncate text-sm text-fg-muted">
                        {filename}
                    </span>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    onClick={handleUpload}
                    disabled={!filename || uploading}
                    aria-busy={uploading}
                >
                    {uploading ? 'Загрузка...' : 'Загрузить'}
                </Button>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden"
            />
            {error && (
                <p className="text-sm text-danger-fg" role="alert">{error}</p>
            )}
            {uploadedUrl && (
                <div className="flex items-start gap-2 rounded-tile bg-success-soft px-3 py-2 text-sm text-success-fg">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={2} aria-hidden="true" />
                    <span className="min-w-0">
                        URL: <code className="select-all break-all">{uploadedUrl}</code>
                    </span>
                </div>
            )}
        </div>
    )
}
