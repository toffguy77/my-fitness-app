/**
 * BarcodeTab Unit Tests
 *
 * Tests for the BarcodeTab component functionality.
 *
 * @module food-tracker/components/__tests__/BarcodeTab.test
 */

import React from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BarcodeTab } from '../BarcodeTab';
import type { FoodItem } from '../../types';

// ============================================================================
// Mocks
// ============================================================================

// Mock navigator.mediaDevices
const mockGetUserMedia = jest.fn();
const mockMediaDevices = {
    getUserMedia: mockGetUserMedia,
};

Object.defineProperty(navigator, 'mediaDevices', {
    value: mockMediaDevices,
    writable: true,
});

// Mock MediaStream
class MockMediaStream {
    private tracks: { stop: jest.Mock }[] = [];

    constructor() {
        this.tracks = [{ stop: jest.fn() }];
    }

    getTracks() {
        return this.tracks;
    }
}

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
// Tests
// ============================================================================

describe('BarcodeTab', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetUserMedia.mockReset();
    });

    afterEach(() => {
        cleanup();
    });

    describe('Initial Rendering', () => {
        it('renders camera activation button', () => {
            render(<BarcodeTab onSelectFood={jest.fn()} />);

            expect(screen.getByRole('button', { name: /включить камеру/i })).toBeInTheDocument();
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

            expect(screen.getByRole('button', { name: /ввести вручную/i })).toBeInTheDocument();
        });
    });

    describe('Camera Permission', () => {
        it('shows requesting state when camera access is requested', async () => {
            const user = userEvent.setup();
            mockGetUserMedia.mockImplementation(() => new Promise(() => { })); // Never resolves

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            const button = screen.getByRole('button', { name: /включить камеру/i });
            await user.click(button);

            expect(screen.getByText(/запрашиваем доступ к камере/i)).toBeInTheDocument();
        });

        it('shows denied message when camera access is denied', async () => {
            const user = userEvent.setup();
            const error = new DOMException('Permission denied', 'NotAllowedError');
            mockGetUserMedia.mockRejectedValue(error);

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            const button = screen.getByRole('button', { name: /включить камеру/i });
            await user.click(button);

            await waitFor(() => {
                expect(screen.getByText(/доступ к камере запрещен/i)).toBeInTheDocument();
            });
        });

        it('shows error message when camera access fails', async () => {
            const user = userEvent.setup();
            const error = new DOMException('Device not found', 'NotFoundError');
            mockGetUserMedia.mockRejectedValue(error);

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            const button = screen.getByRole('button', { name: /включить камеру/i });
            await user.click(button);

            await waitFor(() => {
                expect(screen.getByText(/не удалось получить доступ к камере/i)).toBeInTheDocument();
            });
        });

        it('shows retry button after permission denied', async () => {
            const user = userEvent.setup();
            const error = new DOMException('Permission denied', 'NotAllowedError');
            mockGetUserMedia.mockRejectedValue(error);

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            const button = screen.getByRole('button', { name: /включить камеру/i });
            await user.click(button);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /попробовать снова/i })).toBeInTheDocument();
            });
        });

        it('activates camera when permission granted', async () => {
            const user = userEvent.setup();
            const mockStream = new MockMediaStream();
            mockGetUserMedia.mockResolvedValue(mockStream);

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            const button = screen.getByRole('button', { name: /включить камеру/i });
            await user.click(button);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /остановить камеру/i })).toBeInTheDocument();
            });
        });
    });

    describe('Manual Barcode Input', () => {
        it('submits barcode when form is submitted', async () => {
            const user = userEvent.setup();
            const onLookupBarcode = jest.fn().mockResolvedValue(null);

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '4607025392408');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(onLookupBarcode).toHaveBeenCalledWith('4607025392408');
            });
        });

        it('shows loading state during lookup', async () => {
            const user = userEvent.setup();
            const onLookupBarcode = jest.fn().mockImplementation(() => new Promise(() => { }));

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '4607025392408');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/ищем продукт/i)).toBeInTheDocument();
            });
        });
    });

    describe('Product Found', () => {
        it('displays product information when found', async () => {
            const user = userEvent.setup();
            const mockFood = createMockFood();
            const onLookupBarcode = jest.fn().mockResolvedValue(mockFood);

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '4607025392408');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText('Молоко 3.2%')).toBeInTheDocument();
                expect(screen.getByText('Простоквашино')).toBeInTheDocument();
            });
        });

        it('displays КБЖУ information', async () => {
            const user = userEvent.setup();
            const mockFood = createMockFood();
            const onLookupBarcode = jest.fn().mockResolvedValue(mockFood);

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '4607025392408');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/59 ккал/)).toBeInTheDocument();
                expect(screen.getByText(/Б: 3г/)).toBeInTheDocument();
                expect(screen.getByText(/Ж: 3г/)).toBeInTheDocument();
                expect(screen.getByText(/У: 5г/)).toBeInTheDocument();
            });
        });

        it('shows add button when product found', async () => {
            const user = userEvent.setup();
            const mockFood = createMockFood();
            const onLookupBarcode = jest.fn().mockResolvedValue(mockFood);

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '4607025392408');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /добавить/i })).toBeInTheDocument();
            });
        });

        it('calls onSelectFood when add button clicked', async () => {
            const user = userEvent.setup();
            const mockFood = createMockFood();
            const onLookupBarcode = jest.fn().mockResolvedValue(mockFood);
            const onSelectFood = jest.fn();

            render(
                <BarcodeTab
                    onSelectFood={onSelectFood}
                    onLookupBarcode={onLookupBarcode}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '4607025392408');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /добавить/i })).toBeInTheDocument();
            });

            const addButton = screen.getByRole('button', { name: /добавить/i });
            await user.click(addButton);

            expect(onSelectFood).toHaveBeenCalledWith(mockFood);
        });

        it('shows scan another button when product found', async () => {
            const user = userEvent.setup();
            const mockFood = createMockFood();
            const onLookupBarcode = jest.fn().mockResolvedValue(mockFood);

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '4607025392408');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /сканировать другой/i })).toBeInTheDocument();
            });
        });
    });

    describe('Product Not Found', () => {
        it('shows "Продукт не найден" error message', async () => {
            const user = userEvent.setup();
            const onLookupBarcode = jest.fn().mockResolvedValue(null);

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '1234567890123');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/продукт не найден/i)).toBeInTheDocument();
            });
        });

        it('displays scanned barcode in error state', async () => {
            const user = userEvent.setup();
            const onLookupBarcode = jest.fn().mockResolvedValue(null);

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '1234567890123');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/штрих-код: 1234567890123/i)).toBeInTheDocument();
            });
        });

        it('shows manual entry option in error state', async () => {
            const user = userEvent.setup();
            const onLookupBarcode = jest.fn().mockResolvedValue(null);
            const onManualEntry = jest.fn();

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                    onManualEntry={onManualEntry}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '1234567890123');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                // Should have manual entry button in error state
                const buttons = screen.getAllByRole('button', { name: /ввести вручную/i });
                expect(buttons.length).toBeGreaterThanOrEqual(1);
            });
        });

        it('calls onManualEntry when manual entry button clicked in error state', async () => {
            const user = userEvent.setup();
            const onLookupBarcode = jest.fn().mockResolvedValue(null);
            const onManualEntry = jest.fn();

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                    onManualEntry={onManualEntry}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '1234567890123');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/продукт не найден/i)).toBeInTheDocument();
            });

            // Click the manual entry button in error state
            const manualEntryButtons = screen.getAllByRole('button', { name: /ввести вручную/i });
            await user.click(manualEntryButtons[0]);

            expect(onManualEntry).toHaveBeenCalled();
        });
    });

    describe('Reset Scan', () => {
        it('resets state when scan another button clicked', async () => {
            const user = userEvent.setup();
            const mockFood = createMockFood();
            const onLookupBarcode = jest.fn().mockResolvedValue(mockFood);

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '4607025392408');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText('Молоко 3.2%')).toBeInTheDocument();
            });

            const resetButton = screen.getByRole('button', { name: /сканировать другой/i });
            await user.click(resetButton);

            expect(screen.queryByText('Молоко 3.2%')).not.toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('has accessible video element label', async () => {
            const user = userEvent.setup();
            const mockStream = new MockMediaStream();
            mockGetUserMedia.mockResolvedValue(mockStream);

            render(<BarcodeTab onSelectFood={jest.fn()} />);

            const button = screen.getByRole('button', { name: /включить камеру/i });
            await user.click(button);

            await waitFor(() => {
                const video = document.querySelector('video');
                expect(video).toHaveAttribute('aria-label', 'Камера для сканирования штрих-кода');
            });
        });

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

            expect(screen.getByRole('button', { name: /включить камеру/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /найти по штрих-коду/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /ввести вручную/i })).toBeInTheDocument();
        });
    });

    describe('Error Handling', () => {
        it('handles lookup error gracefully', async () => {
            const user = userEvent.setup();
            const onLookupBarcode = jest.fn().mockRejectedValue(new Error('Network error'));

            render(
                <BarcodeTab
                    onSelectFood={jest.fn()}
                    onLookupBarcode={onLookupBarcode}
                />
            );

            const input = screen.getByRole('textbox', { name: /штрих-код/i });
            await user.type(input, '4607025392408');

            const submitButton = screen.getByRole('button', { name: /найти по штрих-коду/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/ошибка при поиске продукта/i)).toBeInTheDocument();
            });
        });
    });
});
