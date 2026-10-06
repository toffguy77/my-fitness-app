'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Camera } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'

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
        <div className="flex flex-col items-center gap-3">
            {/* Avatar circle — как в шапке профиля: инициал на бренде. */}
            <div className="relative h-24 w-24 overflow-hidden rounded-full">
                {avatarUrl ? (
                    <Image
                        src={avatarUrl}
                        alt={userName || 'Avatar'}
                        width={96}
                        height={96}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-primary">
                        <span className="text-3xl font-semibold text-on-primary">
                            {initial}
                        </span>
                    </div>
                )}
            </div>

            {/* Helper text */}
            <p className="text-center type-caption text-fg-muted">
                Редактирование фото профиля
            </p>

            {/* Upload button — второстепенное действие: главное на экране одно. */}
            <Button
                type="button"
                variant="secondary"
                isLoading={busy}
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-xs"
            >
                {busy ? (
                    'Загрузка...'
                ) : (
                    <>
                        <Camera className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                        Сделать или выбрать фото
                    </>
                )}
            </Button>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
                aria-label="Выбрать фото"
            />

            {/* Remove link */}
            {avatarUrl && onRemove && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={handleRemove}
                    className="text-fg-muted hover:text-danger-fg"
                >
                    Удалить фото
                </Button>
            )}
        </div>
    )
}

PhotoUploader.displayName = 'PhotoUploader'
