/**
 * PhotoUploadSection Component
 *
 * Displays weekly photo upload functionality with:
 * - Upload button (prominent on Sat/Sun)
 * - Camera/file picker
 * - File validation (format and size)
 * - Upload date and thumbnail preview
 * - Warning if missing for report submission
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Memoized helper functions
 */

'use client'

import { useState, useRef, ChangeEvent, memo, useCallback, useMemo } from 'react'
import { Camera, Upload, CheckCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import { validatePhoto } from '../utils/validation'
import type { PhotoData } from '../types'
import { AttentionIcon } from './AttentionBadge'
import { t } from '@/shared/i18n'

/**
 * Props for PhotoUploadSection component
 */
export interface PhotoUploadSectionProps {
    weekStart: Date
    weekEnd: Date
    photoData?: PhotoData | null
    className?: string
}

/**
 * Helper: Get week identifier (YYYY-WNN format)
 */
function getWeekIdentifier(date: Date): string {
    const year = date.getFullYear()
    const firstDayOfYear = new Date(year, 0, 1)
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
    return `${year}-W${weekNumber.toString().padStart(2, '0')}`
}

/**
 * Helper: Check if date is weekend (Saturday or Sunday)
 */
function isWeekend(date: Date): boolean {
    const day = date.getDay()
    return day === 0 || day === 6 // Sunday or Saturday
}

/**
 * Helper: Format date for display
 */
function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(date)
}

/**
 * Helper: Check if date is today
 */
function isToday(date: Date): boolean {
    const today = new Date()
    return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
    )
}

/**
 * PhotoUploadSection Component
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
export const PhotoUploadSection = memo(function PhotoUploadSection({
    weekStart,
    // weekEnd is passed but not used - keeping for API compatibility
    photoData,
    className = '',
}: PhotoUploadSectionProps) {
    const { uploadPhoto, isLoading } = useDashboardStore()
    const [validationError, setValidationError] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(
        photoData?.photoUrl || null
    )
    const fileInputRef = useRef<HTMLInputElement>(null)

    const today = useMemo(() => new Date(), [])
    const isWeekendDay = useMemo(() => isWeekend(today), [today])
    const weekIdentifier = useMemo(() => getWeekIdentifier(weekStart), [weekStart])
    const isUploaded = !!photoData
    const isTodayFlag = useMemo(() => isToday(today), [today])

    // Show attention indicator on weekend if not uploaded (only for current day)
    const showAttentionIndicator = useMemo(() =>
        isTodayFlag && isWeekendDay && !isUploaded,
        [isTodayFlag, isWeekendDay, isUploaded]
    )

    /**
     * Handle file selection
     */
    const handleFileSelect = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        // Clear previous errors
        setValidationError(null)

        // Validate file
        const validation = validatePhoto(file)
        if (!validation.isValid) {
            setValidationError(validation.error || t('dashboard.photo.invalidFile'))
            return
        }

        // Create preview
        const reader = new FileReader()
        reader.onloadend = () => {
            setPreviewUrl(reader.result as string)
        }
        reader.readAsDataURL(file)

        // Upload file
        try {
            await uploadPhoto(weekIdentifier, file)
        } catch {
            // Error is handled by store (toast notification)
            setPreviewUrl(null)
        }
    }, [uploadPhoto, weekIdentifier])

    /**
     * Handle upload button click
     */
    const handleUploadClick = useCallback(() => {
        fileInputRef.current?.click()
    }, [])

    return (
        <section
            className={cn('photo-upload-section rounded-card border border-line bg-surface p-5 text-fg', className)}
            aria-labelledby="photo-upload-heading"
            aria-describedby={showAttentionIndicator ? "photo-upload-attention-indicator" : undefined}
        >
            <div className="mb-4 flex items-center justify-between gap-2">
                <h2
                    id="photo-upload-heading"
                    className="type-title-2 text-fg"
                >
                    {t('dashboard.photo.title')}
                </h2>
                {showAttentionIndicator && (
                    <AttentionIcon
                        urgency="high"
                        size="md"
                        pulse
                        ariaLabel={t('dashboard.photo.reminderAria')}
                        announceChanges={true}
                        indicatesId="photo-upload-content"
                    />
                )}
            </div>

            {/* Upload area */}
            <div className="space-y-4" id="photo-upload-content">
                {/* Preview or upload button */}
                {previewUrl ? (
                    <div className="space-y-3">
                        {/* Thumbnail preview - responsive aspect ratio */}
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-tile bg-subtle">
                            {/* eslint-disable-next-line @next/next/no-img-element -- локальный предпросмотр: data: URL из FileReader, оптимизатору next/image его не отдать */}
                            <img
                                src={previewUrl}
                                alt={t('dashboard.photo.alt')}
                                className="w-full h-full object-cover"
                            />
                            {isUploaded && (
                                <div className="absolute right-2 top-2 rounded-full bg-success p-1 text-on-primary">
                                    <CheckCircle className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                                    <span className="sr-only">{t('dashboard.photo.uploadedBadge')}</span>
                                </div>
                            )}
                        </div>

                        {/* Upload info */}
                        {photoData && (
                            <div className="text-sm text-fg-muted tabular-nums">
                                <p>
                                    {t('dashboard.photo.uploadedAt', { date: formatDate(new Date(photoData.uploadedAt)) })}
                                </p>
                            </div>
                        )}

                        {/* Re-upload button */}
                        <Button
                            type="button"
                            variant="secondary"
                            block
                            onClick={handleUploadClick}
                            disabled={isLoading}
                            aria-label={t('dashboard.photo.replaceAria')}
                        >
                            <Upload className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            <span>{t('dashboard.photo.replace')}</span>
                        </Button>
                    </div>
                ) : (
                    // Терракота на дашборде одна — у записи еды; фото — контуром.
                    <div className="flex flex-col items-center gap-3 py-2 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-subtle" aria-hidden="true">
                            <Camera className="h-6 w-6 text-fg-subtle" strokeWidth={1.8} />
                        </span>
                        <p className="text-sm text-fg-muted">{t('dashboard.photo.empty')}</p>
                        <Button
                            variant="secondary"
                            onClick={handleUploadClick}
                            disabled={isLoading}
                            aria-label={t('dashboard.photo.uploadAria')}
                        >
                            <Camera className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            {t('dashboard.photo.upload')}
                        </Button>
                    </div>
                )}

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileSelect}
                    className="sr-only"
                    aria-label={t('dashboard.photo.pickFileAria')}
                />

                {/* Validation error */}
                {validationError && (
                    <div
                        className="flex items-start gap-2 rounded-tile bg-danger-soft p-3"
                        role="alert"
                        aria-live="polite"
                    >
                        <AlertTriangle
                            className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger-fg"
                            strokeWidth={1.8}
                            aria-hidden="true"
                        />
                        <p className="text-sm text-danger-fg">{validationError}</p>
                    </div>
                )}

                {/* File requirements */}
                <div className="space-y-0.5 type-caption text-fg-subtle">
                    <p>{t('dashboard.photo.requirements')}</p>
                    <ul className="ml-2 list-inside list-disc space-y-0.5">
                        <li>{t('dashboard.photo.requirementFormat')}</li>
                        <li>{t('dashboard.photo.requirementSize')}</li>
                    </ul>
                </div>
            </div>
        </section>
    )
})
