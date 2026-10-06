/**
 * KBZHUSummary Component Unit Tests
 *
 * Tests for КБЖУ display, progress bars, and color coding.
 *
 * @module food-tracker/components/__tests__/KBZHUSummary.test
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { KBZHUSummary } from '../KBZHUSummary';
import type { KBZHU } from '../../types';
import { MACRO_COLORS } from '@/shared/constants/macros';
import { hexToRgb } from '@/shared/testing/cssColor';

// ============================================================================
// Test Helpers
// ============================================================================

const createKBZHU = (
    calories: number,
    protein: number,
    fat: number,
    carbs: number
): KBZHU => ({
    calories,
    protein,
    fat,
    carbs,
});

// ============================================================================
// Tests
// ============================================================================

describe('KBZHUSummary', () => {
    const target = createKBZHU(2000, 150, 80, 250);

    describe('Калории', () => {
        it('говорит фразой: съедено из нормы', () => {
            render(<KBZHUSummary current={createKBZHU(1500, 100, 60, 180)} target={target} />);
            expect(screen.getByTestId('kbzhu-calories')).toHaveTextContent('Съедено 1500 из 2000 ккал');
            expect(screen.getByRole('progressbar', { name: 'Калории: съедено 1500 из 2000' })).toBeInTheDocument();
        });

        it('округляет до целых', () => {
            render(<KBZHUSummary current={createKBZHU(1523.6, 99.6, 60, 180)} target={target} />);
            expect(screen.getByTestId('kbzhu-calories')).toHaveTextContent('Съедено 1524 из 2000 ккал');
            expect(screen.getByTestId('macro-remaining-protein')).toHaveTextContent('50г');
        });

        it('сверх нормы — отдельная пометка, полоса не перекрашивается', () => {
            render(<KBZHUSummary current={createKBZHU(2300, 100, 60, 180)} target={target} />);
            expect(screen.getByRole('status')).toHaveTextContent('Сверх нормы на 300 ккал');
            expect(screen.getByRole('progressbar', { name: /Калории/ })).toHaveAttribute('aria-valuenow', '2300');
        });

        it('без нормы — только съеденное, без полосы и без «из»', () => {
            render(<KBZHUSummary current={createKBZHU(1500, 100, 60, 180)} target={null} />);
            expect(screen.getByTestId('kbzhu-calories')).toHaveTextContent('Съедено 1500 ккал');
            expect(screen.queryByText(/из 2000/)).not.toBeInTheDocument();
            expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
        });

        it('нулевая норма — не норма', () => {
            render(<KBZHUSummary current={createKBZHU(1500, 100, 60, 180)} target={createKBZHU(0, 0, 0, 0)} />);
            expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
        });
    });

    describe('Макросы', () => {
        it('показывает остаток в граммах и «съедено из нормы» для каждого', () => {
            render(<KBZHUSummary current={createKBZHU(1500, 100, 60, 180)} target={target} />);
            expect(screen.getByText('Белки')).toBeInTheDocument();
            expect(screen.getByText('Жиры')).toBeInTheDocument();
            expect(screen.getByText('Углеводы')).toBeInTheDocument();
            expect(screen.getByTestId('macro-remaining-protein')).toHaveTextContent('50г');
            expect(screen.getByTestId('macro-remaining-protein')).toHaveTextContent('100 из 150');
            expect(screen.getByTestId('macro-remaining-fat')).toHaveTextContent('20г');
            expect(screen.getByTestId('macro-remaining-carbs')).toHaveTextContent('70г');
        });

        it('нет нормы по одному макросу — по нему съеденное без полосы', () => {
            render(<KBZHUSummary current={createKBZHU(1500, 100, 60, 180)} target={{ calories: 2000, fat: 80 }} />);
            expect(screen.getByTestId('macro-remaining-protein')).toHaveTextContent('100г');
            expect(screen.getByTestId('macro-remaining-protein')).toHaveTextContent('съедено');
            expect(screen.getByTestId('macro-remaining-fat')).toHaveTextContent('20г');
            // калории и жиры
            expect(screen.getAllByRole('progressbar')).toHaveLength(2);
        });

        it('сверх нормы по макросу — превышение со знаком плюс', () => {
            render(<KBZHUSummary current={createKBZHU(1500, 170, 60, 180)} target={target} />);
            expect(screen.getByTestId('macro-remaining-protein')).toHaveTextContent('+20г');
            expect(screen.getByTestId('macro-remaining-protein')).toHaveTextContent('сверх нормы');
        });
    });

    // Прежде здесь проверялся светофор: заливка зеленела, желтела и краснела по
    // доле от нормы. Он снят намеренно — цвет опознаёт нутриент, и пока он же
    // оценивал выполнение нормы, две работы сталкивались. Выполнение нормы
    // по-прежнему видно: уровнем заполнения, процентом, красным числом и
    // стрелкой при превышении.
    describe('Цвет опознаёт нутриент', () => {
        // Ожидаемые значения берутся из того же модуля, что и реализация. Второй
        // цвет жиров, появившись где угодно, уронит этот тест: именно так и
        // дожило до прода расхождение `#f59e0b` на дашборде против `#eab308`
        // здесь.
        function fills(container: HTMLElement): string[] {
            return Array.from(
                container.querySelectorAll<HTMLElement>('[role="progressbar"] > div')
            ).map((el) => el.style.backgroundColor);
        }

        it('красит заливку цветом нутриента', () => {
            const { container } = render(
                <KBZHUSummary
                    current={createKBZHU(1600, 120, 64, 200)}
                    target={createKBZHU(2000, 150, 80, 250)}
                />
            );

            // Первая полоса — калории: они не нутриент и опознанию не подлежат.
            expect(fills(container).slice(1)).toEqual([
                hexToRgb(MACRO_COLORS.protein),
                hexToRgb(MACRO_COLORS.fat),
                hexToRgb(MACRO_COLORS.carbs),
            ]);
        });

        it('не меняет цвет при любой доле от нормы', () => {
            const target = createKBZHU(2000, 150, 80, 250);
            const shares = [
                createKBZHU(800, 60, 32, 100), // 40%
                createKBZHU(1600, 120, 64, 200), // 80%
                createKBZHU(2000, 150, 80, 250), // 100%
                createKBZHU(2500, 190, 100, 320), // свыше 120%
            ];

            const seen = new Set<string>();
            shares.forEach((current) => {
                const { container, unmount } = render(
                    <KBZHUSummary current={current} target={target} />
                );
                seen.add(fills(container).join('|'));
                unmount();
            });

            expect(seen.size).toBe(1);
        });

        it('не оставляет светофорных классов на полосах', () => {
            const { container } = render(
                <KBZHUSummary
                    current={createKBZHU(2500, 190, 100, 320)}
                    target={createKBZHU(2000, 150, 80, 250)}
                />
            );

            expect(container.querySelectorAll('.bg-danger')).toHaveLength(0);
            expect(container.querySelectorAll('.bg-warning')).toHaveLength(0);
            expect(container.querySelectorAll('.bg-success')).toHaveLength(0);
        });
    });

    describe('Доступность', () => {
        it('является областью с названием', () => {
            render(<KBZHUSummary current={createKBZHU(1500, 100, 60, 180)} target={target} />);
            expect(screen.getByRole('region', { name: 'Сводка КБЖУ за день' })).toBeInTheDocument();
            expect(screen.getByText('Дневная норма')).toBeInTheDocument();
        });

        it('называет каждую полосу', () => {
            render(<KBZHUSummary current={createKBZHU(1500, 100, 60, 180)} target={target} />);
            const bars = screen.getAllByRole('progressbar');
            expect(bars).toHaveLength(4);
            bars.forEach((bar) => {
                expect(bar).toHaveAttribute('aria-valuemin', '0');
                expect(bar).toHaveAttribute('aria-label');
            });
            expect(screen.getByRole('progressbar', { name: 'Белки: осталось 50 г, съедено 100 из 150 г' })).toBeInTheDocument();
        });

        it('applies custom className to container', () => {
            const { container } = render(
                <KBZHUSummary current={createKBZHU(1500, 100, 60, 180)} target={target} className="custom-class" />
            );
            expect(container.firstChild).toHaveClass('custom-class');
        });
    });
});
