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

    // Две разные причины отсутствия прогресса, и путать их нельзя.
    it('объясняет нулевое потребление отсутствием записей, когда нутриент измеряется', () => {
        render(
            <RecommendationsTab
                recommendations={[VITAMIN_C]}
                currentIntakes={{ a: 0 }}
                hasEntriesToday={false}
            />
        );

        expect(screen.getByText(/за сегодня нет записей о еде/i)).toBeInTheDocument();
    });

    it('говорит, что потребление не считается, когда его неоткуда взять', () => {
        render(<RecommendationsTab recommendations={[VITAMIN_C]} hasEntriesToday={false} />);

        expect(screen.getByText(/содержание витаминов и минералов там известно не у всех/i))
            .toBeInTheDocument();
        // Про записи здесь говорить нельзя: они могут быть, а считать по ним
        // микронутриенты продукт всё равно не умеет.
        expect(screen.queryByText(/за сегодня нет записей о еде/i)).not.toBeInTheDocument();
    });

    describe('норма зависит от профиля', () => {
        const IRON = {
            id: 'fe',
            name: 'Железо',
            category: 'minerals' as const,
            unit: 'mg',
            isWeekly: false,
            isCustom: false,
            normNeedsProfile: true,
        };

        // Железа женщине нужно 18 мг, мужчине 10. Любое из двух, показанное
        // наугад, выглядело бы как ответ.
        it('просит заполнить профиль вместо числа', () => {
            render(<RecommendationsTab recommendations={[IRON]} />);

            expect(screen.getByText(/зависят от пола и возраста/i)).toBeInTheDocument();
            // Пол и дата рождения живут в /settings/body, и ссылка должна вести
            // именно туда: страницы /settings в App Router нет.
            expect(screen.getByText('Заполнить профиль')).toHaveAttribute('href', '/settings/body');
        });

        it('показывает у нутриента причину, а не ноль', () => {
            render(<RecommendationsTab recommendations={[IRON]} />);

            expect(screen.getByText(/норма зависит от пола и возраста/i)).toBeInTheDocument();
            expect(screen.queryByText(/^0 /)).not.toBeInTheDocument();
        });

        it('не просит профиль, когда норма от него не зависит', () => {
            render(<RecommendationsTab recommendations={[{ ...VITAMIN_C, dailyTarget: 100 }]} />);

            expect(screen.queryByText(/зависят от пола и возраста/i)).not.toBeInTheDocument();
        });
    });

    describe('нутриент без измеренного потребления', () => {
        it('показывает норму без полосы прогресса', () => {
            const { container } = render(
                <RecommendationsTab recommendations={[{ ...VITAMIN_C, dailyTarget: 100 }]} />
            );

            expect(screen.getByText('100 мг')).toBeInTheDocument();
            expect(container.querySelector('[role="progressbar"]')).toBeNull();
        });

        it('показывает полосу, когда потребление известно', () => {
            const { container } = render(
                <RecommendationsTab
                    recommendations={[{ ...VITAMIN_C, dailyTarget: 100 }]}
                    currentIntakes={{ a: 45 }}
                />
            );

            expect(screen.getByText('45 / 100 мг')).toBeInTheDocument();
            expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
        });
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

// ============================================================================
// Покрытие
// ============================================================================
//
// Содержание микронутриентов известно не у всех продуктов справочника: у железа
// примерно у 14 %, у витамина E у 2 %. Поэтому величина — нижняя граница, и без
// подписи её прочитают как итог дня.

describe('Вкладка рекомендаций: покрытие', () => {
    const IRON = {
        id: 'fe',
        name: 'Железо',
        category: 'minerals' as const,
        unit: 'mg',
        isWeekly: false,
        isCustom: false,
        dailyTarget: 18,
    };

    it('показывает, по какой части дня посчитано', () => {
        render(
            <RecommendationsTab
                recommendations={[IRON]}
                currentIntakes={{ fe: 6.7 }}
                intakeCoverage={{ fe: { counted: 1, total: 3 } }}
            />
        );

        expect(screen.getByText(/6\.7 \/ 18 мг/)).toBeInTheDocument();
        expect(screen.getByText('по 1 из 3')).toBeInTheDocument();
    });

    it('молчит про покрытие, когда посчитано по всем записям', () => {
        render(
            <RecommendationsTab
                recommendations={[IRON]}
                currentIntakes={{ fe: 6.7 }}
                intakeCoverage={{ fe: { counted: 3, total: 3 } }}
            />
        );

        expect(screen.queryByText(/по 3 из 3/)).not.toBeInTheDocument();
    });

    // Прогресс появился — значит оговорка про «не считаем» больше не нужна.
    it('не говорит «не считаем», когда что-то посчитано', () => {
        render(
            <RecommendationsTab
                recommendations={[IRON]}
                currentIntakes={{ fe: 6.7 }}
                intakeCoverage={{ fe: { counted: 1, total: 3 } }}
            />
        );

        expect(screen.queryByText(/известно не у всех/i)).not.toBeInTheDocument();
    });

    it('называет покрытие для чтения с экрана', () => {
        render(
            <RecommendationsTab
                recommendations={[IRON]}
                currentIntakes={{ fe: 6.7 }}
                intakeCoverage={{ fe: { counted: 1, total: 3 } }}
            />
        );

        expect(screen.getByRole('listitem', { name: /посчитано по 1 из 3 записей/i }))
            .toBeInTheDocument();
    });
});

describe('Вкладка рекомендаций: знаем потребление, но не норму', () => {
    // Норму железа без пола выбрать нельзя, а съеденное известно. Потерять его
    // из-за незаполненного профиля — та же ошибка, только наоборот.
    const IRON_NO_NORM = {
        id: 'fe',
        name: 'Железо',
        category: 'minerals' as const,
        unit: 'mg',
        isWeekly: false,
        isCustom: false,
        normNeedsProfile: true,
    };

    it('показывает съеденное, когда норма не выбрана', () => {
        render(
            <RecommendationsTab
                recommendations={[IRON_NO_NORM]}
                currentIntakes={{ fe: 6 }}
                intakeCoverage={{ fe: { counted: 1, total: 2 } }}
            />
        );

        expect(screen.getByText(/6 мг/)).toBeInTheDocument();
        expect(screen.getByText('по 1 из 2')).toBeInTheDocument();
        // И всё равно объясняет, чего не хватает для нормы.
        expect(screen.getByText(/зависят от пола и возраста/i)).toBeInTheDocument();
    });

    it('не рисует полосу прогресса без нормы', () => {
        const { container } = render(
            <RecommendationsTab
                recommendations={[IRON_NO_NORM]}
                currentIntakes={{ fe: 6 }}
            />
        );

        expect(container.querySelector('[role="progressbar"]')).toBeNull();
    });
});
