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
            <div className="relative flex-1 bg-black rounded-xl overflow-hidden mb-4 min-h-[280px]">
                {/* Persistent scanner div — always in DOM, absolute so it
                    doesn't affect layout. html5-qrcode needs real dimensions
                    when scanner.start() is called (during 'starting' state). */}
                <div id={BARCODE_READER_ELEMENT_ID} className="absolute inset-0" />

                {/* Stop camera button */}
                {scannerStatus === 'scanning' && (
                    <button
                        type="button"
                        onClick={handleStopCamera}
                        className="absolute top-2 right-2 z-20 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-surface"
                        aria-label={t('foodTracker.barcode.stopCamera')}
                    >
                        <CameraOff className="w-5 h-5" />
                    </button>
                )}

                {/* Opaque overlay for non-scanning states */}
                {scannerStatus !== 'scanning' && (
                    <div className="absolute inset-0 z-10 bg-black flex flex-col items-center justify-center p-6 text-center">
                        {scannerStatus === 'idle' && (
                            <>
                                <Camera className="w-16 h-16 text-white/70 mb-4" />
                                <p className="text-white/80 mb-6">
                                    {t('foodTracker.barcode.prompt')}
                                </p>
                                <div className="flex flex-col gap-3 w-full max-w-xs">
                                    {/* Live camera scan */}
                                    <button
                                        type="button"
                                        onClick={handleStartCamera}
                                        className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl hover:bg-primary-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                    >
                                        <Camera className="w-5 h-5" />
                                        <span>{t('foodTracker.barcode.scanWithCamera')}</span>
                                    </button>
                                    <div className="flex gap-3">
                                        {/* Native camera capture (take photo) */}
                                        <button
                                            type="button"
                                            onClick={handleCameraCapture}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/15 text-white rounded-xl hover:bg-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                        >
                                            <ImageIcon className="w-5 h-5" />
                                            <span>{t('foodTracker.barcode.photo')}</span>
                                        </button>
                                        {/* Gallery selection */}
                                        <button
                                            type="button"
                                            onClick={handleGallerySelect}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/15 text-white rounded-xl hover:bg-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                        >
                                            <Upload className="w-5 h-5" />
                                            <span>{t('foodTracker.barcode.gallery')}</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {scannerStatus === 'starting' && (
                            <>
                                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                                <p className="text-white/80">
                                    {t('foodTracker.barcode.starting')}
                                </p>
                            </>
                        )}

                        {scannerStatus === 'error' && (
                            <>
                                <AlertCircle className="w-16 h-16 text-danger-fg mb-4" />
                                <p className="text-danger-fg mb-4">
                                    {lookupError || t('foodTracker.barcode.cameraFailed')}
                                </p>
                                <div className="flex flex-col gap-3 w-full max-w-xs">
                                    <button
                                        type="button"
                                        onClick={handleStartCamera}
                                        className="flex items-center justify-center gap-2 px-4 py-3 text-primary hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        <span>{t('foodTracker.barcode.tryAgain')}</span>
                                    </button>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={handleCameraCapture}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/15 text-white rounded-xl hover:bg-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                        >
                                            <ImageIcon className="w-5 h-5" />
                                            <span>{t('foodTracker.barcode.photo')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleGallerySelect}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/15 text-white rounded-xl hover:bg-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                        >
                                            <Upload className="w-5 h-5" />
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
                        className="flex-1 px-4 py-3 bg-subtle rounded-xl text-fg placeholder-fg-muted focus:outline-none focus:ring-2 focus:ring-focus focus:bg-surface transition-colors"
                        aria-label={t('foodTracker.barcode.label')}
                        pattern="[0-9]{8,14}"
                        title={t('foodTracker.barcode.lengthHint')}
                    />
                    <button
                        type="submit"
                        className="px-4 py-3 bg-primary text-on-primary rounded-xl hover:bg-primary-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        aria-label={t('foodTracker.barcode.findAria')}
                    >
                        {t('foodTracker.barcode.find')}
                    </button>
                </div>
            </form>

            {/* Lookup Status */}
            {isLookingUp && (
                <div className="flex items-center justify-center gap-3 p-4 bg-subtle rounded-xl mb-4">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-fg-muted">{t('foodTracker.barcode.looking', { suffix: scannedBarcode ? ` (${scannedBarcode})` : '' })}</span>
                </div>
            )}

            {/* Scanned Product */}
            {scannedProduct && (
                <div className="p-4 bg-success-soft border border-success/30 rounded-xl mb-4">
                    <div className="flex items-start gap-3">
                        <CheckCircle className="w-6 h-6 text-success-fg flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h3 className="font-medium text-fg">{scannedProduct.name}</h3>
                            {scannedProduct.brand && (
                                <p className="text-sm text-fg-muted">{scannedProduct.brand}</p>
                            )}
                            {scannedBarcode && (
                                <p className="text-xs text-fg-subtle mt-1">{t('foodTracker.barcode.withValue', { code: scannedBarcode })}</p>
                            )}
                            <div className="mt-2 text-sm text-fg-muted">
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
                    <div className="flex gap-2 mt-4">
                        <button
                            type="button"
                            onClick={handleSelectProduct}
                            className="flex-1 px-4 py-2 bg-success text-on-primary rounded-lg hover:bg-success transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-success"
                        >
                            {t('common.add')}
                        </button>
                        <button
                            type="button"
                            onClick={handleResetScan}
                            className="px-4 py-2 text-fg-muted hover:bg-subtle rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            {t('foodTracker.barcode.scanAnother')}
                        </button>
                    </div>
                </div>
            )}

            {/* Lookup Error */}
            {lookupError && !scannedProduct && scannerStatus !== 'error' && (
                <div className="p-4 bg-danger-soft border border-danger/30 rounded-xl mb-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-6 h-6 text-danger-fg flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-danger-fg">{lookupError}</p>
                            {scannedBarcode && (
                                <p className="text-sm text-danger-fg mt-1">
                                    {t('foodTracker.barcode.withValue', { code: scannedBarcode })}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        {onManualEntry && (
                            <button
                                type="button"
                                onClick={handleManualEntry}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                                <Plus className="w-4 h-4" />
                                <span>{t('foodTracker.entryModal.enterManually')}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleResetScan}
                            className="px-4 py-2 text-fg-muted hover:bg-subtle rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            {t('foodTracker.barcode.scanAnother')}
                        </button>
                    </div>
                </div>
            )}

            {/* Manual Entry Option (always visible at bottom when no scan result) */}
            {onManualEntry && !scannedProduct && !lookupError && (
                <div className="pt-4 border-t border-line mt-auto">
                    <button
                        type="button"
                        onClick={handleManualEntry}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-fg hover:bg-canvas rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        <Plus className="w-5 h-5 text-fg-subtle" />
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
