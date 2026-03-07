/**
 * Unit tests for useBarcodeScanner hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useBarcodeScanner } from '../useBarcodeScanner';
import { apiClient } from '@/shared/utils/api-client';
import type { FoodItem } from '../../types';

// Mock API client
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
    },
}));

// Mock config
jest.mock('@/config/api', () => ({
    getApiUrl: (path: string) => `http://localhost:4000/api/v1${path}`,
}));

// Mock logger
jest.mock('@/shared/utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

// Mock html5-qrcode
const mockScannerStop = jest.fn().mockResolvedValue(undefined);
const mockScannerClear = jest.fn();
const mockScannerStart = jest.fn();
const mockScannerScanFile = jest.fn();
const mockScannerGetState = jest.fn().mockReturnValue(1); // NOT_STARTED

const MockHtml5Qrcode = jest.fn().mockImplementation(() => ({
    start: mockScannerStart,
    stop: mockScannerStop,
    clear: mockScannerClear,
    scanFile: mockScannerScanFile,
    getState: mockScannerGetState,
}));

jest.mock('html5-qrcode', () => ({
    Html5Qrcode: MockHtml5Qrcode,
}));

const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

// ============================================================================
// Test data
// ============================================================================

const mockFoodItem: FoodItem = {
    id: 'food-1',
    name: 'Молоко 3.2%',
    category: 'Молочные продукты',
    servingSize: 100,
    servingUnit: 'мл',
    nutritionPer100: { calories: 60, protein: 3.2, fat: 3.2, carbs: 4.7 },
    barcode: '4600104030819',
    source: 'database',
    verified: true,
};

// ============================================================================
// Helpers
// ============================================================================

function mockLocalStorage(): Record<string, string> {
    const store: Record<string, string> = {};

    const mock = {
        getItem: jest.fn((key: string) => store[key] ?? null),
        setItem: jest.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
            delete store[key];
        }),
        clear: jest.fn(() => {
            Object.keys(store).forEach((key) => delete store[key]);
        }),
        get length() {
            return Object.keys(store).length;
        },
        key: jest.fn((i: number) => Object.keys(store)[i] ?? null),
    };

    Object.defineProperty(window, 'localStorage', { value: mock, writable: true });

    return store;
}

// ============================================================================
// Tests
// ============================================================================

describe('useBarcodeScanner', () => {
    let store: Record<string, string>;

    beforeEach(() => {
        jest.clearAllMocks();
        store = mockLocalStorage();
    });

    // ========================================================================
    // Initialization
    // ========================================================================

    describe('initialization', () => {
        it('starts with idle scanner status', () => {
            const { result } = renderHook(() => useBarcodeScanner());

            expect(result.current.scannerStatus).toBe('idle');
        });

        it('starts with no scanned barcode', () => {
            const { result } = renderHook(() => useBarcodeScanner());

            expect(result.current.scannedBarcode).toBeNull();
        });

        it('starts with no scanned product', () => {
            const { result } = renderHook(() => useBarcodeScanner());

            expect(result.current.scannedProduct).toBeNull();
        });

        it('starts with isLookingUp false', () => {
            const { result } = renderHook(() => useBarcodeScanner());

            expect(result.current.isLookingUp).toBe(false);
        });

        it('starts with no lookup error', () => {
            const { result } = renderHook(() => useBarcodeScanner());

            expect(result.current.lookupError).toBeNull();
        });

        it('returns all expected methods', () => {
            const { result } = renderHook(() => useBarcodeScanner());

            expect(typeof result.current.startScanning).toBe('function');
            expect(typeof result.current.stopScanning).toBe('function');
            expect(typeof result.current.scanFromFile).toBe('function');
            expect(typeof result.current.lookupBarcode).toBe('function');
            expect(typeof result.current.resetScan).toBe('function');
        });
    });

    // ========================================================================
    // Cache utilities
    // ========================================================================

    describe('cache logic', () => {
        it('returns product from cache on lookupBarcode when cached and not expired', async () => {
            const cacheEntry = {
                food: mockFoodItem,
                expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 1 day from now
            };
            store['barcode_cache_4600104030819'] = JSON.stringify(cacheEntry);

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('4600104030819');
            });

            expect(result.current.scannedProduct).toEqual(mockFoodItem);
            expect(result.current.scannedBarcode).toBe('4600104030819');
            expect(result.current.isLookingUp).toBe(false);
            expect(mockGet).not.toHaveBeenCalled();
        });

        it('evicts expired cache entries and falls through to API', async () => {
            const cacheEntry = {
                food: mockFoodItem,
                expiresAt: Date.now() - 1000, // expired
            };
            store['barcode_cache_4600104030819'] = JSON.stringify(cacheEntry);

            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('4600104030819');
            });

            expect(window.localStorage.removeItem).toHaveBeenCalledWith('barcode_cache_4600104030819');
            expect(mockGet).toHaveBeenCalled();
            expect(result.current.scannedProduct).toEqual(mockFoodItem);
        });

        it('evicts invalid cache entries (missing food.name)', async () => {
            const cacheEntry = {
                food: { id: '1', nutritionPer100: { calories: 10, protein: 1, fat: 1, carbs: 1 } },
                expiresAt: Date.now() + 1000 * 60 * 60,
            };
            store['barcode_cache_123'] = JSON.stringify(cacheEntry);

            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('123');
            });

            expect(window.localStorage.removeItem).toHaveBeenCalledWith('barcode_cache_123');
            expect(mockGet).toHaveBeenCalled();
        });

        it('evicts invalid cache entries (missing nutritionPer100)', async () => {
            const cacheEntry = {
                food: { name: 'Test' },
                expiresAt: Date.now() + 1000 * 60 * 60,
            };
            store['barcode_cache_456'] = JSON.stringify(cacheEntry);

            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('456');
            });

            expect(window.localStorage.removeItem).toHaveBeenCalledWith('barcode_cache_456');
            expect(mockGet).toHaveBeenCalled();
        });

        it('refreshes cache expiry on read (sliding cache)', async () => {
            const cacheEntry = {
                food: mockFoodItem,
                expiresAt: Date.now() + 1000 * 60, // about to expire
            };
            store['barcode_cache_4600104030819'] = JSON.stringify(cacheEntry);

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('4600104030819');
            });

            // Should have written back with refreshed expiry (90 days)
            expect(window.localStorage.setItem).toHaveBeenCalledWith(
                'barcode_cache_4600104030819',
                expect.any(String)
            );

            const writtenData = JSON.parse(
                (window.localStorage.setItem as jest.Mock).mock.calls.find(
                    (call: string[]) => call[0] === 'barcode_cache_4600104030819'
                )[1]
            );
            const expectedMinExpiry = Date.now() + 89 * 24 * 60 * 60 * 1000;
            expect(writtenData.expiresAt).toBeGreaterThan(expectedMinExpiry);
        });

        it('caches API results after successful lookup', async () => {
            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('4600104030819');
            });

            expect(window.localStorage.setItem).toHaveBeenCalledWith(
                'barcode_cache_4600104030819',
                expect.stringContaining('"food"')
            );
        });

        it('handles localStorage.getItem throwing an error', async () => {
            (window.localStorage.getItem as jest.Mock).mockImplementationOnce(() => {
                throw new Error('storage access denied');
            });

            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('789');
            });

            // Should fall through to API
            expect(mockGet).toHaveBeenCalled();
            expect(result.current.scannedProduct).toEqual(mockFoodItem);
        });

        it('handles localStorage.setItem throwing (quota exceeded)', async () => {
            (window.localStorage.setItem as jest.Mock).mockImplementationOnce(() => {
                throw new Error('QuotaExceededError');
            });

            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('999');
            });

            // Should still set the product even if cache write fails
            expect(result.current.scannedProduct).toEqual(mockFoodItem);
        });
    });

    // ========================================================================
    // lookupBarcode
    // ========================================================================

    describe('lookupBarcode', () => {
        it('sets scannedBarcode and product on successful API lookup', async () => {
            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('4600104030819');
            });

            expect(result.current.scannedBarcode).toBe('4600104030819');
            expect(result.current.scannedProduct).toEqual(mockFoodItem);
            expect(result.current.isLookingUp).toBe(false);
            expect(result.current.lookupError).toBeNull();
        });

        it('sets lookupError when product is not found', async () => {
            mockGet.mockResolvedValueOnce({
                found: false,
                cached: false,
                message: 'Продукт не найден в базе данных',
            });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('0000000000000');
            });

            expect(result.current.scannedProduct).toBeNull();
            expect(result.current.lookupError).toBe('Продукт не найден в базе данных');
            expect(result.current.isLookingUp).toBe(false);
        });

        it('uses default error message when API returns found=false without message', async () => {
            mockGet.mockResolvedValueOnce({ found: false, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('0000000000000');
            });

            expect(result.current.lookupError).toBe('Продукт не найден');
        });

        it('sets lookupError on API error', async () => {
            mockGet.mockRejectedValueOnce(new Error('Network error'));

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('4600104030819');
            });

            expect(result.current.scannedProduct).toBeNull();
            expect(result.current.lookupError).toBe('Ошибка при поиске продукта');
            expect(result.current.isLookingUp).toBe(false);
        });

        it('calls the correct API URL', async () => {
            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('4600104030819');
            });

            expect(mockGet).toHaveBeenCalledWith(
                'http://localhost:4000/api/v1/food-tracker/barcode/4600104030819'
            );
        });

        it('clears previous error before new lookup', async () => {
            mockGet.mockRejectedValueOnce(new Error('fail'));

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('111');
            });

            expect(result.current.lookupError).toBe('Ошибка при поиске продукта');

            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            await act(async () => {
                await result.current.lookupBarcode('222');
            });

            expect(result.current.lookupError).toBeNull();
            expect(result.current.scannedProduct).toEqual(mockFoodItem);
        });
    });

    // ========================================================================
    // scanFromFile
    // ========================================================================

    describe('scanFromFile', () => {
        const mockFile = new File(['image-data'], 'barcode.jpg', { type: 'image/jpeg' });

        it('decodes barcode from image file and looks up product', async () => {
            mockScannerScanFile.mockResolvedValueOnce('4600104030819');
            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.scanFromFile(mockFile, 'scanner-element');
            });

            expect(MockHtml5Qrcode).toHaveBeenCalledWith('scanner-element');
            expect(mockScannerScanFile).toHaveBeenCalledWith(mockFile, false);
            expect(mockScannerClear).toHaveBeenCalled();
            expect(result.current.scannedProduct).toEqual(mockFoodItem);
        });

        it('sets error when no barcode found in image', async () => {
            mockScannerScanFile.mockRejectedValueOnce(new Error('No barcode or QR code found'));

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.scanFromFile(mockFile, 'scanner-element');
            });

            expect(result.current.lookupError).toBe(
                'Штрих-код не найден на фото. Попробуйте другое фото или введите код вручную.'
            );
        });

        it('sets error for NotFoundException', async () => {
            mockScannerScanFile.mockRejectedValueOnce(new Error('NotFoundException: barcode'));

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.scanFromFile(mockFile, 'scanner-element');
            });

            expect(result.current.lookupError).toBe(
                'Штрих-код не найден на фото. Попробуйте другое фото или введите код вручную.'
            );
        });

        it('sets generic error for unexpected scan failures', async () => {
            mockScannerScanFile.mockRejectedValueOnce(new Error('Unexpected image format'));

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.scanFromFile(mockFile, 'scanner-element');
            });

            expect(result.current.lookupError).toBe(
                'Ошибка сканирования фото: Unexpected image format'
            );
        });

        it('resets state before scanning', async () => {
            // Set up some prior state
            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('111');
            });

            expect(result.current.scannedProduct).toEqual(mockFoodItem);

            // Now scan from file - should reset first
            mockScannerScanFile.mockRejectedValueOnce(new Error('No barcode'));

            await act(async () => {
                await result.current.scanFromFile(mockFile, 'scanner-element');
            });

            expect(result.current.scannedBarcode).toBeNull();
            expect(result.current.scannedProduct).toBeNull();
        });
    });

    // ========================================================================
    // startScanning
    // ========================================================================

    describe('startScanning', () => {
        it('creates scanner instance and starts camera', async () => {
            mockScannerStart.mockResolvedValueOnce(undefined);

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.startScanning('scanner-element');
            });

            expect(MockHtml5Qrcode).toHaveBeenCalledWith('scanner-element');
            expect(mockScannerStart).toHaveBeenCalledWith(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 150 } },
                expect.any(Function),
                expect.any(Function)
            );
            expect(result.current.scannerStatus).toBe('scanning');
        });

        it('sets error status when camera access is denied', async () => {
            const domError = new DOMException('Permission denied', 'NotAllowedError');
            mockScannerStart.mockRejectedValueOnce(domError);

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.startScanning('scanner-element');
            });

            expect(result.current.scannerStatus).toBe('error');
            expect(result.current.lookupError).toBe(
                'Доступ к камере запрещен. Разрешите доступ в настройках браузера.'
            );
        });

        it('sets error when camera not found', async () => {
            const domError = new DOMException('No camera', 'NotFoundError');
            mockScannerStart.mockRejectedValueOnce(domError);

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.startScanning('scanner-element');
            });

            expect(result.current.scannerStatus).toBe('error');
            expect(result.current.lookupError).toBe('Камера не найдена на устройстве.');
        });

        it('sets error when camera is busy', async () => {
            const domError = new DOMException('Camera busy', 'NotReadableError');
            mockScannerStart.mockRejectedValueOnce(domError);

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.startScanning('scanner-element');
            });

            expect(result.current.scannerStatus).toBe('error');
            expect(result.current.lookupError).toBe('Камера занята другим приложением.');
        });

        it('sets generic error for other failures', async () => {
            mockScannerStart.mockRejectedValueOnce(new Error('Unknown camera error'));

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.startScanning('scanner-element');
            });

            expect(result.current.scannerStatus).toBe('error');
            expect(result.current.lookupError).toBe(
                'Не удалось запустить камеру: Unknown camera error'
            );
        });
    });

    // ========================================================================
    // stopScanning
    // ========================================================================

    describe('stopScanning', () => {
        it('stops and clears an active scanner', async () => {
            mockScannerStart.mockResolvedValueOnce(undefined);
            mockScannerGetState.mockReturnValue(2); // SCANNING state

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.startScanning('scanner-element');
            });

            await act(async () => {
                await result.current.stopScanning();
            });

            expect(result.current.scannerStatus).toBe('idle');
        });

        it('handles stop when no scanner is active', async () => {
            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.stopScanning();
            });

            expect(result.current.scannerStatus).toBe('idle');
        });
    });

    // ========================================================================
    // resetScan
    // ========================================================================

    describe('resetScan', () => {
        it('clears barcode, product, and error', async () => {
            mockGet.mockResolvedValueOnce({ found: true, food: mockFoodItem, cached: false });

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('4600104030819');
            });

            expect(result.current.scannedProduct).toEqual(mockFoodItem);

            act(() => {
                result.current.resetScan();
            });

            expect(result.current.scannedBarcode).toBeNull();
            expect(result.current.scannedProduct).toBeNull();
            expect(result.current.lookupError).toBeNull();
        });

        it('clears error state after failed lookup', async () => {
            mockGet.mockRejectedValueOnce(new Error('fail'));

            const { result } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.lookupBarcode('999');
            });

            expect(result.current.lookupError).toBe('Ошибка при поиске продукта');

            act(() => {
                result.current.resetScan();
            });

            expect(result.current.lookupError).toBeNull();
        });
    });

    // ========================================================================
    // Cleanup on unmount
    // ========================================================================

    describe('cleanup on unmount', () => {
        it('stops scanner on unmount when scanning', async () => {
            mockScannerStart.mockResolvedValueOnce(undefined);
            mockScannerGetState.mockReturnValue(2); // SCANNING

            const { result, unmount } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.startScanning('scanner-element');
            });

            unmount();

            expect(mockScannerStop).toHaveBeenCalled();
        });

        it('clears scanner on unmount when not scanning', async () => {
            mockScannerStart.mockResolvedValueOnce(undefined);
            mockScannerGetState.mockReturnValue(1); // NOT_STARTED

            const { result, unmount } = renderHook(() => useBarcodeScanner());

            await act(async () => {
                await result.current.startScanning('scanner-element');
            });

            // Reset mock state to NOT_STARTED
            mockScannerGetState.mockReturnValue(1);

            unmount();

            expect(mockScannerClear).toHaveBeenCalled();
        });
    });
});
