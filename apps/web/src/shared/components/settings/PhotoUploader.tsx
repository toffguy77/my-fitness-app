'use client'

import { useRef, useState } from 'react'
import { cn } from '@/shared/utils/cn'

export interface PhotoUploaderProps {
    avatarUrl?: string
    userName?: string
    onUpload: (file: File) => Promise<string>
    onRemove?: () => Promise<void>
    isLoading?: boolean
}

export function PhotoUploader({
    avatarUrl,
    userName,
    onUpload,
    onRemove,
    isLoading = false,
}: PhotoUploaderProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)

    const initial = userName?.charAt(0)?.toUpperCase() || '?'
    const busy = isLoading || uploading

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            setUploading(true)
            await onUpload(file)
        } finally {
            setUploading(false)
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    async function handleRemove() {
        if (!onRemove) return
        try {
            setUploading(true)
            await onRemove()
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="flex flex-col items-center gap-4">
            {/* Avatar circle */}
            <div className="relative h-32 w-32 overflow-hidden rounded-full">
                {avatarUrl ? (
                    <img
                        src={avatarUrl}
                        alt={userName || 'Avatar'}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-blue-100">
                        <span className="text-4xl font-semibold text-blue-600">
                            {initial}
                        </span>
                    </div>
                )}
            </div>

            {/* Helper text */}
            <p className="text-center text-sm text-gray-500">
                Редактирование фото профиля
            </p>

            {/* Upload button */}
            <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                    'mx-auto w-full max-w-xs rounded-xl bg-violet-500 px-6 py-3 text-center font-medium text-white transition-colors',
                    'hover:bg-violet-600',
                    'disabled:pointer-events-none disabled:opacity-50'
                )}
            >
                {busy ? (
                    <span className="inline-flex items-center gap-2">
                        <svg
                            className="h-4 w-4 animate-spin"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                            />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                        </svg>
                        Загрузка...
                    </span>
                ) : (
                    'Сделать или выбрать фото'
                )}
            </button>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                aria-label="Выбрать фото"
            />

            {/* Remove link */}
            {avatarUrl && onRemove && (
                <button
                    type="button"
                    disabled={busy}
                    onClick={handleRemove}
                    className="text-sm text-gray-500 underline transition-colors hover:text-gray-700 disabled:pointer-events-none disabled:opacity-50"
                >
                    Удалить фото
                </button>
            )}
        </div>
    )
}

PhotoUploader.displayName = 'PhotoUploader'
