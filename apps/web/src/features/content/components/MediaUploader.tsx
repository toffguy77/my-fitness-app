'use client'

import { useRef, useState } from 'react'
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
            <label className="text-sm font-medium text-gray-700">
                Загрузить изображение
            </label>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                    Выбрать файл
                </button>
                {filename && (
                    <span className="truncate text-xs text-gray-500">
                        {filename}
                    </span>
                )}
                <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!filename || uploading}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                    {uploading ? 'Загрузка...' : 'Загрузить'}
                </button>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />
            {error && (
                <p className="text-xs text-red-600">{error}</p>
            )}
            {uploadedUrl && (
                <div className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
                    URL: <code className="select-all break-all">{uploadedUrl}</code>
                </div>
            )}
        </div>
    )
}
