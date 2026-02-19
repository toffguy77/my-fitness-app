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
import { logger } from '@/shared/utils/logger';
import type { FoodItem } from '../types';

// ============================================================================
// Logger helpers (context-aware, sent to container via /api/client-logs)
// ============================================================================

const CTX = { component: 'BarcodeScanner' };

function log(message: string, data?: Record<string, unknown>) {
    logger.info(message, { ...CTX, ...data });
}

function logWarn(message: string, data?: Record<string, unknown>) {
    logger.warn(message, { ...CTX, ...data });
}

function logError(message: string, error?: unknown, data?: Record<string, unknown>) {
    logger.error(
        message,
        error instanceof Error ? error : undefined,
        { ...CTX, ...data, ...(error && !(error instanceof Error) ? { rawError: String(error) } : {}) }
    );
}

// ============================================================================
// Types
// ============================================================================

export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'error';

/** Backend response from /api/v1/food-tracker/barcode/:code */
interface BarcodeApiResponse {
    found: boolean;
    food?: FoodItem;
    cached: boolean;
    message?: string;
}

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
            log('Cache miss', { barcode });
            return null;
        }

        const data: CachedBarcode = JSON.parse(cached);
        if (Date.now() > data.expiresAt) {
            log('Cache expired', { barcode });
            localStorage.removeItem(`${CACHE_KEY_PREFIX}${barcode}`);
            return null;
        }

        log('Cache hit', { barcode, product: data.food.name });
        // Sliding cache: refresh expiresAt on read
        setCachedBarcode(barcode, data.food, DEFAULT_CACHE_DURATION_DAYS);

        return data.food;
    } catch (error) {
        logWarn('Cache read error', { barcode, rawError: String(error) });
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
        log('Cached barcode', { barcode, product: food.name, ttlDays: durationDays });
    } catch (error) {
        logWarn('Cache write error', { barcode, rawError: String(error) });
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
        log('stopScanning: stopping scanner');

        try {
            if (scannerRef.current) {
                try {
                    const state = scannerRef.current.getState();
                    log('stopScanning: scanner state', { state });
                    if (state === 2 || state === 3) {
                        await scannerRef.current.stop();
                        log('stopScanning: scanner.stop() succeeded');
                    }
                } catch (error) {
                    logWarn('stopScanning: scanner.stop() error (may already be stopped)', { rawError: String(error) });
                }
                scannerRef.current.clear();
                scannerRef.current = null;
                log('stopScanning: scanner cleared');
            } else {
                log('stopScanning: no active scanner');
            }
        } catch (error) {
            logError('stopScanning: cleanup error', error);
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
                            logWarn('unmount: scanner.stop() error', { rawError: String(error) });
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

        log('lookupBarcode: start', { barcode });
        setScannedBarcode(barcode);
        setIsLookingUp(true);
        setLookupError(null);
        setScannedProduct(null);

        try {
            const cached = getCachedBarcode(barcode);
            if (cached) {
                log('lookupBarcode: found in cache', { barcode, product: cached.name });
                setScannedProduct(cached);
                setIsLookingUp(false);
                return;
            }

            const url = getApiUrl(`/food-tracker/barcode/${barcode}`);
            log('lookupBarcode: calling API', { url });
            const result = await apiClient.get<BarcodeApiResponse>(url);

            if (result.found && result.food) {
                setCachedBarcode(barcode, result.food, DEFAULT_CACHE_DURATION_DAYS);
                setScannedProduct(result.food);
                log('lookupBarcode: product found', { barcode, product: result.food.name });
            } else {
                log('lookupBarcode: product not found', { barcode });
                setLookupError(result.message || 'Продукт не найден');
            }
        } catch (error) {
            logError('lookupBarcode: API error', error, { barcode });
            setLookupError('Ошибка при поиске продукта');
        } finally {
            setIsLookingUp(false);
        }
    }, [isLookingUp]);

    // Internal lookup used by camera scan callback (doesn't check isLookingUp state)
    const doLookup = useCallback(async (barcode: string) => {
        log('doLookup (camera decode)', { barcode });
        setScannedBarcode(barcode);
        setIsLookingUp(true);
        setLookupError(null);
        setScannedProduct(null);

        const cached = getCachedBarcode(barcode);
        if (cached) {
            log('doLookup: cache hit', { barcode, product: cached.name });
            setScannedProduct(cached);
            setIsLookingUp(false);
            return;
        }

        const url = getApiUrl(`/food-tracker/barcode/${barcode}`);
        log('doLookup: calling API', { url });
        apiClient.get<BarcodeApiResponse>(url).then((result) => {
            if (result.found && result.food) {
                setCachedBarcode(barcode, result.food, DEFAULT_CACHE_DURATION_DAYS);
                setScannedProduct(result.food);
                log('doLookup: product found', { barcode, product: result.food.name });
            } else {
                log('doLookup: product not found', { barcode });
                setLookupError(result.message || 'Продукт не найден');
            }
        }).catch((error) => {
            logError('doLookup: API error', error, { barcode });
            setLookupError('Ошибка при поиске продукта');
        }).finally(() => {
            setIsLookingUp(false);
        });
    }, []);

    // Start live camera scanning
    const startScanning = useCallback(async (elementId: string) => {
        log('startScanning', { elementId });
        setScannerStatus('starting');
        setLookupError(null);

        try {
            log('startScanning: importing html5-qrcode');
            const { Html5Qrcode } = await import('html5-qrcode');
            log('startScanning: html5-qrcode imported');

            if (scannerRef.current) {
                log('startScanning: stopping existing scanner');
                try {
                    const state = scannerRef.current.getState();
                    if (state === 2 || state === 3) {
                        await scannerRef.current.stop();
                    }
                    scannerRef.current.clear();
                } catch (error) {
                    logWarn('startScanning: error stopping existing scanner', { rawError: String(error) });
                }
            }

            const scanner = new Html5Qrcode(elementId);
            scannerRef.current = scanner;
            log('startScanning: calling scanner.start()');

            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 150 },
                },
                (decodedText: string) => {
                    log('startScanning: barcode decoded!', { decodedText });
                    scanner.stop().then(() => {
                        scanner.clear();
                        scannerRef.current = null;
                        setScannerStatus('idle');
                        log('startScanning: scanner stopped after decode');
                    }).catch((error) => {
                        logWarn('startScanning: scanner.stop() after decode error', { rawError: String(error) });
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
            log('startScanning: camera active');
        } catch (error) {
            logError('startScanning: FAILED', error);
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
        log('scanFromFile', { fileName: file.name, fileSize: file.size, fileType: file.type });
        setLookupError(null);
        setScannedBarcode(null);
        setScannedProduct(null);

        try {
            const { Html5Qrcode } = await import('html5-qrcode');
            log('scanFromFile: html5-qrcode imported');

            if (scannerRef.current) {
                log('scanFromFile: stopping live scanner');
                try {
                    const state = scannerRef.current.getState();
                    if (state === 2 || state === 3) {
                        await scannerRef.current.stop();
                    }
                    scannerRef.current.clear();
                } catch (error) {
                    logWarn('scanFromFile: error stopping scanner', { rawError: String(error) });
                }
                scannerRef.current = null;
                setScannerStatus('idle');
            }

            const scanner = new Html5Qrcode(elementId);
            log('scanFromFile: calling scanner.scanFile()');

            const decodedText = await scanner.scanFile(file, /* showImage= */ false);
            log('scanFromFile: decoded barcode from image', { decodedText });

            scanner.clear();

            await lookupBarcode(decodedText);
        } catch (error) {
            logError('scanFromFile: FAILED', error);
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
