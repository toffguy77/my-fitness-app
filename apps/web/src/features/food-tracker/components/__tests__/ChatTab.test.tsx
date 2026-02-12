/**
 * ChatTab Unit Tests
 *
 * Tests for the ChatTab component functionality.
 *
 * @module food-tracker/components/__tests__/ChatTab.test
 */

import React from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatTab, ChatResponse } from '../ChatTab';
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

const mockSuggestions: FoodItem[] = [
    createMockFood({ id: 'food-1', name: 'Яблоко зеленое', nutritionPer100: { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 } }),
    createMockFood({ id: 'food-2', name: 'Яблоко красное', nutritionPer100: { calories: 47, protein: 0.4, fat: 0.4, carbs: 10 } }),
];

const mockResponse: ChatResponse = {
    message: 'Вот что я нашел по вашему описанию:',
    suggestions: mockSuggestions,
};

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

describe('ChatTab', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Mock scrollIntoView
        Element.prototype.scrollIntoView = jest.fn();

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
        it('renders welcome message', () => {
            render(<ChatTab onSelectFood={jest.fn()} />);

            expect(screen.getByText(/опишите, что вы съели/i)).toBeInTheDocument();
        });

        it('renders message input', () => {
            render(<ChatTab onSelectFood={jest.fn()} />);

            expect(screen.getByRole('textbox', { name: /сообщение/i })).toBeInTheDocument();
        });

        it('renders send button', () => {
            render(<ChatTab onSelectFood={jest.fn()} />);

            expect(screen.getByRole('button', { name: /отправить/i })).toBeInTheDocument();
        });

        it('renders photo attachment button', () => {
            render(<ChatTab onSelectFood={jest.fn()} />);

            expect(screen.getByRole('button', { name: /прикрепить фото/i })).toBeInTheDocument();
        });

        it('has placeholder text in Russian', () => {
            render(<ChatTab onSelectFood={jest.fn()} />);

            expect(screen.getByPlaceholderText(/опишите, что вы съели/i)).toBeInTheDocument();
        });
    });

    describe('Curator Availability', () => {
        it('shows response time indicator when curator unavailable', () => {
            render(
                <ChatTab
                    onSelectFood={jest.fn()}
                    curatorAvailable={false}
                    estimatedResponseTime={10}
                />
            );

            expect(screen.getByText(/куратор ответит примерно через 10 мин/i)).toBeInTheDocument();
        });

        it('does not show response time when curator available', () => {
            render(
                <ChatTab
                    onSelectFood={jest.fn()}
                    curatorAvailable={true}
                />
            );

            expect(screen.queryByText(/куратор ответит/i)).not.toBeInTheDocument();
        });
    });

    describe('Message Sending', () => {
        it('sends message when send button clicked', async () => {
            const user = userEvent.setup();
            const onSendMessage = jest.fn().mockResolvedValue({ message: 'Ответ куратора' });

            render(
                <ChatTab
                    onSelectFood={jest.fn()}
                    onSendMessage={onSendMessage}
                />
            );

            const input = screen.getByRole('textbox', { name: /сообщение/i });
            await user.type(input, 'Съел яблоко');

            const sendButton = screen.getByRole('button', { name: /отправить/i });
            await user.click(sendButton);

            expect(onSendMessage).toHaveBeenCalledWith('Съел яблоко', undefined);
        });

        it('sends message when Enter pressed', async () => {
            const user = userEvent.setup();
            const onSendMessage = jest.fn().mockResolvedValue({ message: 'Ответ куратора' });

            render(
                <ChatTab
                    onSelectFood={jest.fn()}
                    onSendMessage={onSendMessage}
                />
            );

            const input = screen.getByRole('textbox', { name: /сообщение/i });
            await user.type(input, 'Съел яблоко{enter}');

            expect(onSendMessage).toHaveBeenCalledWith('Съел яблоко', undefined);
        });

        it('displays user message after sending', async () => {
            const user = userEvent.setup();
            const onSendMessage = jest.fn().mockResolvedValue({ message: 'Ответ куратора' });

            render(
                <ChatTab
                    onSelectFood={jest.fn()}
                    onSendMessage={onSendMessage}
                />
            );

            const input = screen.getByRole('textbox', { name: /сообщение/i });
            await user.type(input, 'Съел яблоко');

            const sendButton = screen.getByRole('button', { name: /отправить/i });
            await user.click(sendButton);

            expect(screen.getByText('Съел яблоко')).toBeInTheDocument();
        });

        it('displays curator response', async () => {
            const user = userEvent.setup();
            const onSendMessage = jest.fn().mockResolvedValue({ message: 'Ответ куратора' });

            render(
                <ChatTab
                    onSelectFood={jest.fn()}
                    onSendMessage={onSendMessage}
                />
            );

            const input = screen.getByRole('textbox', { name: /сообщение/i });
            await user.type(input, 'Съел яблоко');

            const sendButton = screen.getByRole('button', { name: /отправить/i });
            await user.click(sendButton);

            await waitFor(() => {
                expect(screen.getByText('Ответ куратора')).toBeInTheDocument();
            });
        });

        it('clears input after sending', async () => {
            const user = userEvent.setup();
            const onSendMessage = jest.fn().mockResolvedValue({ message: 'Ответ' });

            render(
                <ChatTab
                    onSelectFood={jest.fn()}
                    onSendMessage={onSendMessage}
                />
            );

            const input = screen.getByRole('textbox', { name: /сообщение/i });
            await user.type(input, 'Съел яблоко');

            const sendButton = screen.getByRole('button', { name: /отправить/i });
            await user.click(sendButton);

            expect(input).toHaveValue('');
        });

        it('disables send button when input is empty', () => {
            render(<ChatTab onSelectFood={jest.fn()} />);

            const sendButton = screen.getByRole('button', { name: /отправить/i });
            expect(sendButton).toBeDisabled();
        });

        it('enables send button when input has text', async () => {
            const user = userEvent.setup();
            render(<ChatTab onSelectFood={jest.fn()} />);

            const input = screen.getByRole('textbox', { name: /сообщение/i });
            await user.type(input, 'Текст');

            const sendButton = screen.getByRole('button', { name: /отправить/i });
            expect(sendButton).not.toBeDisabled();
        });
    });

    describe('Photo Upload', () => {
        it('triggers file input when photo button clicked', async () => {
            const user = userEvent.setup();
            render(<ChatTab onSelectFood={jest.fn()} />);

            const photoButton = screen.getByRole('button', { name: /прикрепить фото/i });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            const clickSpy = jest.spyOn(fileInput, 'click');

            await user.click(photoButton);

            expect(clickSpy).toHaveBeenCalled();
        });

        it('shows photo preview when photo selected', async () => {
            render(<ChatTab onSelectFood={jest.fn()} />);

            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByAltText(/выбранное фото/i)).toBeInTheDocument();
            });
        });

        it('removes photo preview when remove button clicked', async () => {
            const user = userEvent.setup();
            render(<ChatTab onSelectFood={jest.fn()} />);

            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                expect(screen.getByAltText(/выбранное фото/i)).toBeInTheDocument();
            });

            const removeButton = screen.getByRole('button', { name: /удалить фото/i });
            await user.click(removeButton);

            expect(screen.queryByAltText(/выбранное фото/i)).not.toBeInTheDocument();
        });

        it('enables send button when photo is selected', async () => {
            render(<ChatTab onSelectFood={jest.fn()} />);

            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            const mockFile = createMockFile();

            fireEvent.change(fileInput, { target: { files: [mockFile] } });

            await waitFor(() => {
                const sendButton = screen.getByRole('button', { name: /отправить/i });
                expect(sendButton).not.toBeDisabled();
            });
        });
    });

    describe('Food Suggestions', () => {
        it('displays food suggestions from response', async () => {
            const user = userEvent.setup();
            const onSendMessage = jest.fn().mockResolvedValue(mockResponse);

            render(
                <ChatTab
                    onSelectFood={jest.fn()}
                    onSendMessage={onSendMessage}
                />
            );

            const input = screen.getByRole('textbox', { name: /сообщение/i });
            await user.type(input, 'Съел яблоко');

            const sendButton = screen.getByRole('button', { name: /отправить/i });
            await user.click(sendButton);

            await waitFor(() => {
                expect(screen.getByText('Яблоко зеленое')).toBeInTheDocument();
                expect(screen.getByText('Яблоко красное')).toBeInTheDocument();
            });
        });

        it('displays calories for suggestions', async () => {
            const user = userEvent.setup();
            const onSendMessage = jest.fn().mockResolvedValue(mockResponse);

            render(
                <ChatTab
                    onSelectFood={jest.fn()}
                    onSendMessage={onSendMessage}
                />
            );

            const input = screen.getByRole('textbox', { name: /сообщение/i });
            await user.type(input, 'Съел яблоко');

            const sendButton = screen.getByRole('button', { name: /отправить/i });
            await user.click(sendButton);

            await waitFor(() => {
                expect(screen.getByText(/52 ккал/)).toBeInTheDocument();
                expect(screen.getByText(/47 ккал/)).toBeInTheDocument();
            });
        });

        it('calls onSelectFood when suggestion clicked', async () => {
            const user = userEvent.setup();
            const onSendMessage = jest.fn().mockResolvedValue(mockResponse);
            const onSelectFood = jest.fn();

            render(
                <ChatTab
                    onSelectFood={onSelectFood}
                    onSendMessage={onSendMessage}
                />
            );

            const input = screen.getByRole('textbox', { name: /сообщение/i });
            await user.type(input, 'Съел яблоко');

            const sendButton = screen.getByRole('button', { name: /отправить/i });
            await user.click(sendButton);

            await waitFor(() => {
                expect(screen.getByText('Яблоко зеленое')).toBeInTheDocument();
            });

            const suggestionButton = screen.getByRole('button', { name: /яблоко зеленое/i });
            await user.click(suggestionButton);

            expect(onSelectFood).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Яблоко зеленое' })
            );
        });
    });

    describe('Error Handling', () => {
        it('shows error message when send fails', async () => {
            const user = userEvent.setup();
            const onSendMessage = jest.fn().mockRejectedValue(new Error('Network error'));

            render(
                <ChatTab
                    onSelectFood={jest.fn()}
                    onSendMessage={onSendMessage}
                />
            );

            const input = screen.getByRole('textbox', { name: /сообщение/i });
            await user.type(input, 'Съел яблоко');

            const sendButton = screen.getByRole('button', { name: /отправить/i });
            await user.click(sendButton);

            await waitFor(() => {
                expect(screen.getByText(/не удалось отправить сообщение/i)).toBeInTheDocument();
            });
        });

        it('shows unavailable message when no onSendMessage provided', async () => {
            const user = userEvent.setup();

            render(<ChatTab onSelectFood={jest.fn()} />);

            const input = screen.getByRole('textbox', { name: /сообщение/i });
            await user.type(input, 'Съел яблоко');

            const sendButton = screen.getByRole('button', { name: /отправить/i });
            await user.click(sendButton);

            await waitFor(() => {
                expect(screen.getByText(/куратор сейчас недоступен/i)).toBeInTheDocument();
            });
        });
    });

    describe('Accessibility', () => {
        it('has accessible input', () => {
            render(<ChatTab onSelectFood={jest.fn()} />);

            expect(screen.getByRole('textbox', { name: /сообщение/i })).toBeInTheDocument();
        });

        it('has accessible buttons', () => {
            render(<ChatTab onSelectFood={jest.fn()} />);

            expect(screen.getByRole('button', { name: /отправить/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /прикрепить фото/i })).toBeInTheDocument();
        });

        it('has accessible file input', () => {
            render(<ChatTab onSelectFood={jest.fn()} />);

            expect(document.querySelector('input[aria-label="Выбрать фото"]')).toBeInTheDocument();
        });
    });
});
