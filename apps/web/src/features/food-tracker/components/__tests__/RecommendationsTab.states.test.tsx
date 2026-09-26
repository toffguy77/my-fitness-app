/**
 * Состояния вкладки рекомендаций, появившиеся после соединения с сервером.
 *
 * Прежние тесты вкладки лежат рядом и не правились: компонент не был сломан —
 * он просто монтировался без единого пропса, и все его пропсы необязательные,
 * поэтому ни TypeScript, ни линтер, ни тесты не возражали.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecommendationsTab } from '../RecommendationsTab';
import type { CustomRecommendation, NutrientRecommendation } from '../../types';

const VITAMIN_C: NutrientRecommendation = {
    id: 'a',
    name: 'Витамин C',
    category: 'vitamins',
    dailyTarget: 90,
    unit: 'mg',
    isWeekly: false,
    isCustom: false,
};

describe('Вкладка рекомендаций: состояния', () => {
    it('показывает полученные нутриенты', () => {
        render(
            <RecommendationsTab
                recommendations={[VITAMIN_C]}
                currentIntakes={{ a: 45 }}
            />
        );

        expect(screen.getByText('Витамин C')).toBeInTheDocument();
    });

    // Справочник `nutrient_recommendations` пуст и на dev, и на проде. Пустой
    // экран без объяснения неотличим от поломки.
    it('объясняет, что нормы не заведены, когда справочник пуст', () => {
        render(<RecommendationsTab recommendations={[]} catalogueEmpty />);

        expect(screen.getByText(/нормы по нутриентам пока не заведены/i)).toBeInTheDocument();
        // Настройки тут не помогут: выбирать не из чего.
        expect(screen.queryByText('Нет дневных рекомендаций')).not.toBeInTheDocument();
    });

    it('предлагает настройки, когда справочник не пуст, а нутриенты выключены', () => {
        render(<RecommendationsTab recommendations={[]} catalogueEmpty={false} />);

        expect(screen.getByText('Нет дневных рекомендаций')).toBeInTheDocument();
        expect(screen.queryByText(/нормы по нутриентам пока не заведены/i)).not.toBeInTheDocument();
    });

    it('объясняет нулевое потребление отсутствием записей о еде', () => {
        render(
            <RecommendationsTab recommendations={[VITAMIN_C]} hasEntriesToday={false} />
        );

        expect(screen.getByText(/за сегодня нет записей о еде/i)).toBeInTheDocument();
    });

    it('молчит про записи, когда не знает про них', () => {
        render(<RecommendationsTab recommendations={[VITAMIN_C]} />);

        expect(screen.queryByText(/за сегодня нет записей о еде/i)).not.toBeInTheDocument();
    });

    // Сервер считает потребление за сегодня, а не за выбранный день.
    it('говорит, что потребление показано за сегодня, когда выбран другой день', () => {
        render(<RecommendationsTab recommendations={[VITAMIN_C]} showsOtherDay />);

        expect(screen.getByText(/потребление показано за сегодня/i)).toBeInTheDocument();
    });

    it('сообщает об ошибке загрузки и предлагает повторить', async () => {
        const onRetry = jest.fn();
        render(<RecommendationsTab error="Не удалось загрузить рекомендации." onRetry={onRetry} />);

        expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить');
        await userEvent.click(screen.getByText('Повторить'));

        expect(onRetry).toHaveBeenCalled();
    });

    it('показывает загрузку', () => {
        render(<RecommendationsTab isLoading />);

        expect(screen.getByText('Загрузка...')).toBeInTheDocument();
    });

    describe('своя рекомендация', () => {
        const withoutIntake: CustomRecommendation = {
            id: 'c',
            name: 'Коллаген',
            dailyTarget: 5,
            unit: 'g',
        };

        // Ноль здесь нарисовал бы «0 / 5 г» — человек решил бы, что не добрал,
        // хотя сервер по своим рекомендациям потребление не считает вовсе.
        it('показывает ориентир без прогресса, когда потребление неизвестно', () => {
            render(<RecommendationsTab customRecommendations={[withoutIntake]} />);

            expect(screen.getByText(/5 г — потребление по этой рекомендации не считается/i))
                .toBeInTheDocument();
            expect(screen.queryByText(/^0 \/ 5/)).not.toBeInTheDocument();
        });

        it('показывает прогресс, когда потребление известно', () => {
            render(
                <RecommendationsTab
                    customRecommendations={[{ ...withoutIntake, currentIntake: 2 }]}
                />
            );

            expect(screen.getByText('2 / 5 г')).toBeInTheDocument();
        });
    });
});
