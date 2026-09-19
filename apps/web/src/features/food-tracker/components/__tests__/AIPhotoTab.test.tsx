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
import { ApiError } from '@/shared/errors/apiErrors';

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
                expect(screen.getByText('Гречка')).toBeInTheDocument();
                expect(screen.getByText('Курица')).toBeInTheDocument();
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

            // Weight is not filled in by the model's estimate — it must be typed.
            await user.type(screen.getByLabelText(/Вес порции: Гречка/i), '200');
            await user.type(screen.getByLabelText(/Вес порции: Курица/i), '150');

            const confirmButton = screen.getByRole('button', { name: /добавить/i });
            expect(confirmButton).toBeEnabled();
            await user.click(confirmButton);

            expect(onSelectFoods).toHaveBeenCalledWith([
                expect.objectContaining({ name: 'Гречка с курицей', servingSize: 350 }),
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

    // Spec: "Вес порции подтверждает человек" (openspec/changes/enable-food-recognition/specs/food-recognition/spec.md)
    describe('Portion Weight Confirmation', () => {
        it('shows an empty weight input per position with the model estimate shown alongside as a hint', async () => {
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText('Гречка')).toBeInTheDocument();
            });

            const buckwheatInput = screen.getByLabelText(/Вес порции: Гречка/i) as HTMLInputElement;
            const chickenInput = screen.getByLabelText(/Вес порции: Курица/i) as HTMLInputElement;

            // The field itself must not arrive pre-filled with the model's number —
            // a filled field is one people leave untouched.
            expect(buckwheatInput.value).toBe('');
            expect(chickenInput.value).toBe('');

            // But the model's estimate is still visible, as a hint next to the field.
            expect(screen.getByText(/Оценка модели: 200 г/)).toBeInTheDocument();
            expect(screen.getByText(/Оценка модели: 150 г/)).toBeInTheDocument();
        });

        it('lets a person accept the model estimate explicitly via a button, without it being the default', async () => {
            const user = userEvent.setup();
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText('Гречка')).toBeInTheDocument();
            });

            const buckwheatInput = screen.getByLabelText(/Вес порции: Гречка/i) as HTMLInputElement;
            expect(buckwheatInput.value).toBe('');

            const useEstimateButtons = screen.getAllByRole('button', { name: /подставить/i });
            await user.click(useEstimateButtons[0]);

            expect(buckwheatInput.value).toBe('200');
        });

        it('does not save the entry while at least one position has no weight entered', async () => {
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
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText('Гречка')).toBeInTheDocument();
            });

            const confirmButton = screen.getByRole('button', { name: /добавить/i });
            expect(confirmButton).toBeDisabled();

            // Filling only one of the two positions must still leave it disabled.
            await user.type(screen.getByLabelText(/Вес порции: Гречка/i), '200');
            expect(confirmButton).toBeDisabled();

            await user.click(confirmButton);
            expect(onSelectFoods).not.toHaveBeenCalled();
        });

        it('recalculates calories from the entered weights, not from the model estimate', async () => {
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
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText('Гречка')).toBeInTheDocument();
            });

            // Deliberately different from the model's 200g / 150g estimate.
            await user.type(screen.getByLabelText(/Вес порции: Гречка/i), '100');
            await user.type(screen.getByLabelText(/Вес порции: Курица/i), '50');

            const confirmButton = screen.getByRole('button', { name: /добавить/i });
            expect(confirmButton).toBeEnabled();
            await user.click(confirmButton);

            expect(onSelectFoods).toHaveBeenCalledTimes(1);
            const [[savedFoods]] = onSelectFoods.mock.calls;
            const saved = savedFoods[0];

            // Weight entered by the human, not the model's combined 350g estimate.
            expect(saved.servingSize).toBe(150);

            // Buckwheat: 130 kcal/100g * 100g = 130; Chicken: 165 kcal/100g * 50g = 82.5
            const totalCalories = (saved.nutritionPer100.calories * saved.servingSize) / 100;
            expect(totalCalories).toBeCloseTo(212.5, 0);

            // Had the model's own weights (200g / 150g) been used, the total would be
            // 130*2 + 165*1.5 = 507.5 kcal — well outside the recalculated figure.
            expect(totalCalories).not.toBeCloseTo(507.5, 0);
        });
    });

    // Follow-up round: owner reasoned that a person entering "85" without
    // seeing what it produces can't actually vouch for the number — the
    // point of typing it is to look at the plate AND the result.
    describe('Live Running Total', () => {
        it('shows a running total from what is entered so far, marked as partial, updating as fields fill in', async () => {
            const user = userEvent.setup();
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText('Гречка')).toBeInTheDocument();
            });

            // Nothing typed yet — the total must still be visible (not blank),
            // and marked as partial so it's clear it isn't the final number.
            expect(screen.getByText(/Итого: 0 ккал/)).toBeInTheDocument();
            expect(screen.getByText(/промежуточный итог/i)).toBeInTheDocument();

            // One position filled — the running total reflects just that one.
            await user.type(screen.getByLabelText(/Вес порции: Гречка/i), '200');
            await waitFor(() => {
                expect(screen.getByText(/Итого: 260 ккал/)).toBeInTheDocument();
            });
            expect(screen.getByText(/промежуточный итог/i)).toBeInTheDocument();

            // Second position filled — total updates again, and the partial
            // marker disappears now that every position has a weight.
            await user.type(screen.getByLabelText(/Вес порции: Курица/i), '150');
            await waitFor(() => {
                expect(screen.getByText(/Итого: 508 ккал/)).toBeInTheDocument();
            });
            expect(screen.queryByText(/промежуточный итог/i)).not.toBeInTheDocument();
        });
    });

    // Round 2/5: an untyped digit (99999999) used to sail straight into the
    // diary as a valid weight, and "0"/garbage looked identical to an
    // untouched field. Neither is acceptable for a number a person is meant
    // to answer for.
    describe('Weight Input Validation', () => {
        it('rejects a weight over the 5000g ceiling with a specific message, not the generic hint', async () => {
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
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText('Гречка')).toBeInTheDocument();
            });

            // A typo that added a digit — 50000 instead of, say, 200.
            await user.type(screen.getByLabelText(/Вес порции: Гречка/i), '50000');
            await user.type(screen.getByLabelText(/Вес порции: Курица/i), '150');

            // The message names what's wrong (over the ceiling), not the
            // generic "введите вес каждой позиции" hint.
            expect(screen.getByText(/Больше 5000 г/)).toBeInTheDocument();

            const confirmButton = screen.getByRole('button', { name: /добавить/i });
            expect(confirmButton).toBeDisabled();

            await user.click(confirmButton);
            expect(onSelectFoods).not.toHaveBeenCalled();
        });

        it('accepts exactly 5000g but rejects one gram more', async () => {
            const user = userEvent.setup();
            const onRecognize = jest.fn().mockResolvedValue(mockHighConfidenceResult);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText('Гречка')).toBeInTheDocument();
            });

            const buckwheatInput = screen.getByLabelText(/Вес порции: Гречка/i);
            await user.type(buckwheatInput, '5000');
            expect(screen.queryByText(/Больше 5000 г/)).not.toBeInTheDocument();

            await user.clear(buckwheatInput);
            await user.type(buckwheatInput, '5001');
            expect(screen.getByText(/Больше 5000 г/)).toBeInTheDocument();
        });

        it('tells a person a zero weight is invalid, distinctly from an empty field', async () => {
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
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText('Гречка')).toBeInTheDocument();
            });

            // Before anything is typed, only the generic "not everything is
            // filled in yet" hint is shown — no per-field complaint.
            expect(screen.queryByText(/должен быть больше нуля/i)).not.toBeInTheDocument();

            await user.type(screen.getByLabelText(/Вес порции: Гречка/i), '0');

            // A typed "0" gets its own reason, different from the blank-field state.
            expect(screen.getByText(/должен быть больше нуля/i)).toBeInTheDocument();

            const confirmButton = screen.getByRole('button', { name: /добавить/i });
            expect(confirmButton).toBeDisabled();
            await user.click(confirmButton);
            expect(onSelectFoods).not.toHaveBeenCalled();
        });
    });

    // Round 2/5: this branch (the model returned no composition breakdown,
    // so the whole dish is the single position) shares the same code as the
    // composition branch, but had no dedicated test — a regression here
    // would go unnoticed.
    describe('No Composition Breakdown (single position)', () => {
        const singlePositionResult: RecognitionResult[] = [
            createMockRecognitionResult(
                createMockFood({ id: 'single-1', name: 'Творог', nutritionPer100: { calories: 120, protein: 18, fat: 3, carbs: 3 } }),
                0.91
                // No composition — the whole dish is the only position.
            ),
        ];

        it('shows one empty weight input for the whole dish, with the model estimate alongside as a hint', async () => {
            const onRecognize = jest.fn().mockResolvedValue(singlePositionResult);

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText('Творог')).toBeInTheDocument();
            });

            const weightInput = screen.getByLabelText(/Вес порции: Творог/i) as HTMLInputElement;
            expect(weightInput.value).toBe('');
            expect(screen.getByText(/Оценка модели: 100 г/)).toBeInTheDocument();
        });

        it('does not save the entry without a weight when the model did not break the dish into a composition', async () => {
            const user = userEvent.setup();
            const onRecognize = jest.fn().mockResolvedValue(singlePositionResult);
            const onSelectFoods = jest.fn();

            render(
                <AIPhotoTab
                    onSelectFoods={onSelectFoods}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText('Творог')).toBeInTheDocument();
            });

            const confirmButton = screen.getByRole('button', { name: /добавить/i });
            expect(confirmButton).toBeDisabled();

            await user.click(confirmButton);
            expect(onSelectFoods).not.toHaveBeenCalled();
        });

        it('recalculates calories from the entered weight when the model did not break the dish into a composition', async () => {
            const user = userEvent.setup();
            const onRecognize = jest.fn().mockResolvedValue(singlePositionResult);
            const onSelectFoods = jest.fn();

            render(
                <AIPhotoTab
                    onSelectFoods={onSelectFoods}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText('Творог')).toBeInTheDocument();
            });

            // Deliberately different from the model's own 100g estimate.
            await user.type(screen.getByLabelText(/Вес порции: Творог/i), '150');

            const confirmButton = screen.getByRole('button', { name: /добавить/i });
            expect(confirmButton).toBeEnabled();
            await user.click(confirmButton);

            expect(onSelectFoods).toHaveBeenCalledTimes(1);
            const [[savedFoods]] = onSelectFoods.mock.calls;
            const saved = savedFoods[0];

            // 120 kcal/100g at 150g entered — the human's weight, not the model's 100g.
            expect(saved.servingSize).toBe(150);
            expect(saved.nutritionPer100).toEqual({ calories: 120, protein: 18, fat: 3, carbs: 3 });
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

        // Server tells the model-couldn't-parse-it case apart from a daily
        // ceiling apart from an outage — the empty catch used to erase all
        // three into one generic sentence, and the 422 case is the one that
        // sends someone off retaking the same photo forever.
        it('shows the retake-closer suggestion on a 422, not the generic failure text', async () => {
            const onRecognize = jest.fn().mockRejectedValue(
                new ApiError(422, {
                    code: 'recognition_unclear',
                    message: 'Не удалось разобрать это фото — попробуйте снять ближе или добавьте еду вручную',
                })
            );

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText(/снять ближе/i)).toBeInTheDocument();
            });
            expect(screen.queryByText(/ошибка при распознавании фото/i)).not.toBeInTheDocument();
        });

        // The daily ceiling is not the same problem as an outage or a network
        // hiccup — it needs its own text, not "Ошибка при распознавании фото".
        it('shows the daily-limit text on a 429 with recognition_daily_limit, not the generic failure text', async () => {
            const onRecognize = jest.fn().mockRejectedValue(
                new ApiError(429, {
                    code: 'recognition_daily_limit',
                    message: 'лимит распознаваний исчерпан на сегодня',
                })
            );

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText(/завтра/i)).toBeInTheDocument();
            });
            expect(screen.queryByText(/ошибка при распознавании фото/i)).not.toBeInTheDocument();
        });

        // A genuine failure is not the photo's fault and not the day's quota —
        // it should offer to wait, not the generic photo-tab sentence.
        it('shows the try-again text on a 500 with recognition_failed, not the generic failure text', async () => {
            const onRecognize = jest.fn().mockRejectedValue(
                new ApiError(500, {
                    code: 'recognition_failed',
                    message: 'Не удалось распознать фото — попробуйте ещё раз через минуту или добавьте эту еду вручную',
                })
            );

            render(
                <AIPhotoTab
                    onSelectFoods={jest.fn()}
                    onRecognize={onRecognize}
                />
            );

            const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

            await waitFor(() => {
                expect(screen.getByText(/минуту/i)).toBeInTheDocument();
            });
            expect(screen.queryByText(/ошибка при распознавании фото/i)).not.toBeInTheDocument();
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
