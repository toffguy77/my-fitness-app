/**
 * Вкладка рекомендаций на странице, с настоящим компонентом вкладки.
 *
 * Соседний `FoodTrackerPage.test.tsx` подменяет `RecommendationsTab` заглушкой —
 * и именно поэтому он не заметил, что вкладка монтируется без единого пропса и
 * не зовёт сервер вовсе. Здесь вкладка настоящая, подменён только слой API.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FoodTrackerPage } from '../FoodTrackerPage';
import { useFoodTracker } from '../../hooks/useFoodTracker';
import {
    createCustomRecommendation,
    fetchRecommendations,
    updateNutrientPreferences,
} from '../../api/recommendationsApi';
import type { RecommendationsData } from '../../api/recommendationsApi';

jest.mock('../../hooks/useFoodTracker');
jest.mock('../../api/recommendationsApi', () => ({
    fetchRecommendations: jest.fn(),
    updateNutrientPreferences: jest.fn(),
    createCustomRecommendation: jest.fn(),
    fetchRecommendationDetail: jest.fn(),
}));

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
}));

jest.mock('@/features/dashboard/components/FooterNavigation', () => ({
    FooterNavigation: () => <nav data-testid="footer-navigation">Footer</nav>,
}));

jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

const load = fetchRecommendations as jest.MockedFunction<typeof fetchRecommendations>;
const save = updateNutrientPreferences as jest.MockedFunction<typeof updateNutrientPreferences>;
const create = createCustomRecommendation as jest.MockedFunction<typeof createCustomRecommendation>;

const DATA: RecommendationsData = {
    nutrients: [
        {
            id: 'a',
            name: 'Витамин C',
            category: 'vitamins',
            dailyTarget: 90,
            unit: 'mg',
            isWeekly: false,
            isCustom: false,
        },
        {
            id: 'b',
            name: 'Витамин D',
            category: 'vitamins',
            dailyTarget: 15,
            unit: 'mcg',
            isWeekly: false,
            isCustom: false,
        },
    ],
    // Витамин D выключен: он приходит в списке, но не в отслеживаемых.
    trackedIds: ['a'],
    customRecommendations: [],
    currentIntakes: { a: 45, b: 0 },
};

function openRecommendations(): Promise<void> {
    return userEvent.click(screen.getByRole('tab', { name: 'Рекомендации' }));
}

describe('Страница дневника: вкладка рекомендаций', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        load.mockResolvedValue(DATA);
        save.mockResolvedValue(undefined);

        (useFoodTracker as jest.Mock).mockReturnValue({
            entries: { breakfast: [], lunch: [], dinner: [], snack: [] },
            dailyTotals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
            targetGoals: { calories: 2000, protein: 100, fat: 70, carbs: 250, isCustom: false },
            isLoading: false,
            error: null,
            isOffline: false,
            fetchDayData: jest.fn(),
            deleteEntry: jest.fn(),
            clearError: jest.fn(),
        });
    });

    it('не зовёт сервер, пока вкладка не открыта', () => {
        render(<FoodTrackerPage />);

        expect(load).not.toHaveBeenCalled();
    });

    // То, чего не было: вкладка монтировалась пустой, четыре обработчика не
    // вызывались никогда.
    it('показывает нутриенты с сервера, когда вкладку открыли', async () => {
        render(<FoodTrackerPage />);
        await openRecommendations();

        await waitFor(() => expect(load).toHaveBeenCalled());
        expect(await screen.findByText('Витамин C')).toBeInTheDocument();
    });

    it('не показывает во вкладке выключенный нутриент', async () => {
        render(<FoodTrackerPage />);
        await openRecommendations();

        expect(await screen.findByText('Витамин C')).toBeInTheDocument();
        expect(screen.queryByText('Витамин D')).not.toBeInTheDocument();
    });

    it('объясняет пустоту, когда справочник не заполнен', async () => {
        load.mockResolvedValue({
            nutrients: [],
            trackedIds: [],
            customRecommendations: [],
            currentIntakes: {},
        });

        render(<FoodTrackerPage />);
        await openRecommendations();

        expect(
            await screen.findByText(/нормы по нутриентам пока не заведены/i)
        ).toBeInTheDocument();
    });

    describe('настройка отслеживаемых', () => {
        it('показывает текущий выбор: все нутриенты, отмечены отслеживаемые', async () => {
            render(<FoodTrackerPage />);
            await openRecommendations();
            await screen.findByText('Витамин C');

            await userEvent.click(screen.getByLabelText('Настроить список рекомендаций'));

            // Выключенный нутриент виден здесь — иначе его было бы не включить
            // обратно, а сохранение стёрло бы выбор, которого экран не видел.
            expect(await screen.findByRole('checkbox', { name: /витамин c/i })).toBeChecked();
            expect(screen.getByRole('checkbox', { name: /витамин d/i })).not.toBeChecked();
        });

        it('сохраняет полный набор отслеживаемых', async () => {
            render(<FoodTrackerPage />);
            await openRecommendations();
            await screen.findByText('Витамин C');

            await userEvent.click(screen.getByLabelText('Настроить список рекомендаций'));
            await userEvent.click(await screen.findByRole('checkbox', { name: /витамин d/i }));
            await userEvent.click(screen.getByRole('button', { name: /сохранить/i }));

            await waitFor(() => expect(save).toHaveBeenCalledWith(['a', 'b']));
        });

        it('оставляет экран открытым и сообщает, когда сохранить не удалось', async () => {
            save.mockRejectedValue(new Error('сеть'));

            render(<FoodTrackerPage />);
            await openRecommendations();
            await screen.findByText('Витамин C');

            await userEvent.click(screen.getByLabelText('Настроить список рекомендаций'));
            await userEvent.click(screen.getByRole('button', { name: /сохранить/i }));

            expect(await screen.findByText(/не удалось сохранить настройки/i)).toBeInTheDocument();
        });
    });

    describe('своя рекомендация', () => {
        it('добавляется и появляется во вкладке', async () => {
            create.mockResolvedValue({ id: 'new', name: 'Магний', dailyTarget: 400, unit: 'mg' });

            render(<FoodTrackerPage />);
            await openRecommendations();
            await screen.findByText('Витамин C');

            await userEvent.click(screen.getByRole('button', { name: 'Добавить рекомендацию' }));

            const form = await screen.findByRole('dialog');
            await userEvent.type(within(form).getByLabelText(/название/i), 'Магний');
            await userEvent.type(within(form).getByLabelText(/дневная норма/i), '400');
            await userEvent.click(within(form).getByRole('button', { name: /добавить/i }));

            await waitFor(() =>
                expect(create).toHaveBeenCalledWith(
                    expect.objectContaining({ name: 'Магний', dailyTarget: 400 })
                )
            );
            expect(await screen.findByText('Магний')).toBeInTheDocument();
        });
    });
});
