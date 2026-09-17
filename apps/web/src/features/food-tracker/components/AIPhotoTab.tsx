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
import type { FoodItem, KBZHU, RecognizedFood } from '../types';
import { EVENTS, track } from '@/shared/analytics';
import { t } from '@/shared/i18n';
import { calculateKBZHU, roundToOneDecimal } from '../utils/kbzhuCalculator';

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

/**
 * A recognized position whose weight a human must confirm before it can be
 * saved. The model's own estimate travels along as `estimatedWeight` — a
 * hint, never a value the field starts filled with (see design decision 7 in
 * openspec/changes/enable-food-recognition/design.md).
 */
interface WeighablePosition {
    name: string;
    estimatedWeight: number;
    nutritionPer100: KBZHU;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const LOW_CONFIDENCE_THRESHOLD = 0.5;

// ============================================================================
// Helpers
// ============================================================================

/**
 * The positions a person needs to confirm the weight of for one recognition
 * result. When the model broke the dish into a composition, each ingredient
 * is its own position; otherwise the dish itself is the only position.
 */
function getWeighablePositions(result: RecognitionResult): WeighablePosition[] {
    if (result.composition && result.composition.length > 0) {
        return result.composition.map((item) => ({
            name: item.name,
            estimatedWeight: item.estimatedWeight ?? item.estimated_weight ?? 0,
            nutritionPer100: item.nutrition,
        }));
    }
    return [
        {
            name: result.food.name,
            estimatedWeight: result.food.servingSize,
            nutritionPer100: result.food.nutritionPer100,
        },
    ];
}

/** A weight a human actually typed — not empty, not zero, not garbage. */
function parseEnteredWeight(raw: string | undefined): number | null {
    if (raw === undefined) return null;
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
}

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
    // Weight entered by the human, keyed by position index. Starts empty for
    // every position — the model's estimate is shown only as a hint.
    const [enteredWeights, setEnteredWeights] = useState<Record<number, string>>({});

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
            setError(t('foodTracker.photo.pickImage'));
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
        setEnteredWeights({});

        // Process with AI
        try {
            if (onRecognize) {
                const recognitionResults = await onRecognize(file);
                // Nothing about the photograph or the food is sent — only that
                // recognition was used and how it went.
                track(EVENTS.foodRecognition, { outcome: 'recognized' });
                setResults(recognitionResults);
                setStatus('results');
            } else {
                track(EVENTS.foodRecognition, { outcome: 'unavailable' });
                setError(t('foodTracker.photo.serviceUnavailable'));
                setStatus('error');
            }
        } catch {
            track(EVENTS.foodRecognition, { outcome: 'failed' });
            setError(t('foodTracker.photo.failed'));
            setStatus('error');
        }

        // Reset input
        e.target.value = '';
    }, [onRecognize]);

    // Record a human-entered weight for one position.
    const handleWeightChange = useCallback((index: number, value: string) => {
        setEnteredWeights((prev) => ({ ...prev, [index]: value }));
    }, []);

    // Accept the model's own estimate for one position, on demand — never
    // the default, only something a person opts into.
    const handleUseModelEstimate = useCallback((index: number, estimatedWeight: number) => {
        setEnteredWeights((prev) => ({ ...prev, [index]: String(Math.round(estimatedWeight)) }));
    }, []);

    // Confirm selection — add the single combined dish, with weight and
    // calories taken from what the human entered, not from the model.
    const handleConfirmSelection = useCallback(() => {
        if (results.length === 0) return;

        const combined = results[0];
        const positions = getWeighablePositions(combined);
        const weights = positions.map((_, idx) => parseEnteredWeight(enteredWeights[idx]));
        if (weights.some((weight) => weight === null)) return;

        const totals = positions.reduce(
            (acc, position, idx) => {
                const weight = weights[idx] as number;
                const scaled = calculateKBZHU(position.nutritionPer100, weight);
                return {
                    weight: acc.weight + weight,
                    calories: acc.calories + scaled.calories,
                    protein: acc.protein + scaled.protein,
                    fat: acc.fat + scaled.fat,
                    carbs: acc.carbs + scaled.carbs,
                };
            },
            { weight: 0, calories: 0, protein: 0, fat: 0, carbs: 0 }
        );

        const nutritionPer100: KBZHU = totals.weight > 0
            ? {
                calories: roundToOneDecimal((totals.calories / totals.weight) * 100),
                protein: roundToOneDecimal((totals.protein / totals.weight) * 100),
                fat: roundToOneDecimal((totals.fat / totals.weight) * 100),
                carbs: roundToOneDecimal((totals.carbs / totals.weight) * 100),
            }
            : combined.food.nutritionPer100;

        onSelectFoods([
            {
                ...combined.food,
                servingSize: totals.weight,
                nutritionPer100,
            },
        ]);
    }, [results, enteredWeights, onSelectFoods]);

    // Reset and try again
    const handleReset = useCallback(() => {
        setStatus('idle');
        setSelectedPhoto(null);
        setPhotoPreview(null);
        setResults([]);
        setError(null);
        setEnteredWeights({});
    }, []);

    // Handle manual search fallback
    const handleManualSearch = useCallback(() => {
        onManualSearch?.();
    }, [onManualSearch]);

    // Check if any results have low confidence
    const hasLowConfidenceResults = results.some(
        r => r.confidence < confidenceThreshold && r.confidence >= LOW_CONFIDENCE_THRESHOLD
    );

    // Positions whose weight the human must confirm before saving.
    const hasComposition = results.length > 0
        && !!results[0].composition && results[0].composition.length > 0;
    const positions = results.length > 0 ? getWeighablePositions(results[0]) : [];
    const allWeightsEntered = positions.length > 0
        && positions.every((_, idx) => parseEnteredWeight(enteredWeights[idx]) !== null);

    // Get confidence label
    const getConfidenceLabel = (confidence: number): string => {
        if (confidence >= 0.9) return t('foodTracker.photo.confidenceHigh');
        if (confidence >= 0.7) return t('foodTracker.photo.confidenceMedium');
        return t('foodTracker.photo.confidenceLow');
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
                        {t('foodTracker.photo.prompt')}
                    </p>
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={handleCameraCapture}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <Camera className="w-5 h-5" />
                            <span>{t('foodTracker.photo.camera')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleGallerySelect}
                            className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                        >
                            <Upload className="w-5 h-5" />
                            <span>{t('foodTracker.photo.gallery')}</span>
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
                                alt={t('foodTracker.photo.uploaded')}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-600">{t('foodTracker.photo.recognising')}</p>
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
                                alt={t('foodTracker.photo.uploaded')}
                                className="w-full h-full object-contain"
                            />
                            <button
                                type="button"
                                onClick={handleReset}
                                className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                aria-label={t('foodTracker.photo.retake')}
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
                                <p className="text-gray-500">{t('foodTracker.photo.nothingFound')}</p>
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
                                                {t('foodTracker.photo.per100Calories', { calories: Math.round(results[0].food.nutritionPer100.calories) })}
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

                                {/* Weight confirmation \u2014 the model names the product and gives
                                    per-100g values reliably; the weight it estimated is only a
                                    hint, and a human must type the real number before it can be
                                    saved (openspec design decision 7). */}
                                {positions.length > 0 && (
                                    <div className="mb-3">
                                        <h4 className="text-sm font-medium text-gray-500 mb-2">
                                            {hasComposition
                                                ? t('foodTracker.photo.composition')
                                                : t('foodTracker.photo.portionWeight')}
                                        </h4>
                                        <ul
                                            className="space-y-2"
                                            aria-label={
                                                hasComposition
                                                    ? t('foodTracker.photo.compositionAria')
                                                    : t('foodTracker.photo.portionWeightAria')
                                            }
                                        >
                                            {positions.map((position, idx) => (
                                                <li
                                                    key={idx}
                                                    className="p-2 bg-gray-50 rounded-lg text-sm"
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        {/* In the single-position case the dish name above
                                                            already names it — repeating it here would make
                                                            the text ambiguous to find, not just redundant. */}
                                                        {hasComposition && (
                                                            <span className="text-gray-700 font-medium">
                                                                {position.name}
                                                            </span>
                                                        )}
                                                        <span className="text-gray-400">
                                                            {t('foodTracker.photo.itemCalories', { calories: Math.round(position.nutritionPer100.calories) })}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <input
                                                            type="number"
                                                            inputMode="decimal"
                                                            min="0"
                                                            step="1"
                                                            value={enteredWeights[idx] ?? ''}
                                                            onChange={(e) => handleWeightChange(idx, e.target.value)}
                                                            placeholder={t('foodTracker.photo.weightPlaceholder')}
                                                            aria-label={t('foodTracker.photo.weightInputLabel', { name: position.name })}
                                                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        />
                                                        <span className="text-gray-500 text-xs">{t('units.gram')}</span>
                                                        <span className="text-gray-400 text-xs">
                                                            {t('foodTracker.photo.modelEstimate', { weight: Math.round(position.estimatedWeight) })}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUseModelEstimate(idx, position.estimatedWeight)}
                                                            className="text-xs text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline"
                                                        >
                                                            {t('foodTracker.photo.useModelEstimate')}
                                                        </button>
                                                    </div>
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
                                                    {t('foodTracker.photo.lowConfidence')}
                                                </p>
                                                {onManualSearch && (
                                                    <button
                                                        type="button"
                                                        onClick={handleManualSearch}
                                                        className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                                                    >
                                                        <Search className="w-4 h-4" />
                                                        <span>{t('foodTracker.photo.searchManually')}</span>
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
                        {results.length > 0 && !allWeightsEntered && (
                            <p className="text-xs text-gray-500 mb-2 text-center">
                                {t('foodTracker.photo.weightRequiredHint')}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={handleConfirmSelection}
                            disabled={results.length === 0 || !allWeightsEntered}
                            className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            {t('common.add')}
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
                                alt={t('foodTracker.photo.uploaded')}
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
                            {t('foodTracker.photo.tryAgain')}
                        </button>
                        {onManualSearch && (
                            <button
                                type="button"
                                onClick={handleManualSearch}
                                className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                            >
                                <Search className="w-5 h-5" />
                                <span>{t('foodTracker.photo.searchManually')}</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Hidden file inputs */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
                aria-label={t('foodTracker.photo.pickFromGallery')}
            />
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
                aria-label={t('foodTracker.photo.takePhoto')}
            />
        </div>
    );
}

export default AIPhotoTab;
