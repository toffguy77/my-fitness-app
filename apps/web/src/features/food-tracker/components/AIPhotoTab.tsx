'use client';

/**
 * AIPhotoTab Component
 *
 * AI-powered food recognition from photos.
 * Features camera/gallery selection, AI processing, and multi-item selection.
 *
 * @module food-tracker/components/AIPhotoTab
 */

import { useState, useCallback, useRef } from 'react';
import { Camera, Image, Upload, AlertCircle, X, Search } from 'lucide-react';
import type { FoodItem, RecognizedFood } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface AIPhotoTabProps {
    /** Callback when food items are selected */
    onSelectFoods: (foods: FoodItem[]) => void;
    /** Callback when manual search is requested */
    onManualSearch?: () => void;
    /** External AI recognition function */
    onRecognize?: (photo: File) => Promise<RecognitionResult[]>;
    /** Minimum confidence threshold (0-1) */
    confidenceThreshold?: number;
    /** Additional CSS classes */
    className?: string;
}

export interface RecognitionResult {
    food: FoodItem;
    confidence: number; // 0-1
    composition?: RecognizedFood[];
    boundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export type PhotoSource = 'camera' | 'gallery';
export type ProcessingStatus = 'idle' | 'selecting' | 'processing' | 'results' | 'error';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const LOW_CONFIDENCE_THRESHOLD = 0.5;

// ============================================================================
// Component
// ============================================================================

export function AIPhotoTab({
    onSelectFoods,
    onManualSearch,
    onRecognize,
    confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
    className = '',
}: AIPhotoTabProps) {
    const [status, setStatus] = useState<ProcessingStatus>('idle');
    const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [results, setResults] = useState<RecognitionResult[]>([]);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    // Handle photo selection from gallery
    const handleGallerySelect = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    // Handle photo capture from camera
    const handleCameraCapture = useCallback(() => {
        cameraInputRef.current?.click();
    }, []);

    // Handle file input change
    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setError('Выберите изображение');
            return;
        }

        // Create preview
        const reader = new FileReader();
        reader.onload = () => {
            setPhotoPreview(reader.result as string);
        };
        reader.readAsDataURL(file);

        setSelectedPhoto(file);
        setStatus('processing');
        setError(null);
        setResults([]);

        // Process with AI
        try {
            if (onRecognize) {
                const recognitionResults = await onRecognize(file);
                setResults(recognitionResults);
                setStatus('results');
            } else {
                // Mock response for demo
                setError('Сервис распознавания недоступен');
                setStatus('error');
            }
        } catch {
            setError('Ошибка при распознавании фото');
            setStatus('error');
        }

        // Reset input
        e.target.value = '';
    }, [onRecognize]);

    // Confirm selection — add the single combined dish
    const handleConfirmSelection = useCallback(() => {
        if (results.length > 0) {
            onSelectFoods([results[0].food]);
        }
    }, [results, onSelectFoods]);

    // Reset and try again
    const handleReset = useCallback(() => {
        setStatus('idle');
        setSelectedPhoto(null);
        setPhotoPreview(null);
        setResults([]);
        setError(null);
    }, []);

    // Handle manual search fallback
    const handleManualSearch = useCallback(() => {
        onManualSearch?.();
    }, [onManualSearch]);

    // Check if any results have low confidence
    const hasLowConfidenceResults = results.some(
        r => r.confidence < confidenceThreshold && r.confidence >= LOW_CONFIDENCE_THRESHOLD
    );

    // Get confidence label
    const getConfidenceLabel = (confidence: number): string => {
        if (confidence >= 0.9) return 'Высокая';
        if (confidence >= 0.7) return 'Средняя';
        return 'Низкая';
    };

    // Get confidence color
    const getConfidenceColor = (confidence: number): string => {
        if (confidence >= 0.9) return 'text-green-600';
        if (confidence >= 0.7) return 'text-yellow-600';
        return 'text-red-600';
    };

    return (
        <div className={`flex flex-col h-full ${className}`}>
            {/* Photo Selection */}
            {status === 'idle' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6">
                    <Image className="w-16 h-16 text-gray-400 mb-4" />
                    <p className="text-gray-600 text-center mb-6">
                        Сфотографируйте еду или выберите фото из галереи
                    </p>
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={handleCameraCapture}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <Camera className="w-5 h-5" />
                            <span>Камера</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleGallerySelect}
                            className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                        >
                            <Upload className="w-5 h-5" />
                            <span>Галерея</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Processing State */}
            {status === 'processing' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6">
                    {photoPreview && (
                        <div className="w-48 h-48 rounded-xl overflow-hidden mb-6">
                            <img
                                src={photoPreview}
                                alt="Загруженное фото"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-600">Распознаем продукты...</p>
                </div>
            )}

            {/* Results */}
            {status === 'results' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Photo preview */}
                    {photoPreview && (
                        <div className="relative h-40 bg-gray-100 mb-4">
                            <img
                                src={photoPreview}
                                alt="Загруженное фото"
                                className="w-full h-full object-contain"
                            />
                            <button
                                type="button"
                                onClick={handleReset}
                                className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                aria-label="Сделать новое фото"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Results */}
                    <div className="flex-1 overflow-y-auto px-4">
                        {results.length === 0 ? (
                            <div className="text-center py-8">
                                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-500">Продукты не распознаны</p>
                            </div>
                        ) : (
                            <div>
                                {/* Dish name and total info */}
                                <div className="p-3 bg-blue-50 border-2 border-blue-500 rounded-xl mb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 truncate">
                                                {results[0].food.name}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {Math.round(results[0].food.servingSize)} г
                                                {' \u2022 '}
                                                {Math.round(results[0].food.nutritionPer100.calories)} ккал на 100г
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-sm font-medium ${getConfidenceColor(results[0].confidence)}`}>
                                                {Math.round(results[0].confidence * 100)}%
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {getConfidenceLabel(results[0].confidence)}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Composition breakdown */}
                                {results[0].composition && results[0].composition.length > 0 && (
                                    <div className="mb-3">
                                        <h4 className="text-sm font-medium text-gray-500 mb-2">
                                            Состав
                                        </h4>
                                        <ul className="space-y-1" aria-label="Состав блюда">
                                            {results[0].composition.map((item, idx) => (
                                                <li
                                                    key={idx}
                                                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                                                >
                                                    <span className="text-gray-700">
                                                        {item.name} — {Math.round(item.estimatedWeight ?? item.estimated_weight ?? 0)} г
                                                    </span>
                                                    <span className="text-gray-400">
                                                        {Math.round(item.nutrition.calories)} ккал/100г
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Low confidence warning */}
                                {hasLowConfidenceResults && (
                                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-sm text-yellow-700">
                                                    Низкая уверенность в распознавании.
                                                    Проверьте результат или найдите вручную.
                                                </p>
                                                {onManualSearch && (
                                                    <button
                                                        type="button"
                                                        onClick={handleManualSearch}
                                                        className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                                                    >
                                                        <Search className="w-4 h-4" />
                                                        <span>Найти вручную</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Action button */}
                    <div className="p-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={handleConfirmSelection}
                            disabled={results.length === 0}
                            className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            Добавить
                        </button>
                    </div>
                </div>
            )}

            {/* Error State */}
            {status === 'error' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6">
                    {photoPreview && (
                        <div className="w-48 h-48 rounded-xl overflow-hidden mb-6 opacity-50">
                            <img
                                src={photoPreview}
                                alt="Загруженное фото"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}
                    <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
                    <p className="text-red-600 text-center mb-6">{error}</p>
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={handleReset}
                            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            Попробовать снова
                        </button>
                        {onManualSearch && (
                            <button
                                type="button"
                                onClick={handleManualSearch}
                                className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                            >
                                <Search className="w-5 h-5" />
                                <span>Найти вручную</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Hidden file inputs */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Выбрать фото из галереи"
            />
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Сделать фото"
            />
        </div>
    );
}

export default AIPhotoTab;
