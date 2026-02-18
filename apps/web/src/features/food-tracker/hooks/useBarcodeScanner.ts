/**
 * useBarcodeScanner Hook
 *
 * Custom hook for barcode scanning using html5-qrcode.
 * Handles scanner lifecycle, barcode detection, product lookup with caching,
 * and scanning from image files (gallery).
 *
 * @module food-tracker/hooks/useBarcodeScanner
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import type { FoodItem } from '../types';

// ============================================================================
// Logger
// ============================================================================

const LOG_PREFIX = '[BarcodeScanner]';

function log(...args: unknown[]) {
    console.log(LOG_PREFIX, ...args);
}

function logWarn(...args: unknown[]) {
    console.warn(LOG_PREFIX, ...args);
}

function logError(...args: unknown[]) {
    console.error(LOG_PREFIX, ...args);
}

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
    scanFromFile: (file: File, elementId: string) => Promise<void>;
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
        if (!cached) {
            log('Cache miss for barcode:', barcode);
            return null;
        }

        const data: CachedBarcode = JSON.parse(cached);
        if (Date.now() > data.expiresAt) {
            log('Cache expired for barcode:', barcode);
            localStorage.removeItem(`${CACHE_KEY_PREFIX}${barcode}`);
            return null;
        }

        log('Cache hit for barcode:', barcode, '-> product:', data.food.name);
        // Sliding cache: refresh expiresAt on read
        setCachedBarcode(barcode, data.food, DEFAULT_CACHE_DURATION_DAYS);

        return data.food;
    } catch (error) {
        logWarn('Cache read error for barcode:', barcode, error);
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
        log('Cached barcode:', barcode, '-> product:', food.name, `(${durationDays} days TTL)`);
    } catch (error) {
        logWarn('Cache write error for barcode:', barcode, error);
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
        if (isStoppingRef.current) {
            log('stopScanning: already stopping, skip');
            return;
        }
        isStoppingRef.current = true;
        log('stopScanning: stopping scanner...');

        try {
            if (scannerRef.current) {
                try {
                    const state = scannerRef.current.getState();
                    log('stopScanning: scanner state =', state);
                    // Html5QrcodeScannerState: SCANNING = 2, PAUSED = 3
                    if (state === 2 || state === 3) {
                        await scannerRef.current.stop();
                        log('stopScanning: scanner.stop() succeeded');
                    }
                } catch (error) {
                    logWarn('stopScanning: scanner.stop() error (may already be stopped):', error);
                }
                scannerRef.current.clear();
                scannerRef.current = null;
                log('stopScanning: scanner cleared');
            } else {
                log('stopScanning: no active scanner');
            }
        } catch (error) {
            logError('stopScanning: cleanup error:', error);
            scannerRef.current = null;
        } finally {
            isStoppingRef.current = false;
            setScannerStatus('idle');
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            log('unmount: cleaning up scanner');
            if (scannerRef.current) {
                try {
                    const state = scannerRef.current.getState();
                    if (state === 2 || state === 3) {
                        scannerRef.current.stop().then(() => {
                            scannerRef.current?.clear();
                            scannerRef.current = null;
                            log('unmount: scanner stopped and cleared');
                        }).catch((error: unknown) => {
                            logWarn('unmount: scanner.stop() error:', error);
                            scannerRef.current?.clear();
                            scannerRef.current = null;
                        });
                    } else {
                        scannerRef.current.clear();
                        scannerRef.current = null;
                        log('unmount: scanner cleared (was not scanning)');
                    }
                } catch {
                    scannerRef.current = null;
                }
            }
        };
    }, []);

    // Lookup barcode via cache or API
    const lookupBarcode = useCallback(async (barcode: string) => {
        if (isLookingUp) {
            log('lookupBarcode: already looking up, skip');
            return;
        }

        log('lookupBarcode: starting lookup for', barcode);
        setScannedBarcode(barcode);
        setIsLookingUp(true);
        setLookupError(null);
        setScannedProduct(null);

        try {
            // Check cache first
            const cached = getCachedBarcode(barcode);
            if (cached) {
                log('lookupBarcode: found in cache:', cached.name);
                setScannedProduct(cached);
                setIsLookingUp(false);
                return;
            }

            // Lookup via API
            const url = getApiUrl(`/food-tracker/barcode/${barcode}`);
            log('lookupBarcode: calling API:', url);
            const product = await apiClient.get<FoodItem>(url);
            log('lookupBarcode: API response:', product);

            if (product) {
                setCachedBarcode(barcode, product, DEFAULT_CACHE_DURATION_DAYS);
                setScannedProduct(product);
                log('lookupBarcode: product found:', product.name);
            } else {
                log('lookupBarcode: product not found');
                setLookupError('Продукт не найден');
            }
        } catch (error) {
            logError('lookupBarcode: API error:', error);
            setLookupError('Ошибка при поиске продукта');
        } finally {
            setIsLookingUp(false);
        }
    }, [isLookingUp]);

    // Internal lookup used by camera scan callback (doesn't check isLookingUp state)
    const doLookup = useCallback(async (barcode: string) => {
        log('doLookup (camera decode): barcode =', barcode);
        setScannedBarcode(barcode);
        setIsLookingUp(true);
        setLookupError(null);
        setScannedProduct(null);

        // Check cache first
        const cached = getCachedBarcode(barcode);
        if (cached) {
            log('doLookup: cache hit:', cached.name);
            setScannedProduct(cached);
            setIsLookingUp(false);
            return;
        }

        // Lookup via API
        const url = getApiUrl(`/food-tracker/barcode/${barcode}`);
        log('doLookup: calling API:', url);
        apiClient.get<FoodItem>(url).then((product) => {
            log('doLookup: API response:', product);
            if (product) {
                setCachedBarcode(barcode, product, DEFAULT_CACHE_DURATION_DAYS);
                setScannedProduct(product);
            } else {
                setLookupError('Продукт не найден');
            }
        }).catch((error) => {
            logError('doLookup: API error:', error);
            setLookupError('Ошибка при поиске продукта');
        }).finally(() => {
            setIsLookingUp(false);
        });
    }, []);

    // Start live camera scanning
    const startScanning = useCallback(async (elementId: string) => {
        log('startScanning: elementId =', elementId);
        setScannerStatus('starting');
        setLookupError(null);

        try {
            // Dynamic import for SSR safety
            log('startScanning: importing html5-qrcode...');
            const { Html5Qrcode } = await import('html5-qrcode');
            log('startScanning: html5-qrcode imported successfully');

            // Stop any existing scanner
            if (scannerRef.current) {
                log('startScanning: stopping existing scanner first');
                try {
                    const state = scannerRef.current.getState();
                    if (state === 2 || state === 3) {
                        await scannerRef.current.stop();
                    }
                    scannerRef.current.clear();
                } catch (error) {
                    logWarn('startScanning: error stopping existing scanner:', error);
                }
            }

            const scanner = new Html5Qrcode(elementId);
            scannerRef.current = scanner;
            log('startScanning: Html5Qrcode instance created, calling scanner.start()...');

            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 150 },
                },
                (decodedText: string) => {
                    log('startScanning: barcode decoded!', decodedText);
                    // On successful decode: auto-lookup and stop scanning
                    scanner.stop().then(() => {
                        scanner.clear();
                        scannerRef.current = null;
                        setScannerStatus('idle');
                        log('startScanning: scanner stopped after decode');
                    }).catch((error) => {
                        logWarn('startScanning: scanner.stop() after decode error:', error);
                        scannerRef.current = null;
                        setScannerStatus('idle');
                    });

                    doLookup(decodedText);
                },
                () => {
                    // Ignore scan failures (called on every frame without detection)
                }
            );

            setScannerStatus('scanning');
            log('startScanning: camera stream active, scanning');
        } catch (error) {
            logError('startScanning: FAILED:', error);
            scannerRef.current = null;

            if (error instanceof DOMException && error.name === 'NotAllowedError') {
                setScannerStatus('error');
                setLookupError('Доступ к камере запрещен. Разрешите доступ в настройках браузера.');
            } else if (error instanceof DOMException && error.name === 'NotFoundError') {
                setScannerStatus('error');
                setLookupError('Камера не найдена на устройстве.');
            } else if (error instanceof DOMException && error.name === 'NotReadableError') {
                setScannerStatus('error');
                setLookupError('Камера занята другим приложением.');
            } else {
                setScannerStatus('error');
                const msg = error instanceof Error ? error.message : String(error);
                setLookupError(`Не удалось запустить камеру: ${msg}`);
            }
        }
    }, [doLookup]);

    // Scan barcode from an image file (gallery)
    const scanFromFile = useCallback(async (file: File, elementId: string) => {
        log('scanFromFile: file =', file.name, 'size =', file.size, 'type =', file.type);
        setLookupError(null);
        setScannedBarcode(null);
        setScannedProduct(null);

        try {
            // Dynamic import for SSR safety
            const { Html5Qrcode } = await import('html5-qrcode');
            log('scanFromFile: html5-qrcode imported');

            // Stop any live scanner first
            if (scannerRef.current) {
                log('scanFromFile: stopping live scanner first');
                try {
                    const state = scannerRef.current.getState();
                    if (state === 2 || state === 3) {
                        await scannerRef.current.stop();
                    }
                    scannerRef.current.clear();
                } catch (error) {
                    logWarn('scanFromFile: error stopping scanner:', error);
                }
                scannerRef.current = null;
                setScannerStatus('idle');
            }

            // Create a temporary scanner instance for file scanning
            const scanner = new Html5Qrcode(elementId);
            log('scanFromFile: calling scanner.scanFile()...');

            const decodedText = await scanner.scanFile(file, /* showImage= */ false);
            log('scanFromFile: decoded barcode from image:', decodedText);

            scanner.clear();

            // Lookup the barcode
            await lookupBarcode(decodedText);
        } catch (error) {
            logError('scanFromFile: FAILED:', error);
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes('No barcode') || msg.includes('No QR code') || msg.includes('NotFoundException')) {
                setLookupError('Штрих-код не найден на фото. Попробуйте другое фото или введите код вручную.');
            } else {
                setLookupError(`Ошибка сканирования фото: ${msg}`);
            }
        }
    }, [lookupBarcode]);

    // Reset scan
    const resetScan = useCallback(() => {
        log('resetScan');
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
        scanFromFile,
        lookupBarcode,
        resetScan,
    };
}

export default useBarcodeScanner;
