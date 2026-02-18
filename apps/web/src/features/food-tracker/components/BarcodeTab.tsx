'use client';

/**
 * BarcodeTab Component
 *
 * Barcode scanning interface using html5-qrcode for real barcode detection.
 * Features camera viewfinder, barcode detection, and product lookup.
 *
 * @module food-tracker/components/BarcodeTab
 */

import { useCallback, useEffect } from 'react';
import { Camera, CameraOff, RefreshCw, AlertCircle, CheckCircle, Plus } from 'lucide-react';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
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
        lookupBarcode,
        resetScan,
    } = useBarcodeScanner();

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopScanning();
        };
    }, [stopScanning]);

    // Handle start camera
    const handleStartCamera = useCallback(() => {
        startScanning(BARCODE_READER_ELEMENT_ID);
    }, [startScanning]);

    // Handle stop camera
    const handleStopCamera = useCallback(() => {
        stopScanning();
    }, [stopScanning]);

    // Handle manual barcode input
    const handleManualBarcodeInput = useCallback((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const barcode = formData.get('barcode') as string;
        if (barcode && barcode.length >= 8) {
            lookupBarcode(barcode);
        }
    }, [lookupBarcode]);

    // Handle product selection
    const handleSelectProduct = useCallback(() => {
        if (scannedProduct) {
            onSelectFood(scannedProduct);
        }
    }, [scannedProduct, onSelectFood]);

    // Handle reset scan
    const handleResetScan = useCallback(() => {
        resetScan();
    }, [resetScan]);

    // Handle manual entry
    const handleManualEntry = useCallback(() => {
        onManualEntry?.();
    }, [onManualEntry]);

    return (
        <div className={`flex flex-col h-full ${className}`}>
            {/* Camera / Scanner Area */}
            <div className="relative flex-1 bg-gray-900 rounded-xl overflow-hidden mb-4">
                {scannerStatus === 'scanning' ? (
                    <>
                        <div id={BARCODE_READER_ELEMENT_ID} className="w-full h-full" />
                        {/* Stop camera button */}
                        <button
                            type="button"
                            onClick={handleStopCamera}
                            className="absolute top-2 right-2 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            aria-label="Остановить камеру"
                        >
                            <CameraOff className="w-5 h-5" />
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                        {/* Hidden container for html5-qrcode to clean up into */}
                        <div id={BARCODE_READER_ELEMENT_ID} style={{ display: 'none' }} />

                        {scannerStatus === 'idle' && (
                            <>
                                <Camera className="w-16 h-16 text-gray-400 mb-4" />
                                <p className="text-gray-400 mb-4">
                                    Наведите камеру на штрих-код продукта
                                </p>
                                <button
                                    type="button"
                                    onClick={handleStartCamera}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                    Включить камеру
                                </button>
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
                                <button
                                    type="button"
                                    onClick={handleStartCamera}
                                    className="flex items-center gap-2 px-4 py-2 text-blue-400 hover:text-blue-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    <span>Попробовать снова</span>
                                </button>
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
                    <span className="text-gray-600">Ищем продукт...</span>
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
        </div>
    );
}

export default BarcodeTab;
