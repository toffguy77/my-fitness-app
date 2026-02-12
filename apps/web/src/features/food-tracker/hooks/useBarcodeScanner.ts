/**
 * useBarcodeScanner Hook
 *
 * Custom hook for barcode scanning functionality.
 * Handles camera access, barcode detection, and product lookup with caching.
 *
 * @module food-tracker/hooks/useBarcodeScanner
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { FoodItem } from '../types';

// ============================================================================
// Types
// ============================================================================

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

export interface BarcodeScannerState {
    cameraStatus: CameraStatus;
    scannedBarcode: string | null;
    scannedProduct: FoodItem | null;
    isLookingUp: boolean;
    lookupError: string | null;
}

export interface BarcodeScannerActions {
    requestCameraAccess: () => Promise<void>;
    stopCamera: () => void;
    lookupBarcode: (barcode: string) => Promise<void>;
    resetScan: () => void;
}

export interface UseBarcodeScanner extends BarcodeScannerState, BarcodeScannerActions {
    videoRef: React.RefObject<HTMLVideoElement | null>;
}

export interface BarcodeScannerOptions {
    /** Function to lookup barcode in API */
    onLookupBarcode?: (barcode: string) => Promise<FoodItem | null>;
    /** Cache duration in days (default: 30) */
    cacheDurationDays?: number;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_KEY_PREFIX = 'barcode_cache_';
const DEFAULT_CACHE_DURATION_DAYS = 30;

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

export function useBarcodeScanner(options: BarcodeScannerOptions = {}): UseBarcodeScanner {
    const {
        onLookupBarcode,
        cacheDurationDays = DEFAULT_CACHE_DURATION_DAYS,
    } = options;

    const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
    const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
    const [scannedProduct, setScannedProduct] = useState<FoodItem | null>(null);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [lookupError, setLookupError] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Cleanup camera stream on unmount
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // Request camera access
    const requestCameraAccess = useCallback(async () => {
        setCameraStatus('requesting');
        setLookupError(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
            });

            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            setCameraStatus('active');
        } catch (error) {
            if (error instanceof DOMException) {
                if (error.name === 'NotAllowedError') {
                    setCameraStatus('denied');
                } else {
                    setCameraStatus('error');
                }
            } else {
                setCameraStatus('error');
            }
        }
    }, []);

    // Stop camera
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setCameraStatus('idle');
    }, []);

    // Lookup barcode
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
            if (onLookupBarcode) {
                const product = await onLookupBarcode(barcode);
                if (product) {
                    // Cache the result
                    setCachedBarcode(barcode, product, cacheDurationDays);
                    setScannedProduct(product);
                } else {
                    setLookupError('Продукт не найден');
                }
            } else {
                setLookupError('Продукт не найден');
            }
        } catch {
            setLookupError('Ошибка при поиске продукта');
        } finally {
            setIsLookingUp(false);
        }
    }, [isLookingUp, onLookupBarcode, cacheDurationDays]);

    // Reset scan
    const resetScan = useCallback(() => {
        setScannedBarcode(null);
        setScannedProduct(null);
        setLookupError(null);
    }, []);

    return {
        // State
        cameraStatus,
        scannedBarcode,
        scannedProduct,
        isLookingUp,
        lookupError,
        // Actions
        requestCameraAccess,
        stopCamera,
        lookupBarcode,
        resetScan,
        // Refs
        videoRef,
    };
}

export default useBarcodeScanner;
