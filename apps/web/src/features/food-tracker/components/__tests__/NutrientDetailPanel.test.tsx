/**
 * Тесты панели подробностей по нутриенту.
 *
 * `GET /api/v1/food-tracker/recommendations/:id` существовал и не вызывался
 * потому, что показывать подробности было некуда.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NutrientDetailPanel } from '../NutrientDetailPanel';
import { fetchRecommendationDetail } from '../../api/recommendationsApi';
import type { NutrientDetail } from '../../types';

jest.mock('../../api/recommendationsApi', () => ({
    fetchRecommendationDetail: jest.fn(),
}));

const load = fetchRecommendationDetail as jest.MockedFunction<typeof fetchRecommendationDetail>;

const FULL: NutrientDetail = {
    id: 'a',
    name: 'Витамин C',
    unit: 'mg',
    dailyTarget: 90,
    currentIntake: 45,
    description: 'Водорастворимый витамин',
    benefits: 'Иммунитет',
    effects: 'Недостаток даёт утомляемость',
    minRecommendation: 60,
    optimalRecommendation: 120,
    sourcesInDiet: [{ foodName: 'Шиповник', amount: 50, unit: 'g', contribution: 30 }],
};

describe('Панель подробностей по нутриенту', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        load.mockResolvedValue(FULL);
    });

    it('показывает описание, ориентир, потребление и продукты рациона', async () => {
        render(<NutrientDetailPanel nutrientId="a" onClose={jest.fn()} />);

        await waitFor(() => expect(screen.getByText('Витамин C')).toBeInTheDocument());

        expect(load).toHaveBeenCalledWith('a');
        expect(screen.getByText('45 из 90 мг')).toBeInTheDocument();
        expect(screen.getByText('Водорастворимый витамин')).toBeInTheDocument();
        expect(screen.getByText('Иммунитет')).toBeInTheDocument();
        expect(screen.getByText('Недостаток даёт утомляемость')).toBeInTheDocument();
        expect(screen.getByText('Минимум: 60 мг')).toBeInTheDocument();
        expect(screen.getByText('Оптимально: 120 мг')).toBeInTheDocument();
        expect(screen.getByText('Шиповник')).toBeInTheDocument();
    });

    // Незаполненный справочник не должен превращаться в «минимум 0 мг» и пустые
    // разделы: это выдавало бы отсутствие нормы за норму.
    it('не показывает того, чего справочник не заполнил', async () => {
        load.mockResolvedValue({
            id: 'a',
            name: 'Витамин C',
            unit: 'mg',
            dailyTarget: 90,
            currentIntake: 0,
            sourcesInDiet: [],
        });

        render(<NutrientDetailPanel nutrientId="a" onClose={jest.fn()} />);
        await waitFor(() => expect(screen.getByText('Витамин C')).toBeInTheDocument());

        expect(screen.queryByText('Описание')).not.toBeInTheDocument();
        expect(screen.queryByText('Польза')).not.toBeInTheDocument();
        expect(screen.queryByText(/минимум/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/оптимально/i)).not.toBeInTheDocument();
        expect(screen.getByText(/продуктов с этим нутриентом за день не записано/i))
            .toBeInTheDocument();
    });

    it('сообщает, когда подробности не загрузились', async () => {
        load.mockRejectedValue(new Error('сеть'));

        render(<NutrientDetailPanel nutrientId="a" nutrientName="Витамин C" onClose={jest.fn()} />);

        await waitFor(() =>
            expect(screen.getByRole('alert')).toHaveTextContent(/не удалось загрузить подробности/i)
        );
        // Имя, уже известное вкладке, остаётся видимым: панель не превращается в
        // пустое окно.
        expect(screen.getByText('Витамин C')).toBeInTheDocument();
    });

    it('закрывается', async () => {
        const onClose = jest.fn();
        render(<NutrientDetailPanel nutrientId="a" onClose={onClose} />);
        await waitFor(() => expect(screen.getByText('Витамин C')).toBeInTheDocument());

        await userEvent.click(screen.getByLabelText('Закрыть'));

        expect(onClose).toHaveBeenCalled();
    });
});
