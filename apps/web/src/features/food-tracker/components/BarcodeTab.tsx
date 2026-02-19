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
import { Camera, CameraOff, RefreshCw, AlertCircle, CheckCircle, Plus, Upload, Image } from 'lucide-react';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useLogger } from '@/shared/hooks/useLogger';
import type { FoodItem } from '../types';

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
            {/* Camera / Scanner Area */}
            <div className="relative flex-1 bg-gray-900 rounded-xl overflow-hidden mb-4">
                {/* Persistent scanner div — always full-size so html5-qrcode
                    can read container dimensions when starting the camera.
                    Non-scanning states render as an opaque overlay on top. */}
                <div id={BARCODE_READER_ELEMENT_ID} className="w-full h-full" />

                {/* Stop camera button (overlay) */}
                {scannerStatus === 'scanning' && (
                    <button
                        type="button"
                        onClick={handleStopCamera}
                        className="absolute top-2 right-2 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        aria-label="Остановить камеру"
                    >
                        <CameraOff className="w-5 h-5" />
                    </button>
                )}

                {/* Opaque overlay for non-scanning states */}
                {scannerStatus !== 'scanning' && (
                    <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
                        {scannerStatus === 'idle' && (
                            <>
                                <Camera className="w-16 h-16 text-gray-400 mb-4" />
                                <p className="text-gray-400 mb-6">
                                    Сканируйте штрих-код камерой или загрузите фото
                                </p>
                                <div className="flex flex-col gap-3 w-full max-w-xs">
                                    {/* Live camera scan */}
                                    <button
                                        type="button"
                                        onClick={handleStartCamera}
                                        className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    >
                                        <Camera className="w-5 h-5" />
                                        <span>Сканировать камерой</span>
                                    </button>
                                    <div className="flex gap-3">
                                        {/* Native camera capture (take photo) */}
                                        <button
                                            type="button"
                                            onClick={handleCameraCapture}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                                        >
                                            <Image className="w-5 h-5" />
                                            <span>Фото</span>
                                        </button>
                                        {/* Gallery selection */}
                                        <button
                                            type="button"
                                            onClick={handleGallerySelect}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                                        >
                                            <Upload className="w-5 h-5" />
                                            <span>Галерея</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {scannerStatus === 'starting' && (
                            <>
                                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                                <p className="text-gray-400">
                                    Запускаем камеру...
                                </p>
                            </>
                        )}

                        {scannerStatus === 'error' && (
                            <>
                                <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
                                <p className="text-red-400 mb-4">
                                    {lookupError || 'Не удалось получить доступ к камере.'}
                                </p>
                                <div className="flex flex-col gap-3 w-full max-w-xs">
                                    <button
                                        type="button"
                                        onClick={handleStartCamera}
                                        className="flex items-center justify-center gap-2 px-4 py-3 text-blue-400 hover:text-blue-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        <span>Попробовать снова</span>
                                    </button>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={handleCameraCapture}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                                        >
                                            <Image className="w-5 h-5" />
                                            <span>Фото</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleGallerySelect}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                                        >
                                            <Upload className="w-5 h-5" />
                                            <span>Галерея</span>
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
                        placeholder="Введите штрих-код вручную"
                        className="flex-1 px-4 py-3 bg-gray-100 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                        aria-label="Штрих-код"
                        pattern="[0-9]{8,14}"
                        title="Штрих-код должен содержать от 8 до 14 цифр"
                    />
                    <button
                        type="submit"
                        className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label="Найти по штрих-коду"
                    >
                        Найти
                    </button>
                </div>
            </form>

            {/* Lookup Status */}
            {isLookingUp && (
                <div className="flex items-center justify-center gap-3 p-4 bg-gray-100 rounded-xl mb-4">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-600">Ищем продукт{scannedBarcode ? ` (${scannedBarcode})` : ''}...</span>
                </div>
            )}

            {/* Scanned Product */}
            {scannedProduct && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl mb-4">
                    <div className="flex items-start gap-3">
                        <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h3 className="font-medium text-gray-900">{scannedProduct.name}</h3>
                            {scannedProduct.brand && (
                                <p className="text-sm text-gray-500">{scannedProduct.brand}</p>
                            )}
                            {scannedBarcode && (
                                <p className="text-xs text-gray-400 mt-1">Штрих-код: {scannedBarcode}</p>
                            )}
                            <div className="mt-2 text-sm text-gray-600">
                                <p>На 100г:</p>
                                <p>
                                    {Math.round(scannedProduct.nutritionPer100.calories)} ккал •{' '}
                                    Б: {Math.round(scannedProduct.nutritionPer100.protein)}г •{' '}
                                    Ж: {Math.round(scannedProduct.nutritionPer100.fat)}г •{' '}
                                    У: {Math.round(scannedProduct.nutritionPer100.carbs)}г
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button
                            type="button"
                            onClick={handleSelectProduct}
                            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                        >
                            Добавить
                        </button>
                        <button
                            type="button"
                            onClick={handleResetScan}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                        >
                            Сканировать другой
                        </button>
                    </div>
                </div>
            )}

            {/* Lookup Error */}
            {lookupError && !scannedProduct && scannerStatus !== 'error' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-red-700">{lookupError}</p>
                            {scannedBarcode && (
                                <p className="text-sm text-red-500 mt-1">
                                    Штрих-код: {scannedBarcode}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        {onManualEntry && (
                            <button
                                type="button"
                                onClick={handleManualEntry}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Ввести вручную</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleResetScan}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                        >
                            Сканировать другой
                        </button>
                    </div>
                </div>
            )}

            {/* Manual Entry Option (always visible at bottom when no scan result) */}
            {onManualEntry && !scannedProduct && !lookupError && (
                <div className="pt-4 border-t border-gray-200 mt-auto">
                    <button
                        type="button"
                        onClick={handleManualEntry}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        <Plus className="w-5 h-5 text-gray-400" />
                        <span>Ввести вручную</span>
                    </button>
                </div>
            )}

            {/* Hidden file inputs for gallery and native camera */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Выбрать фото штрих-кода из галереи"
            />
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Сфотографировать штрих-код"
            />
        </div>
    );
}

export default BarcodeTab;
