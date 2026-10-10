'use client'

import { useId, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { IconButton } from '@/shared/components/ui/Button'
import { isApiError } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'
import { adminRecipesApi } from '../api/recipesApi'
import { RecipePhoto } from './RecipePhoto'

interface RecipePhotoFieldProps {
    url: string | null
    alt: string
    /** Загрузка — право команды; куратору фото показывается без кнопок. */
    canUpload: boolean
    onChange: (photo: { photo_key: string; photo_url: string } | null) => void
    className?: string
}

/** Фото блюда или шага: предпросмотр, загрузка в хранилище, удаление. */
export function RecipePhotoField({ url, alt, canUpload, onChange, className }: RecipePhotoFieldProps) {
    const inputId = useId()
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        setUploading(true)
        setError(null)
        try {
            const uploaded = await adminRecipesApi.uploadPhoto(file)
            onChange({ photo_key: uploaded.photo_key, photo_url: uploaded.photo_url })
        } catch (err) {
            setError(
                isApiError(err) && err.status === 415
                    ? t('recipes.editor.uploadWrongType')
                    : isApiError(err) && err.status === 503
                      ? t('recipes.editor.uploadDisabled')
                      : t('recipes.editor.uploadFailed')
            )
        } finally {
            setUploading(false)
        }
    }

    if (!url && !canUpload) return null

    return (
        <div className={cn('flex flex-col gap-2', className)}>
            {url && (
                <div className="relative">
                    <RecipePhoto url={url} alt={alt} className="aspect-[4/3] rounded-tile" />
                    {canUpload && (
                        <IconButton
                            aria-label={t('recipes.editor.removePhoto')}
                            variant="secondary"
                            onClick={() => onChange(null)}
                            className="absolute right-2 top-2 bg-surface"
                        >
                            <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                        </IconButton>
                    )}
                </div>
            )}
            {canUpload && (
                <label
                    htmlFor={inputId}
                    className={cn(
                        buttonBase,
                        buttonVariants.secondary,
                        buttonSizes.sm,
                        'cursor-pointer self-start',
                        uploading && 'pointer-events-none opacity-50'
                    )}
                >
                    <ImagePlus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    {uploading
                        ? t('recipes.editor.uploading')
                        : url
                          ? t('recipes.editor.replacePhoto')
                          : t('recipes.editor.uploadPhoto')}
                    <input
                        id={inputId}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        onChange={handleFile}
                        disabled={uploading}
                        data-testid="recipe-photo-input"
                    />
                </label>
            )}
            {error && (
                <p className="text-sm text-danger-fg" role="alert">
                    {error}
                </p>
            )}
        </div>
    )
}
