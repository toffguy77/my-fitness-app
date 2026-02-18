/**
 * useBarcodeScanner Hook
 *
 * Custom hook for barcode scanning using html5-qrcode.
 * Handles scanner lifecycle, barcode detection, and product lookup with caching.
 *
 * @module food-tracker/hooks/useBarcodeScanner
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import type { FoodItem } from '../types';

// ============================================================================
// Types
// ============================================================================

export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'error';

export interface UseBarcodeScanner {
    scannerStatus: ScannerStatus;
    scannedBarcode: string | null;
    scannedProduct: FoodItem | null;
    isLookingUp: boolean;
    lookupError: string | null;
    startScanning: (elementId: string) => Promise<void>;
    stopScanning: () => Promise<void>;
    lookupBarcode: (barcode: string) => Promise<void>;
    resetScan: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_KEY_PREFIX = 'barcode_cache_';
const DEFAULT_CACHE_DURATION_DAYS = 90;

// ============================================================================
// Cache Utilities
// ============================================================================

interface CachedBarcode {
    food: FoodItem;
    expiresAt: number;
}

function getCachedBarcode(barcode: string): FoodItem | null {
    try {
        const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${barcode}`);
        if (!cached) return null;

        const data: CachedBarcode = JSON.parse(cached);
        if (Date.now() > data.expiresAt) {
            localStorage.removeItem(`${CACHE_KEY_PREFIX}${barcode}`);
            return null;
        }

        // Sliding cache: refresh expiresAt on read
        setCachedBarcode(barcode, data.food, DEFAULT_CACHE_DURATION_DAYS);

        return data.food;
    } catch {
        return null;
    }
}

function setCachedBarcode(barcode: string, food: FoodItem, durationDays: number): void {
    try {
        const data: CachedBarcode = {
            food,
            expiresAt: Date.now() + durationDays * 24 * 60 * 60 * 1000,
        };
        localStorage.setItem(`${CACHE_KEY_PREFIX}${barcode}`, JSON.stringify(data));
    } catch {
        // Ignore cache errors
    }
}

// ============================================================================
// Hook
// ============================================================================

export function useBarcodeScanner(): UseBarcodeScanner {
    const [scannerStatus, setScannerStatus] = useState<ScannerStatus>('idle');
    const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
    const [scannedProduct, setScannedProduct] = useState<FoodItem | null>(null);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [lookupError, setLookupError] = useState<string | null>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scannerRef = useRef<any>(null);
    const isStoppingRef = useRef(false);

    // Stop scanning
    const stopScanning = useCallback(async () => {
        if (isStoppingRef.current) return;
        isStoppingRef.current = true;

        try {
            if (scannerRef.current) {
                try {
                    const state = scannerRef.current.getState();
                    // Html5QrcodeScannerState: SCANNING = 2, PAUSED = 3
                    if (state === 2 || state === 3) {
                        await scannerRef.current.stop();
                    }
                } catch {
                    // Scanner may already be stopped
                }
                scannerRef.current.clear();
                scannerRef.current = null;
            }
        } catch {
            // Ignore cleanup errors
            scannerRef.current = null;
        } finally {
            isStoppingRef.current = false;
            setScannerStatus('idle');
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                try {
                    const state = scannerRef.current.getState();
                    if (state === 2 || state === 3) {
                        scannerRef.current.stop().then(() => {
                            scannerRef.current?.clear();
                            scannerRef.current = null;
                        }).catch(() => {
                            scannerRef.current?.clear();
                            scannerRef.current = null;
                        });
                    } else {
                        scannerRef.current.clear();
                        scannerRef.current = null;
                    }
                } catch {
                    scannerRef.current = null;
                }
            }
        };
    }, []);

    // Lookup barcode via cache or API
    const lookupBarcode = useCallback(async (barcode: string) => {
        if (isLookingUp) return;

        setScannedBarcode(barcode);
        setIsLookingUp(true);
        setLookupError(null);
        setScannedProduct(null);

        try {
            // Check cache first
            const cached = getCachedBarcode(barcode);
            if (cached) {
                setScannedProduct(cached);
                setIsLookingUp(false);
                return;
            }

            // Lookup via API
            const product = await apiClient.get<FoodItem>(
                getApiUrl(`/food-tracker/barcode/${barcode}`)
            );

            if (product) {
                setCachedBarcode(barcode, product, DEFAULT_CACHE_DURATION_DAYS);
                setScannedProduct(product);
            } else {
                setLookupError('Продукт не найден');
            }
        } catch {
            setLookupError('Ошибка при поиске продукта');
        } finally {
            setIsLookingUp(false);
        }
    }, [isLookingUp]);

    // Start scanning
    const startScanning = useCallback(async (elementId: string) => {
        setScannerStatus('starting');
        setLookupError(null);

        try {
            // Dynamic import for SSR safety
            const { Html5Qrcode } = await import('html5-qrcode');

            // Stop any existing scanner
            if (scannerRef.current) {
                try {
                    const state = scannerRef.current.getState();
                    if (state === 2 || state === 3) {
                        await scannerRef.current.stop();
                    }
                    scannerRef.current.clear();
                } catch {
                    // ignore
                }
            }

            const scanner = new Html5Qrcode(elementId);
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 150 },
                },
                (decodedText: string) => {
                    // On successful decode: auto-lookup and stop scanning
                    scanner.stop().then(() => {
                        scanner.clear();
                        scannerRef.current = null;
                        setScannerStatus('idle');
                    }).catch(() => {
                        scannerRef.current = null;
                        setScannerStatus('idle');
                    });

                    // Trigger lookup
                    setScannedBarcode(decodedText);
                    setIsLookingUp(true);
                    setLookupError(null);
                    setScannedProduct(null);

                    // Check cache first
                    const cached = getCachedBarcode(decodedText);
                    if (cached) {
                        setScannedProduct(cached);
                        setIsLookingUp(false);
                        return;
                    }

                    // Lookup via API
                    apiClient.get<FoodItem>(
                        getApiUrl(`/food-tracker/barcode/${decodedText}`)
                    ).then((product) => {
                        if (product) {
                            setCachedBarcode(decodedText, product, DEFAULT_CACHE_DURATION_DAYS);
                            setScannedProduct(product);
                        } else {
                            setLookupError('Продукт не найден');
                        }
                    }).catch(() => {
                        setLookupError('Ошибка при поиске продукта');
                    }).finally(() => {
                        setIsLookingUp(false);
                    });
                },
                () => {
                    // Ignore scan failures (called on every frame without detection)
                }
            );

            setScannerStatus('scanning');
        } catch (error) {
            scannerRef.current = null;

            if (error instanceof DOMException && error.name === 'NotAllowedError') {
                setScannerStatus('error');
                setLookupError('Доступ к камере запрещен. Разрешите доступ в настройках браузера.');
            } else {
                setScannerStatus('error');
                setLookupError('Не удалось получить доступ к камере. Проверьте подключение камеры.');
            }
        }
    }, []);

    // Reset scan
    const resetScan = useCallback(() => {
        setScannedBarcode(null);
        setScannedProduct(null);
        setLookupError(null);
    }, []);

    return {
        scannerStatus,
        scannedBarcode,
        scannedProduct,
        isLookingUp,
        lookupError,
        startScanning,
        stopScanning,
        lookupBarcode,
        resetScan,
    };
}

export default useBarcodeScanner;
