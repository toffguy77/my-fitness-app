/**
 * AIPhotoTab Unit Tests
 *
 * Tests for the AIPhotoTab component functionality.
 *
 * @module food-tracker/components/__tests__/AIPhotoTab.test
 */

import React from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIPhotoTab, RecognitionResult } from '../AIPhotoTab';
import type { FoodItem } from '../../types';

// ============================================================================
// Test Data
// ============================================================================

const createMockFood = (overrides: Partial<FoodItem> = {}): FoodItem => ({
    id: `food-${Math.random().toString(36).slice(2)}`,
    name: 'Яблоко',
    category: 'Фрукты',
    servingSize: 100,
    servingUnit: 'г',
    nutritionPer100: {
        calories: 52,
        protein: 0.3,
        fat: 0.2,
        carbs: 14,
    },
    source: 'database',
    verified: true,
    ...overrides,
});

const createMockRecognitionResult = (
    food: FoodItem,
    confidence: number
): RecognitionResult => ({
    food,
    confidence,
});

const mockHighConfidenceResults: RecognitionResult[] = [
    createMockRecognitionResult(
        createMockFood({ id: 'food-1', name: 'Яблоко', nutritionPer100: { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 } }),
        0.95
    ),
    createMockRecognitionResult(
        createMockFood({ id: 'food-2', name: 'Банан', nutritionPer100: { calories: 89, protein: 1.1, fat: 0.3, carbs: 23 } }),
        0.88
    ),
];

const mockMixedConfidenceResults: RecognitionResult[] = [
    createMockRecognitionResult(
        createMockFood({ id: 'food-1', name: 'Яблоко' }),
        0.95
    ),
    createMockRecognitionResult(
        createMockFood({ id: 'food-2', name: 'Неизвестный продукт' }),
        0.55
    ),
];

// Mock file
const createMockFile = (name = 'test.jpg', type = 'image/jpeg'): File => {
    const blob = new Blob(['test'], { type });
    return new File([blob], name, { type });
};

// Mock FileReader
const mockFileReader = {
    readAsDataURL: jest.fn(),
    result: 'data:image/jpeg;base64,test',
    onload: null as (() => void) | null,
};

// ============================================================================
// Tests
// ============================================================================

describe('AIPhotoTab', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock FileReader
        (global as unknown as { FileReader: unknown }).FileReader = jest.fn(() => ({
            ...mockFileReader,
            readAsDataURL: jest.fn(function (this: typeof mockFileReader) {
                setTimeout(() => {
                    if (this.onload) this.onload();
                }, 0);
            }),
        }));
    });

    afterEach(() => {
        cleanup();
    });

    describe('Initial Rendering', () => {
        it('renders photo selection buttons', () => {
            render(<AIPhotoTab onSelectFoods={jest.fn()} />);

            expect(screen.getByRole('button', { name: /камера/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /галерея/i })).toBeInTheDocument();
        });

        it('renders instruction text in Russian', () => {
            render(<AIPhotoTab onSelectFoods={jest.fn()} />);

            expect(screen.getByText(/сфотографируйте еду или выберите фото из галереи/i)).toBeInTheDocument();
        });

        it('has hidden file inputs', () => {
            render(<AIPhotoTab onSelectFoods={jest.fn()} />);

            const fileInputs = document.querySelectorAll('input[type="file"]');
            expect(fileInputs).toHaveLength(2);
            fileInputs.forEach(input => {
                expect(input).toHaveClass('hidden');
            });
        });
    });

    describe('Photo Selection', () => {
        it('triggers gallery file input when gallery button clicked', async () => {
            const user = userEvent.setup();
            render(<AIPhotoTab onSelectFoods={jest.fn()} />);

            const galleryButton = screen.getByRole('button', { name: /галерея/i });
            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const clickSpy = jest.spyOn(fileInput, 'click');

            await user.click(galleryButton);

            expect(clickSpy).toHaveBeenCalled();
        });

        it('triggers camera file input when camera button clicked', async () => {
            const user = userEvent.setup();
            render(<AIPhotoTab onSelectFoods={jest.fn()} />);

            const cameraButton = screen.getByRole('button', { name: /камера/i });
            const cameraInput = document.querySelector('input[type="file"][capture]') as HTMLInputElement;
            const clickSpy = jest.spyOn(cameraInput, 'click');

            await user.click(cameraButton);

            expect(clickSpy).toHaveBeenCalled();
        });
    });

    describe('Processing State', () => {
        it('shows loading state during recognition', async () => {
            const onRecognize = jest.fn().mockImplementation(() => new Promise(() => { }));

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText(/распознаем продукты/i)).toBeInTheDocument();
            });
        });

        it('shows spinner during processing', async () => {
            const onRecognize = jest.fn().mockImplementation(() => new Promise(() => { }));

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(document.querySelector('.animate-spin')).toBeInTheDocument();
            });
        });
    });

    describe('Results Display', () => {
        it('displays recognized products', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResults);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText('Яблоко')).toBeInTheDocument();
                expect(screen.getByText('Банан')).toBeInTheDocument();
            });
        });

        it('displays confidence scores', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResults);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText('95%')).toBeInTheDocument();
                expect(screen.getByText('88%')).toBeInTheDocument();
            });
        });

        it('displays confidence labels', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResults);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText('Высокая')).toBeInTheDocument();
            });
        });

        it('displays calories per 100g', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResults);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText(/52 ккал на 100г/)).toBeInTheDocument();
                expect(screen.getByText(/89 ккал на 100г/)).toBeInTheDocument();
            });
        });

        it('auto-selects high confidence items', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResults);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                // Both items should be auto-selected (confidence >= 0.7)
                expect(screen.getByRole('button', { name: /добавить выбранные \(2\)/i })).toBeInTheDocument();
            });
        });

        it('shows found products count', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResults);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText(/найденные продукты \(2\)/i)).toBeInTheDocument();
            });
        });
    });

    describe('Item Selection', () => {
        it('toggles item selection on click', async () => {
            const user = userEvent.setup();
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResults);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText('Яблоко')).toBeInTheDocument();
            });

            // Initially 2 selected
            expect(screen.getByRole('button', { name: /добавить выбранные \(2\)/i })).toBeInTheDocument();

            // Click to deselect first item
            const firstItem = screen.getByRole('option', { name: /яблоко/i });
            await user.click(firstItem);

            // Now 1 selected
            expect(screen.getByRole('button', { name: /добавить выбранные \(1\)/i })).toBeInTheDocument();
        });

        it('calls onSelectFoods with selected items', async () => {
            const user = userEvent.setup();
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResults);
            const onSelectFoods = jest.fn();

            render(
                <AIPhotoTab
                    onSelectFoods={onSelectFoods}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText('Яблоко')).toBeInTheDocument();
            });

            const confirmButton = screen.getByRole('button', { name: /добавить выбранные/i });
            await user.click(confirmButton);

            expect(onSelectFoods).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Яблоко' }),
                    expect.objectContaining({ name: 'Банан' }),
                ])
            );
        });

        it('disables confirm button when no items selected', async () => {
            const user = userEvent.setup();
            const singleResult = [mockHighConfidenceResults[0]];
            const onRecognize = jest.fn().mockResolvedValue(singleResult);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText('Яблоко')).toBeInTheDocument();
            });

            // Deselect the only item
            const item = screen.getByRole('option', { name: /яблоко/i });
            await user.click(item);

            const confirmButton = screen.getByRole('button', { name: /добавить выбранные \(0\)/i });
            expect(confirmButton).toBeDisabled();
        });
    });

    describe('Low Confidence Warning', () => {
        it('shows warning for low confidence results', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockMixedConfidenceResults);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText(/некоторые продукты распознаны с низкой уверенностью/i)).toBeInTheDocument();
            });
        });

        it('shows manual search option in warning', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockMixedConfidenceResults);
            const onManualSearch = jest.fn();

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                    onManualSearch={onManualSearch}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /найти вручную/i })).toBeInTheDocument();
            });
        });
    });

    describe('Error Handling', () => {
        it('shows error message when recognition fails', async () => {
            const onRecognize = jest.fn().mockRejectedValue(new Error('Network error'));

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText(/ошибка при распознавании фото/i)).toBeInTheDocument();
            });
        });

        it('shows error when service unavailable', async () => {
            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                // No onRecognize provided
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText(/сервис распознавания недоступен/i)).toBeInTheDocument();
            });
        });

        it('shows retry button on error', async () => {
            const onRecognize = jest.fn().mockRejectedValue(new Error('Network error'));

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /попробовать снова/i })).toBeInTheDocument();
            });
        });

        it('shows manual search option on error', async () => {
            const onRecognize = jest.fn().mockRejectedValue(new Error('Network error'));
            const onManualSearch = jest.fn();

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                    onManualSearch={onManualSearch}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /найти вручную/i })).toBeInTheDocument();
            });
        });
    });

    describe('Reset', () => {
        it('resets to initial state when retry clicked', async () => {
            const user = userEvent.setup();
            const onRecognize = jest.fn().mockRejectedValue(new Error('Network error'));

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByText(/ошибка при распознавании фото/i)).toBeInTheDocument();
            });

            const retryButton = screen.getByRole('button', { name: /попробовать снова/i });
            await user.click(retryButton);

            expect(screen.getByRole('button', { name: /камера/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /галерея/i })).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('has accessible listbox for results', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResults);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByRole('listbox', { name: /распознанные продукты/i })).toBeInTheDocument();
            });
        });

        it('has accessible file inputs', () => {
            render(<AIPhotoTab onSelectFoods={jest.fn()} />);

            expect(document.querySelector('input[aria-label="Выбрать фото из галереи"]')).toBeInTheDocument();
            expect(document.querySelector('input[aria-label="Сделать фото"]')).toBeInTheDocument();
        });
    });
});
