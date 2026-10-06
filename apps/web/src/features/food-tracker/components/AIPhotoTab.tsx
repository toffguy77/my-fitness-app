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
import { Camera, Image as ImageIcon, Upload, AlertCircle, X, Search } from 'lucide-react';
import type { FoodItem, KBZHU, RecognizedFood } from '../types';
import { EVENTS, track } from '@/shared/analytics';
import { t } from '@/shared/i18n';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { MACRO_COLORS } from '@/shared/constants/macros';
import { messageFor, isApiError, isNetworkError } from '@/shared/errors/apiErrors';
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

// Five kilograms is well past any single portion — a bowl of soup, a whole
// watermelon — so this catches a typo (a stray zero, a stuck digit), never
// real food. It exists to stop a mistyped weight from silently wrecking a
// day's total, not to second-guess a plausible one.
const MAX_POSITION_WEIGHT_GRAMS = 5000;

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

/**
 * Validates a weight a human typed, one field at a time. An empty field
 * (or one with only whitespace) is not an error — it just has no value yet,
 * and is reported the same way whether it was never touched or cleared.
 * Anything actually typed that isn't a usable weight — not a number, zero
 * or negative, or past the sanity ceiling — gets a specific reason, so a
 * "0" or a stray extra digit doesn't look identical to an empty field.
 */
function validateEnteredWeight(raw: string | undefined): { value: number | null; error: string | null } {
    if (raw === undefined) return { value: null, error: null };
    const trimmed = raw.trim();
    if (trimmed === '') return { value: null, error: null };

    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
        return { value: null, error: t('foodTracker.photo.weightNotANumber') };
    }
    if (value <= 0) {
        return { value: null, error: t('foodTracker.photo.weightNotPositive') };
    }
    if (value > MAX_POSITION_WEIGHT_GRAMS) {
        return {
            value: null,
            error: t('foodTracker.photo.weightTooLarge', { max: MAX_POSITION_WEIGHT_GRAMS }),
        };
    }
    return { value, error: null };
}

/** A weight a human actually typed — not empty, not zero, not too large, not garbage. */
function parseEnteredWeight(raw: string | undefined): number | null {
    return validateEnteredWeight(raw).value;
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
        } catch (err) {
            track(EVENTS.foodRecognition, { outcome: 'failed' });
            // The server already tells a daily ceiling apart from "could not
            // parse this photo" apart from an outage, and messageFor knows how
            // to say each of those. foodTracker.photo.failed stays the fallback
            // for whatever isn't a recognised API/network failure — an
            // unexpected exception, not something the server explained.
            setError(
                isApiError(err) || isNetworkError(err)
                    ? messageFor(err)
                    : t('foodTracker.photo.failed')
            );
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

        // `weights` all passed the null check above, and getWeighablePositions
        // always returns at least one position, so totals.weight is always > 0
        // here — there is no zero-weight case left to branch on.
        const nutritionPer100: KBZHU = {
            calories: roundToOneDecimal((totals.calories / totals.weight) * 100),
            protein: roundToOneDecimal((totals.protein / totals.weight) * 100),
            fat: roundToOneDecimal((totals.fat / totals.weight) * 100),
            carbs: roundToOneDecimal((totals.carbs / totals.weight) * 100),
        };

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

    // Running total from whatever has been typed so far. Shown even before
    // every position is filled — a blank total looks broken; a partial one,
    // clearly marked as partial, lets a person see the number move as they
    // type and catch an implausible figure (85 g vs 250 g of popcorn) before
    // saving, not just guess at grams in isolation.
    const liveTotals = positions.reduce(
        (acc, position, idx) => {
            const weight = parseEnteredWeight(enteredWeights[idx]);
            if (weight === null) return acc;
            const scaled = calculateKBZHU(position.nutritionPer100, weight);
            return {
                calories: acc.calories + scaled.calories,
                protein: acc.protein + scaled.protein,
                fat: acc.fat + scaled.fat,
                carbs: acc.carbs + scaled.carbs,
            };
        },
        { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    // Get confidence label
    const getConfidenceLabel = (confidence: number): string => {
        if (confidence >= 0.9) return t('foodTracker.photo.confidenceHigh');
        if (confidence >= 0.7) return t('foodTracker.photo.confidenceMedium');
        return t('foodTracker.photo.confidenceLow');
    };

    // Get confidence color
    const getConfidenceColor = (confidence: number): string => {
        if (confidence >= 0.9) return 'text-success-fg';
        if (confidence >= 0.7) return 'text-warning-fg';
        return 'text-danger-fg';
    };

    return (
        <div className={`flex flex-col h-full ${className}`}>
            {/* Photo Selection */}
            {status === 'idle' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6">
                    <ImageIcon className="mb-4 h-14 w-14 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
                    <p className="mb-6 text-center text-fg-muted">
                        {t('foodTracker.photo.prompt')}
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <Button type="button" size="lg" onClick={handleCameraCapture}>
                            <Camera className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                            <span>{t('foodTracker.photo.camera')}</span>
                        </Button>
                        <Button type="button" variant="secondary" size="lg" onClick={handleGallerySelect}>
                            <Upload className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                            <span>{t('foodTracker.photo.gallery')}</span>
                        </Button>
                    </div>
                </div>
            )}

            {/* Processing State */}
            {status === 'processing' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6">
                    {photoPreview && (
                        <div className="mb-6 h-48 w-48 overflow-hidden rounded-tile">
                            {/* eslint-disable-next-line @next/next/no-img-element -- локальный предпросмотр: data: URL из FileReader, оптимизатору next/image его не отдать */}
                            <img
                                src={photoPreview}
                                alt={t('foodTracker.photo.uploaded')}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}
                    <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
                    <p className="text-fg-muted">{t('foodTracker.photo.recognising')}</p>
                </div>
            )}

            {/* Results */}
            {status === 'results' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Photo preview */}
                    {photoPreview && (
                        <div className="relative mb-4 h-40 overflow-hidden rounded-tile bg-black">
                            {/* eslint-disable-next-line @next/next/no-img-element -- локальный предпросмотр: data: URL из FileReader, оптимизатору next/image его не отдать */}
                            <img
                                src={photoPreview}
                                alt={t('foodTracker.photo.uploaded')}
                                className="w-full h-full object-contain"
                            />
                            <IconButton
                                variant="ghost"
                                onClick={handleReset}
                                className="absolute right-2 top-2 bg-black/50 text-white hover:bg-black/70"
                                aria-label={t('foodTracker.photo.retake')}
                            >
                                <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                            </IconButton>
                        </div>
                    )}

                    {/* Results */}
                    <div className="flex-1 overflow-y-auto">
                        {results.length === 0 ? (
                            <div className="text-center py-8">
                                <AlertCircle className="mx-auto mb-4 h-12 w-12 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
                                <p className="text-fg-muted">{t('foodTracker.photo.nothingFound')}</p>
                            </div>
                        ) : (
                            <div>
                                {/* Dish name and total info */}
                                <div className="mb-3 rounded-tile border border-line bg-surface p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="type-headline truncate text-fg">
                                                {results[0].food.name}
                                            </p>
                                            <p className="text-sm text-fg-muted tabular-nums">
                                                {t('foodTracker.photo.per100Calories', { calories: Math.round(results[0].food.nutritionPer100.calories) })}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-sm font-semibold tabular-nums ${getConfidenceColor(results[0].confidence)}`}>
                                                {Math.round(results[0].confidence * 100)}%
                                            </p>
                                            <p className="text-xs text-fg-subtle">
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
                                        <h4 className="type-overline mb-2 text-fg-subtle">
                                            {hasComposition
                                                ? t('foodTracker.photo.composition')
                                                : t('foodTracker.photo.portionWeight')}
                                        </h4>
                                        <ul
                                            className="divide-y divide-line rounded-tile border border-line"
                                            aria-label={
                                                hasComposition
                                                    ? t('foodTracker.photo.compositionAria')
                                                    : t('foodTracker.photo.portionWeightAria')
                                            }
                                        >
                                            {positions.map((position, idx) => {
                                                const weightValidation = validateEnteredWeight(enteredWeights[idx]);
                                                return (
                                                <li
                                                    key={idx}
                                                    className="px-3 py-3 text-sm"
                                                >
                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                        {/* In the single-position case the dish name above
                                                            already names it — repeating it here would make
                                                            the text ambiguous to find, not just redundant. */}
                                                        {hasComposition && (
                                                            <span className="text-fg font-medium">
                                                                {position.name}
                                                            </span>
                                                        )}
                                                        <span className="text-fg-muted tabular-nums">
                                                            {t('foodTracker.photo.itemCalories', { calories: Math.round(position.nutritionPer100.calories) })}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <input
                                                            type="number"
                                                            inputMode="decimal"
                                                            min="0"
                                                            max={MAX_POSITION_WEIGHT_GRAMS}
                                                            step="1"
                                                            value={enteredWeights[idx] ?? ''}
                                                            onChange={(e) => handleWeightChange(idx, e.target.value)}
                                                            placeholder={t('foodTracker.photo.weightPlaceholder')}
                                                            aria-label={t('foodTracker.photo.weightInputLabel', { name: position.name })}
                                                            aria-invalid={weightValidation.error !== null}
                                                            className="h-12 w-24 rounded-field border border-line bg-surface px-3 text-base text-fg tabular-nums placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30 aria-[invalid=true]:border-danger"
                                                        />
                                                        <span className="text-sm text-fg-muted">{t('units.gram')}</span>
                                                        <span className="type-caption text-fg-subtle tabular-nums">
                                                            {t('foodTracker.photo.modelEstimate', { weight: Math.round(position.estimatedWeight) })}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUseModelEstimate(idx, position.estimatedWeight)}
                                                            aria-label={t('foodTracker.photo.useModelEstimateAria', { name: position.name })}
                                                            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded"
                                                        >
                                                            {t('foodTracker.photo.useModelEstimate')}
                                                        </button>
                                                    </div>
                                                    {/* What's wrong with what was typed, not a repeat of the
                                                        generic "enter a weight" hint — a "0" or an extra digit
                                                        must not look the same as an untouched field. */}
                                                    {weightValidation.error && (
                                                        <p className="mt-1 text-sm text-danger-fg">
                                                            {weightValidation.error}
                                                        </p>
                                                    )}
                                                </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}

                                {/* Low confidence warning */}
                                {hasLowConfidenceResults && (
                                    <div className="mt-4 rounded-tile bg-warning-soft p-4">
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning-fg" strokeWidth={1.8} aria-hidden="true" />
                                            <div>
                                                <p className="text-sm text-warning-fg">
                                                    {t('foodTracker.photo.lowConfidence')}
                                                </p>
                                                {onManualSearch && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={handleManualSearch}
                                                        className="-ml-4 mt-1"
                                                    >
                                                        <Search className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                                                        <span>{t('foodTracker.photo.searchManually')}</span>
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Action button */}
                    <div className="mt-4 border-t border-line pt-4">
                        {positions.length > 0 && (
                            <div className="mb-3 rounded-tile bg-subtle p-3" aria-live="polite">
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                    <span className="text-sm font-semibold text-fg tabular-nums">
                                        {t('foodTracker.photo.liveTotalCalories', { calories: Math.round(liveTotals.calories) })}
                                    </span>
                                    <div className="flex gap-3 text-[13px] text-fg-muted tabular-nums">
                                        {([
                                            ['protein', t('macros.proteinShort')],
                                            ['fat', t('macros.fatShort')],
                                            ['carbs', t('macros.carbsShort')],
                                        ] as const).map(([key, label]) => (
                                            <span key={key} className="inline-flex items-center gap-1">
                                                <span
                                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                                    style={{ backgroundColor: MACRO_COLORS[key] }}
                                                    aria-hidden="true"
                                                />
                                                {label}: {Math.round(liveTotals[key])}{t('units.gram')}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                {!allWeightsEntered && (
                                    <p className="type-caption mt-1 text-info-fg">
                                        {t('foodTracker.photo.liveTotalPartial')}
                                    </p>
                                )}
                            </div>
                        )}
                        {results.length > 0 && !allWeightsEntered && (
                            <p className="type-caption mb-2 text-center text-fg-muted">
                                {t('foodTracker.photo.weightRequiredHint')}
                            </p>
                        )}
                        <Button
                            type="button"
                            size="lg"
                            block
                            onClick={handleConfirmSelection}
                            disabled={results.length === 0 || !allWeightsEntered}
                        >
                            {t('common.add')}
                        </Button>
                    </div>
                </div>
            )}

            {/* Error State */}
            {status === 'error' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6">
                    {photoPreview && (
                        <div className="mb-6 h-48 w-48 overflow-hidden rounded-tile opacity-50">
                            {/* eslint-disable-next-line @next/next/no-img-element -- локальный предпросмотр: data: URL из FileReader, оптимизатору next/image его не отдать */}
                            <img
                                src={photoPreview}
                                alt={t('foodTracker.photo.uploaded')}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}
                    <AlertCircle className="mb-4 h-14 w-14 text-danger-fg" strokeWidth={1.5} aria-hidden="true" />
                    <p className="mb-6 text-center text-danger-fg">{error}</p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <Button type="button" size="lg" onClick={handleReset}>
                            {t('foodTracker.photo.tryAgain')}
                        </Button>
                        {onManualSearch && (
                            <Button type="button" variant="secondary" size="lg" onClick={handleManualSearch}>
                                <Search className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                                <span>{t('foodTracker.photo.searchManually')}</span>
                            </Button>
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
