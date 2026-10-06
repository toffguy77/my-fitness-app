'use client';

/**
 * BarcodeTab Component
 *
 * Barcode scanning interface with three input methods:
 * 1. Live camera scanning via html5-qrcode
 * 2. Photo from gallery (scan barcode from image)
 * 3. Manual barcode text input
 *
 * @module food-tracker/components/BarcodeTab
 */

import { useCallback, useEffect, useRef } from 'react';
import { Camera, CameraOff, RefreshCw, AlertCircle, CheckCircle, Plus, Upload, Image as ImageIcon } from 'lucide-react';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useLogger } from '@/shared/hooks/useLogger';
import type { FoodItem } from '../types';
import { t } from '@/shared/i18n';
import { Button, IconButton } from '@/shared/components/ui/Button';

// ============================================================================
// Types
// ============================================================================

export interface BarcodeTabProps {
    /** Callback when a food item is found and selected */
    onSelectFood: (food: FoodItem) => void;
    /** Callback when manual entry is requested */
    onManualEntry?: () => void;
    /** External barcode lookup function (unused, kept for interface compat) */
    onLookupBarcode?: (barcode: string) => Promise<FoodItem | null>;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const BARCODE_READER_ELEMENT_ID = 'barcode-reader';

// ============================================================================
// Component
// ============================================================================

export function BarcodeTab({
    onSelectFood,
    onManualEntry,
    className = '',
}: BarcodeTabProps) {
    const {
        scannerStatus,
        scannedBarcode,
        scannedProduct,
        isLookingUp,
        lookupError,
        startScanning,
        stopScanning,
        scanFromFile,
        lookupBarcode,
        resetScan,
    } = useBarcodeScanner();

    const { info: log } = useLogger({ component: 'BarcodeTab' });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    // Cleanup on unmount
    useEffect(() => {
        log('mounted');
        return () => {
            log('unmounting, stopping scanner');
            stopScanning();
        };
    }, [stopScanning, log]);

    // Handle start live camera
    const handleStartCamera = useCallback(() => {
        log('handleStartCamera: starting live camera scan');
        startScanning(BARCODE_READER_ELEMENT_ID);
    }, [startScanning, log]);

    // Handle stop camera
    const handleStopCamera = useCallback(() => {
        log('handleStopCamera');
        stopScanning();
    }, [stopScanning, log]);

    // Handle gallery photo selection (scan barcode from image)
    const handleGallerySelect = useCallback(() => {
        log('handleGallerySelect: opening file picker');
        fileInputRef.current?.click();
    }, [log]);

    // Handle native camera capture (take photo of barcode)
    const handleCameraCapture = useCallback(() => {
        log('handleCameraCapture: opening native camera');
        cameraInputRef.current?.click();
    }, [log]);

    // Handle file input change (gallery or native camera photo)
    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            log('handleFileChange: no file selected');
            return;
        }
        log('handleFileChange: file selected', { fileName: file.name, fileSize: file.size, fileType: file.type });

        if (!file.type.startsWith('image/')) {
            log('handleFileChange: not an image, ignoring');
            return;
        }

        await scanFromFile(file, BARCODE_READER_ELEMENT_ID);

        // Reset input so the same file can be re-selected
        e.target.value = '';
    }, [scanFromFile, log]);

    // Handle manual barcode input
    const handleManualBarcodeInput = useCallback((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const barcode = formData.get('barcode') as string;
        log('handleManualBarcodeInput', { barcode });
        if (barcode && barcode.length >= 8) {
            lookupBarcode(barcode);
        } else {
            log('handleManualBarcodeInput: barcode too short, need >= 8 digits');
        }
    }, [lookupBarcode, log]);

    // Handle product selection
    const handleSelectProduct = useCallback(() => {
        if (scannedProduct) {
            log('handleSelectProduct', { product: scannedProduct.name });
            onSelectFood(scannedProduct);
        }
    }, [scannedProduct, onSelectFood, log]);

    // Handle reset scan
    const handleResetScan = useCallback(() => {
        log('handleResetScan');
        resetScan();
    }, [resetScan, log]);

    // Handle manual entry
    const handleManualEntry = useCallback(() => {
        log('handleManualEntry');
        onManualEntry?.();
    }, [onManualEntry, log]);

    return (
        <div className={`flex flex-col h-full ${className}`}>
            {/* Camera / Scanner Area — min-h ensures the container never
                collapses even when all children are absolutely positioned. */}
            <div className="relative mb-4 min-h-[280px] flex-1 overflow-hidden rounded-card bg-black">
                {/* Persistent scanner div — always in DOM, absolute so it
                    doesn't affect layout. html5-qrcode needs real dimensions
                    when scanner.start() is called (during 'starting' state). */}
                <div id={BARCODE_READER_ELEMENT_ID} className="absolute inset-0" />

                {/* Stop camera button */}
                {scannerStatus === 'scanning' && (
                    <IconButton
                        variant="ghost"
                        onClick={handleStopCamera}
                        className="absolute right-2 top-2 z-20 bg-black/50 text-white hover:bg-black/70"
                        aria-label={t('foodTracker.barcode.stopCamera')}
                    >
                        <CameraOff className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                )}

                {/* Opaque overlay for non-scanning states */}
                {scannerStatus !== 'scanning' && (
                    <div className="absolute inset-0 z-10 bg-black flex flex-col items-center justify-center p-6 text-center">
                        {scannerStatus === 'idle' && (
                            <>
                                <Camera className="mb-4 h-14 w-14 text-white/70" strokeWidth={1.5} aria-hidden="true" />
                                <p className="text-white/80 mb-6">
                                    {t('foodTracker.barcode.prompt')}
                                </p>
                                <div className="flex flex-col gap-3 w-full max-w-xs">
                                    {/* Live camera scan */}
                                    {/* Светлая кнопка на тёмном видоискателе: терракота
                                        остаётся главному действию шторки — «Добавить». */}
                                    <Button
                                        type="button"
                                        variant="inverse"
                                        size="lg"
                                        onClick={handleStartCamera}
                                    >
                                        <Camera className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                                        <span>{t('foodTracker.barcode.scanWithCamera')}</span>
                                    </Button>
                                    <div className="flex gap-3">
                                        {/* Native camera capture (take photo) */}
                                        <button
                                            type="button"
                                            onClick={handleCameraCapture}
                                            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white/15 px-4 font-semibold text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                        >
                                            <ImageIcon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                                            <span>{t('foodTracker.barcode.photo')}</span>
                                        </button>
                                        {/* Gallery selection */}
                                        <button
                                            type="button"
                                            onClick={handleGallerySelect}
                                            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white/15 px-4 font-semibold text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                        >
                                            <Upload className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                                            <span>{t('foodTracker.barcode.gallery')}</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {scannerStatus === 'starting' && (
                            <>
                                <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden="true" />
                                <p className="text-white/80">
                                    {t('foodTracker.barcode.starting')}
                                </p>
                            </>
                        )}

                        {scannerStatus === 'error' && (
                            <>
                                <AlertCircle className="mb-4 h-14 w-14 text-danger" strokeWidth={1.5} aria-hidden="true" />
                                <p className="mb-4 text-white/90">
                                    {lookupError || t('foodTracker.barcode.cameraFailed')}
                                </p>
                                <div className="flex flex-col gap-3 w-full max-w-xs">
                                    <Button
                                        type="button"
                                        variant="inverse"
                                        size="lg"
                                        onClick={handleStartCamera}
                                    >
                                        <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                                        <span>{t('foodTracker.barcode.tryAgain')}</span>
                                    </Button>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={handleCameraCapture}
                                            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white/15 px-4 font-semibold text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                        >
                                            <ImageIcon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                                            <span>{t('foodTracker.barcode.photo')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleGallerySelect}
                                            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white/15 px-4 font-semibold text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                        >
                                            <Upload className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                                            <span>{t('foodTracker.barcode.gallery')}</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Manual Barcode Input */}
            <form onSubmit={handleManualBarcodeInput} className="mb-4">
                <div className="flex gap-2">
                    <input
                        type="text"
                        name="barcode"
                        placeholder={t('foodTracker.barcode.manualPlaceholder')}
                        inputMode="numeric"
                        className="h-12 min-w-0 flex-1 rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                        aria-label={t('foodTracker.barcode.label')}
                        pattern="[0-9]{8,14}"
                        title={t('foodTracker.barcode.lengthHint')}
                    />
                    <Button
                        type="submit"
                        variant="secondary"
                        size="lg"
                        aria-label={t('foodTracker.barcode.findAria')}
                    >
                        {t('foodTracker.barcode.find')}
                    </Button>
                </div>
            </form>

            {/* Lookup Status */}
            {isLookingUp && (
                <div className="mb-4 flex items-center justify-center gap-3 rounded-tile bg-subtle p-4">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
                    <span className="text-fg-muted">{t('foodTracker.barcode.looking', { suffix: scannedBarcode ? ` (${scannedBarcode})` : '' })}</span>
                </div>
            )}

            {/* Scanned Product */}
            {scannedProduct && (
                <div className="mb-4 rounded-tile border border-line bg-surface p-4">
                    <div className="flex items-start gap-3">
                        <CheckCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-success-fg" strokeWidth={1.8} aria-hidden="true" />
                        <div className="flex-1">
                            <h3 className="type-headline text-fg">{scannedProduct.name}</h3>
                            {scannedProduct.brand && (
                                <p className="text-sm text-fg-muted">{scannedProduct.brand}</p>
                            )}
                            {scannedBarcode && (
                                <p className="type-caption mt-1 text-fg-subtle tabular-nums">{t('foodTracker.barcode.withValue', { code: scannedBarcode })}</p>
                            )}
                            <div className="mt-2 text-sm text-fg-muted tabular-nums">
                                <p>{t('foodTracker.barcode.per100')}</p>
                                <p>
                                    {Math.round(scannedProduct.nutritionPer100.calories)} {t('units.kcal')} •{' '}
                                    {t('macros.proteinShort')}: {Math.round(scannedProduct.nutritionPer100.protein)}{t('units.gram')} •{' '}
                                    {t('macros.fatShort')}: {Math.round(scannedProduct.nutritionPer100.fat)}{t('units.gram')} •{' '}
                                    {t('macros.carbsShort')}: {Math.round(scannedProduct.nutritionPer100.carbs)}{t('units.gram')}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleResetScan}
                        >
                            {t('foodTracker.barcode.scanAnother')}
                        </Button>
                        <Button
                            type="button"
                            className="flex-1"
                            onClick={handleSelectProduct}
                        >
                            {t('common.add')}
                        </Button>
                    </div>
                </div>
            )}

            {/* Lookup Error */}
            {lookupError && !scannedProduct && scannerStatus !== 'error' && (
                <div className="mb-4 rounded-tile bg-danger-soft p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-danger-fg" strokeWidth={1.8} aria-hidden="true" />
                        <div className="flex-1">
                            <p className="text-danger-fg">{lookupError}</p>
                            {scannedBarcode && (
                                <p className="mt-1 text-sm text-danger-fg tabular-nums">
                                    {t('foodTracker.barcode.withValue', { code: scannedBarcode })}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {onManualEntry && (
                            <Button
                                type="button"
                                className="flex-1"
                                onClick={handleManualEntry}
                            >
                                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                                <span>{t('foodTracker.entryModal.enterManually')}</span>
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleResetScan}
                        >
                            {t('foodTracker.barcode.scanAnother')}
                        </Button>
                    </div>
                </div>
            )}

            {/* Manual Entry Option (always visible at bottom when no scan result) */}
            {onManualEntry && !scannedProduct && !lookupError && (
                <div className="mt-auto border-t border-line pt-3">
                    <button
                        type="button"
                        onClick={handleManualEntry}
                        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 font-semibold text-fg transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        <Plus className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                        <span>{t('foodTracker.entryModal.enterManually')}</span>
                    </button>
                </div>
            )}

            {/* Hidden file inputs for gallery and native camera */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
                aria-label={t('foodTracker.barcode.pickFromGallery')}
            />
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
                aria-label={t('foodTracker.barcode.takePhoto')}
            />
        </div>
    );
}

export default BarcodeTab;
