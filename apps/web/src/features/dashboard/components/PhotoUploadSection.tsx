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
import { useDashboardStore } from '../store/dashboardStore'
import { validatePhoto } from '../utils/validation'
import type { PhotoData } from '../types'
import { AttentionIcon } from './AttentionBadge'

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
            setValidationError(validation.error || 'Неверный файл')
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
        } catch (error) {
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
            className={`photo-upload-section bg-white rounded-lg shadow-sm p-4 sm:p-5 md:p-6 ${className}`}
            aria-labelledby="photo-upload-heading"
            aria-describedby={showAttentionIndicator ? "photo-upload-attention-indicator" : undefined}
        >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2
                    id="photo-upload-heading"
                    className="text-base sm:text-lg font-semibold text-gray-900"
                >
                    Фото прогресса
                </h2>
                {showAttentionIndicator && (
                    <AttentionIcon
                        urgency="high"
                        size="md"
                        pulse
                        ariaLabel="Не забудьте загрузить фото прогресса на выходных"
                        announceChanges={true}
                        indicatesId="photo-upload-content"
                    />
                )}
            </div>

            {/* Upload area */}
            <div className="space-y-3 sm:space-y-4" id="photo-upload-content">
                {/* Preview or upload button */}
                {previewUrl ? (
                    <div className="space-y-3">
                        {/* Thumbnail preview - responsive aspect ratio */}
                        <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-gray-100">
                            <img
                                src={previewUrl}
                                alt="Фото прогресса за неделю"
                                className="w-full h-full object-cover"
                            />
                            {isUploaded && (
                                <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                                    <span className="sr-only">Загружено</span>
                                </div>
                            )}
                        </div>

                        {/* Upload info */}
                        {photoData && (
                            <div className="text-xs sm:text-sm text-gray-600">
                                <p>
                                    Загружено: {formatDate(new Date(photoData.uploadedAt))}
                                </p>
                            </div>
                        )}

                        {/* Re-upload button */}
                        <button
                            type="button"
                            onClick={handleUploadClick}
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 sm:px-4 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            aria-label="Загрузить другое фото"
                        >
                            <Upload className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                            <span>Загрузить другое фото</span>
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Upload button - prominent on weekend */}
                        <button
                            type="button"
                            onClick={handleUploadClick}
                            disabled={isLoading}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-3 sm:px-6 sm:py-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isWeekendDay
                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            aria-label="Загрузить фото прогресса"
                        >
                            <Camera className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
                            <span className="text-sm sm:text-base font-medium">
                                {isWeekendDay
                                    ? 'Загрузить фото прогресса'
                                    : 'Загрузить фото'}
                            </span>
                        </button>

                        {/* Weekend reminder */}
                        {isWeekendDay && (
                            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg" role="alert">
                                <AlertTriangle
                                    className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0 mt-0.5"
                                    aria-hidden="true"
                                />
                                <p className="text-xs sm:text-sm text-blue-800">
                                    Не забудьте загрузить фото прогресса для недельного отчета
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileSelect}
                    className="sr-only"
                    aria-label="Выбрать файл фото"
                />

                {/* Validation error */}
                {validationError && (
                    <div
                        className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg"
                        role="alert"
                        aria-live="polite"
                    >
                        <AlertTriangle
                            className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5"
                            aria-hidden="true"
                        />
                        <p className="text-xs sm:text-sm text-red-800">{validationError}</p>
                    </div>
                )}

                {/* File requirements */}
                <div className="text-xs text-gray-500 space-y-1">
                    <p>Требования к фото:</p>
                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                        <li>Формат: JPEG, PNG или WebP</li>
                        <li>Максимальный размер: 10 МБ</li>
                    </ul>
                </div>
            </div>
        </section>
    )
})
