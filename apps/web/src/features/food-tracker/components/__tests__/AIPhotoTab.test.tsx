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
    confidence: number,
    composition?: RecognitionResult['composition']
): RecognitionResult => ({
    food,
    confidence,
    composition,
});

// New pattern: 1 combined dish with composition
const mockHighConfidenceResult: RecognitionResult[] = [
    createMockRecognitionResult(
        createMockFood({
            id: 'food-1',
            name: 'Гречка с курицей',
            servingSize: 350,
            nutritionPer100: { calories: 142, protein: 12.5, fat: 3.2, carbs: 18 },
        }),
        0.88,
        [
            { name: 'Гречка', confidence: 0.95, estimatedWeight: 200, nutrition: { calories: 130, protein: 4.5, fat: 2.3, carbs: 25 } },
            { name: 'Курица', confidence: 0.88, estimatedWeight: 150, nutrition: { calories: 165, protein: 31, fat: 3.6, carbs: 0 } },
        ]
    ),
];

const mockLowConfidenceResult: RecognitionResult[] = [
    createMockRecognitionResult(
        createMockFood({ id: 'food-1', name: 'Неизвестное блюдо' }),
        0.55,
        [
            { name: 'Неизвестный продукт', confidence: 0.55, estimatedWeight: 100, nutrition: { calories: 100, protein: 5, fat: 3, carbs: 10 } },
        ]
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
        it('displays the combined dish name', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

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
                expect(screen.getByText('Гречка с курицей')).toBeInTheDocument();
            });
        });

        it('displays confidence score', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

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
                expect(screen.getByText('88%')).toBeInTheDocument();
            });
        });

        it('displays confidence labels', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

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
                expect(screen.getByText('Средняя')).toBeInTheDocument();
            });
        });

        it('displays calories per 100g', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

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
                expect(screen.getByText(/142 ккал на 100г/)).toBeInTheDocument();
            });
        });

        it('shows composition breakdown', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

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
                expect(screen.getByText('Состав')).toBeInTheDocument();
                expect(screen.getByText(/Гречка — 200 г/)).toBeInTheDocument();
                expect(screen.getByText(/Курица — 150 г/)).toBeInTheDocument();
            });
        });

        it('shows single add button', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

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
                expect(screen.getByRole('button', { name: /добавить/i })).toBeInTheDocument();
            });
        });
    });

    describe('Add Action', () => {
        it('calls onSelectFoods with the single combined dish', async () => {
            const user = userEvent.setup();
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);
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
                expect(screen.getByText('Гречка с курицей')).toBeInTheDocument();
            });

            const confirmButton = screen.getByRole('button', { name: /добавить/i });
            await user.click(confirmButton);

            expect(onSelectFoods).toHaveBeenCalledWith([
                expect.objectContaining({ name: 'Гречка с курицей' }),
            ]);
        });

        it('disables confirm button when no results', async () => {
            const onRecognize = jest.fn().mockResolvedValue([]);

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
                expect(screen.getByText(/продукты не распознаны/i)).toBeInTheDocument();
            });

            const confirmButton = screen.getByRole('button', { name: /добавить/i });
            expect(confirmButton).toBeDisabled();
        });
    });

    describe('Low Confidence Warning', () => {
        it('shows warning for low confidence results', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockLowConfidenceResult);

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
                expect(screen.getByText(/низкая уверенность в распознавании/i)).toBeInTheDocument();
            });
        });

        it('shows manual search option in warning', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockLowConfidenceResult);
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

    describe('onRecognize Callback', () => {
        it('calls onRecognize when a photo is uploaded', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

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
                expect(onRecognize).toHaveBeenCalledTimes(1);
                expect(onRecognize).toHaveBeenCalledWith(mockFile);
            });
        });

        it('displays recognition results returned by onRecognize', async () => {
            const customResults: RecognitionResult[] = [
                createMockRecognitionResult(
                    createMockFood({ id: 'custom-1', name: 'Творог', nutritionPer100: { calories: 120, protein: 18, fat: 3, carbs: 3 } }),
                    0.91
                ),
            ];
            const onRecognize = jest.fn().mockResolvedValue(customResults);

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
                expect(screen.getByText('Творог')).toBeInTheDocument();
                expect(screen.getByText('91%')).toBeInTheDocument();
                expect(screen.getByText(/120 ккал на 100г/)).toBeInTheDocument();
            });
        });
    });

    describe('Accessibility', () => {
        it('has accessible composition list for results', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

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
                expect(screen.getByRole('list', { name: /состав блюда/i })).toBeInTheDocument();
            });
        });

        it('has accessible file inputs', () => {
            render(<AIPhotoTab onSelectFoods={jest.fn()} />);

            expect(document.querySelector('input[aria-label="Выбрать фото из галереи"]')).toBeInTheDocument();
            expect(document.querySelector('input[aria-label="Сделать фото"]')).toBeInTheDocument();
        });
    });
});
