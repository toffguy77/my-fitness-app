/**
 * BarcodeTab Unit Tests
 *
 * Tests for the BarcodeTab component functionality.
 * Mocks useBarcodeScanner hook to test component behavior in isolation.
 *
 * @module food-tracker/components/__tests__/BarcodeTab.test
 */

import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BarcodeTab } from '../BarcodeTab';
import type { FoodItem } from '../../types';
import type { ScannerStatus } from '../../hooks/useBarcodeScanner';

// ============================================================================
// Mocks
// ============================================================================

const mockStartScanning = jest.fn();
const mockStopScanning = jest.fn();
const mockLookupBarcode = jest.fn();
const mockResetScan = jest.fn();

let mockScannerStatus: ScannerStatus = 'idle';
let mockScannedBarcode: string | null = null;
let mockScannedProduct: FoodItem | null = null;
let mockIsLookingUp = false;
let mockLookupError: string | null = null;

jest.mock('../../hooks/useBarcodeScanner', () => ({
    useBarcodeScanner: () => ({
        scannerStatus: mockScannerStatus,
        scannedBarcode: mockScannedBarcode,
        scannedProduct: mockScannedProduct,
        isLookingUp: mockIsLookingUp,
        lookupError: mockLookupError,
        startScanning: mockStartScanning,
        stopScanning: mockStopScanning,
        lookupBarcode: mockLookupBarcode,
        resetScan: mockResetScan,
    }),
}));

// ============================================================================
// Test Data
// ============================================================================

const createMockFood = (overrides: Partial<FoodItem> = {}): FoodItem => ({
    id: `food-${Math.random().toString(36).slice(2)}`,
    name: 'Молоко 3.2%',
    brand: 'Простоквашино',
    category: 'Молочные',
    servingSize: 100,
    servingUnit: 'мл',
    nutritionPer100: {
        calories: 59,
        protein: 2.9,
        fat: 3.2,
        carbs: 4.7,
    },
    barcode: '4607025392408',
    source: 'openfoodfacts',
    verified: true,
    ...overrides,
});

// ============================================================================
// Helpers
// ============================================================================

function resetMocks() {
    mockScannerStatus = 'idle';
    mockScannedBarcode = null;
    mockScannedProduct = null;
    mockIsLookingUp = false;
    mockLookupError = null;
    jest.clearAllMocks();
}

// ============================================================================
// Tests
// ============================================================================

describe('BarcodeTab', () => {
    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => {
        cleanup();
    });

    describe('Initial Rendering', () => {
        it('renders camera activation button', () => {
            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText('Включить камеру')).toBeInTheDocument();
        });

        it('renders instruction text in Russian', () => {
            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText(/наведите камеру на штрих-код продукта/i)).toBeInTheDocument();
        });

        it('renders manual barcode input', () => {
            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByRole('textbox', { name: /штрих-код/i })).toBeInTheDocument();
            expect(screen.getByPlaceholderText(/введите штрих-код вручную/i)).toBeInTheDocument();
        });

        it('renders find button for manual input', () => {
            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByRole('button', { name: /найти по штрих-коду/i })).toBeInTheDocument();
        });

        it('renders manual entry button when onManualEntry provided', () => {
            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onManualEntry={jest.fn()}
                />
            );

            expect(screen.getByText('Ввести вручную')).toBeInTheDocument();
        });
    });

    describe('Camera States', () => {
        it('shows starting state when scanner is starting', () => {
            mockScannerStatus = 'starting';

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText(/запускаем камеру/i)).toBeInTheDocument();
        });

        it('calls startScanning when camera button clicked', async () => {
            const user = userEvent.setup();

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            await user.click(screen.getByText('Включить камеру'));

            expect(mockStartScanning).toHaveBeenCalledWith('barcode-reader');
        });

        it('shows stop button when scanning', () => {
            mockScannerStatus = 'scanning';

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByRole('button', { name: /остановить камеру/i })).toBeInTheDocument();
        });

        it('shows error message when camera access denied', () => {
            mockScannerStatus = 'error';
            mockLookupError = 'Доступ к камере запрещен. Разрешите доступ в настройках браузера.';

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText(/доступ к камере запрещен/i)).toBeInTheDocument();
        });

        it('shows error message when camera not available', () => {
            mockScannerStatus = 'error';
            mockLookupError = 'Не удалось получить доступ к камере. Проверьте подключение камеры.';

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText(/не удалось получить доступ к камере/i)).toBeInTheDocument();
        });

        it('shows retry button after error', () => {
            mockScannerStatus = 'error';
            mockLookupError = 'Доступ к камере запрещен.';

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText('Попробовать снова')).toBeInTheDocument();
        });
    });

    describe('Manual Barcode Input', () => {
        it('calls lookupBarcode when form is submitted', async () => {
            const user = userEvent.setup();

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '4607025392408');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            expect(mockLookupBarcode).toHaveBeenCalledWith('4607025392408');
        });

        it('shows loading state during lookup', () => {
            mockIsLookingUp = true;

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText(/ищем продукт/i)).toBeInTheDocument();
        });
    });

    describe('Product Found', () => {
        it('displays product information when found', () => {
            const mockFood = createMockFood();
            mockScannedProduct = mockFood;

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText('Молоко 3.2%')).toBeInTheDocument();
            expect(screen.getByText('Простоквашино')).toBeInTheDocument();
        });

        it('displays КБЖУ information', () => {
            mockScannedProduct = createMockFood();

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText(/59 ккал/)).toBeInTheDocument();
            expect(screen.getByText(/Б: 3г/)).toBeInTheDocument();
            expect(screen.getByText(/Ж: 3г/)).toBeInTheDocument();
            expect(screen.getByText(/У: 5г/)).toBeInTheDocument();
        });

        it('shows add button when product found', () => {
            mockScannedProduct = createMockFood();

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText('Добавить')).toBeInTheDocument();
        });

        it('calls onSelectFood when add button clicked', async () => {
            const user = userEvent.setup();
            const mockFood = createMockFood();
            mockScannedProduct = mockFood;
            const onSelectFood = jest.fn();

            render(<BarcodeTab onSelectFood={onSelectFood} />);

            await user.click(screen.getByText('Добавить'));

            expect(onSelectFood).toHaveBeenCalledWith(mockFood);
        });

        it('shows scan another button when product found', () => {
            mockScannedProduct = createMockFood();

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText('Сканировать другой')).toBeInTheDocument();
        });
    });

    describe('Product Not Found', () => {
        it('shows error message when product not found', () => {
            mockLookupError = 'Продукт не найден';
            mockScannedBarcode = '1234567890123';

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText('Продукт не найден')).toBeInTheDocument();
        });

        it('displays scanned barcode in error state', () => {
            mockLookupError = 'Продукт не найден';
            mockScannedBarcode = '1234567890123';

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText(/штрих-код: 1234567890123/i)).toBeInTheDocument();
        });

        it('shows manual entry option in error state', () => {
            mockLookupError = 'Продукт не найден';
            mockScannedBarcode = '1234567890123';

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onManualEntry={jest.fn()}
                />
            );

            const buttons = screen.getAllByText('Ввести вручную');
            expect(buttons.length).toBeGreaterThanOrEqual(1);
        });

        it('calls onManualEntry when manual entry button clicked in error state', async () => {
            const user = userEvent.setup();
            mockLookupError = 'Продукт не найден';
            mockScannedBarcode = '1234567890123';
            const onManualEntry = jest.fn();

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onManualEntry={onManualEntry}
                />
            );

            // Click the first manual entry button in error section
            const buttons = screen.getAllByText('Ввести вручную');
            await user.click(buttons[0]);

            expect(onManualEntry).toHaveBeenCalled();
        });
    });

    describe('Reset Scan', () => {
        it('calls resetScan when scan another button clicked', async () => {
            const user = userEvent.setup();
            mockScannedProduct = createMockFood();

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            await user.click(screen.getByText('Сканировать другой'));

            expect(mockResetScan).toHaveBeenCalled();
        });
    });

    describe('Accessibility', () => {
        it('has accessible input for barcode', () => {
            render(<BarcodeTab onSelectFood={jest.fn()} />);

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            expect(input).toBeInTheDocument();
        });

        it('buttons have accessible names', () => {
            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onManualEntry={jest.fn()}
                />
            );

            expect(screen.getByText('Включить камеру')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /найти по штрих-коду/i })).toBeInTheDocument();
            expect(screen.getByText('Ввести вручную')).toBeInTheDocument();
        });

        it('stop camera button has accessible name when scanning', () => {
            mockScannerStatus = 'scanning';

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByRole('button', { name: /остановить камеру/i })).toBeInTheDocument();
        });
    });

    describe('Error Handling', () => {
        it('shows lookup error message', () => {
            mockLookupError = 'Ошибка при поиске продукта';

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByText('Ошибка при поиске продукта')).toBeInTheDocument();
        });
    });
});
