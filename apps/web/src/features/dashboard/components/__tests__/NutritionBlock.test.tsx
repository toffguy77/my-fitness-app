/**
 * Unit tests for NutritionBlock component
 *
 * Tests specific examples, edge cases, and user interactions
 * Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NutritionBlock } from '../NutritionBlock'
import { useDashboardStore } from '../../store/dashboardStore'
import type { DailyMetrics, NutritionData, WeeklyPlan } from '../../types'
import { dashboardStoreValue } from '../../testing/storeValue'
import { getTargets } from '@/features/nutrition-calc/api/nutritionCalc'
import { MACRO_COLORS } from '@/shared/constants/macros'
import { hexToRgb } from '@/shared/testing/cssColor'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
    usePathname: () => '/dashboard',
}))

// Mock the dashboard store
jest.mock('../../store/dashboardStore')
const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>

jest.mock('@/features/nutrition-calc/api/nutritionCalc', () => ({
    getTargets: jest.fn(),
}))
const mockGetTargets = getTargets as jest.MockedFunction<typeof getTargets>


describe('NutritionBlock', () => {
    beforeEach(() => {
        // По умолчанию норма не посчитана: ровно состояние 16 из 18 клиентов
        // на проде.
        mockGetTargets.mockResolvedValue({ targets: null, missing: { profile: true, weight: false } })
    })

    const mockDate = new Date('2024-01-15')
    const mockDateStr = '2024-01-15'

    const mockWeeklyPlan: WeeklyPlan = {
        id: 'plan-1',
        userId: 'user-1',
        curatorId: 'coach-1',
        caloriesGoal: 2000,
        proteinGoal: 150,
        fatGoal: 67,
        carbsGoal: 250,
        stepsGoal: 10000,
        startDate: new Date('2024-01-15'),
        endDate: new Date('2024-01-21'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'coach-1',
    }

    const mockDailyData: DailyMetrics = {
        date: mockDateStr,
        userId: 'user-1',
        nutrition: {
            calories: 1500,
            protein: 120,
            fat: 50,
            carbs: 180,
        },
        weight: null,
        steps: 8000,
        workout: { completed: false },
        completionStatus: {
            nutritionFilled: true,
            weightLogged: false,
            activityCompleted: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    const mockStoreDefaults = {
        selectedDate: mockDate,
        selectedWeek: { start: mockDate, end: mockDate },
        tasks: [],
        isLoading: false,
        error: null,
        isOffline: false,
        pollingIntervalId: null,
        setSelectedDate: jest.fn(),
        navigateWeek: jest.fn(),
        fetchDailyData: jest.fn(),
        fetchWeekData: jest.fn(),
        updateMetric: jest.fn(),
        fetchWeeklyPlan: jest.fn(),
        fetchTasks: jest.fn(),
        updateTaskStatus: jest.fn(),
        submitWeeklyReport: jest.fn(),
        uploadPhoto: jest.fn(),
        pollForUpdates: jest.fn(),
        startPolling: jest.fn(),
        stopPolling: jest.fn(),
        clearError: jest.fn(),
        reset: jest.fn(),
        setOfflineStatus: jest.fn(),
        loadFromCache: jest.fn(),
        syncWhenOnline: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
        // Reset URL to root so navigation assertions start from a clean state
        window.history.pushState({}, '', '/')
    })

    const renderWith = (nutrition: Partial<NutritionData> | undefined, plan: WeeklyPlan | null = mockWeeklyPlan) => {
        mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
            ...mockStoreDefaults,
            dailyData: {
                [mockDateStr]: {
                    ...mockDailyData,
                    nutrition: nutrition === undefined ? (undefined as unknown as NutritionData) : { ...mockDailyData.nutrition, ...nutrition },
                },
            },
            weeklyPlan: plan,
        }))
        return render(<NutritionBlock date={mockDate} />)
    }

    describe('Числа целыми', () => {
        // На стенде: норма 2472.3 по формуле и 549 ккал из записей давали
        // «1923.3000000000002 ккал ещё можно».
        it('калории — целые, остаток считается от того, что видно', () => {
            renderWith({ calories: 548.7000000000001, protein: 38.4, fat: 34.6, carbs: 20.2 }, { ...mockWeeklyPlan, caloriesGoal: 2472.3 })

            expect(screen.getByTestId('calorie-remaining')).toHaveTextContent(/^1923$/)
            expect(screen.getByTestId('calorie-value')).toHaveTextContent(/^549$/)
            expect(screen.getByText(/из 2472/)).not.toHaveTextContent('.')
            expect(document.body.textContent).not.toMatch(/\d\.\d{3,}/)
        })

        it('без нормы съеденное тоже целым', () => {
            renderWith({ calories: 812.49, protein: 41.6, fat: 20.3, carbs: 99.5 }, null)
            expect(screen.getByTestId('calorie-value')).toHaveTextContent(/^812$/)
            expect(document.body.textContent).not.toMatch(/\d\.\d/)
        })
    })

    describe('Быстрая запись с дашборда', () => {
        it.each([
            ['Записать еду', 'search'],
            ['Распознать еду по фото', 'photo'],
            ['Сканировать штрихкод', 'barcode'],
        ])('«%s» открывает дневник сразу на способе %s', async (name, method) => {
            mockPush.mockClear()
            renderWith({})
            await userEvent.click(screen.getByRole('button', { name }))
            expect(mockPush).toHaveBeenCalledWith(`/food-tracker?date=${mockDateStr}&add=${method}`)
        })

        it('после нажатия кнопки недоступны — второй переход не запустится', async () => {
            mockPush.mockClear()
            renderWith({})
            await userEvent.click(screen.getByRole('button', { name: 'Записать еду' }))
            for (const name of ['Записать еду', 'Распознать еду по фото', 'Сканировать штрихкод']) {
                expect(screen.getByRole('button', { name })).toBeDisabled()
            }
            expect(mockPush).toHaveBeenCalledTimes(1)
        })
    })

    describe('Basic Rendering', () => {
        it('показывает заголовок, ссылку на дневник и быструю запись тремя способами', () => {
            renderWith({})

            expect(screen.getByText('Питание')).toBeInTheDocument()
            expect(screen.getByLabelText('Открыть дневник питания')).toHaveAttribute('href', `/food-tracker?date=${mockDateStr}`)
            expect(screen.getByRole('button', { name: 'Записать еду' })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Распознать еду по фото' })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Сканировать штрихкод' })).toBeInTheDocument()
        })

        it('applies custom className when provided', () => {
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: mockWeeklyPlan,
            }))
            const { container } = render(<NutritionBlock date={mockDate} className="custom-class" />)
            expect(container.firstChild).toHaveClass('custom-class')
        })
    })

    describe('Калории', () => {
        it('главное число — остаток, съеденное и норма — подписью', () => {
            renderWith({})

            expect(screen.getByTestId('calorie-remaining')).toHaveTextContent('500')
            expect(screen.getByText('ккал ещё можно', { exact: false })).toBeInTheDocument()
            expect(screen.getByTestId('calorie-value')).toHaveTextContent('1500')
            expect(screen.getByText('из 2000', { exact: false })).toBeInTheDocument()
            expect(screen.getByRole('img', { name: 'Калории: съедено 1500 из 2000, осталось 500' })).toBeInTheDocument()
        })

        it('сверх нормы — превышение со знаком, пометка и предупреждение', () => {
            renderWith({ calories: 2500 })

            expect(screen.getByTestId('calorie-remaining')).toHaveTextContent('+500')
            expect(screen.getByText('ккал сверх нормы', { exact: false })).toBeInTheDocument()
            expect(screen.getByRole('alert')).toHaveTextContent('Превышена дневная норма калорий')
        })

        it('шкала не заполняется больше чем на 100%', () => {
            const { container } = renderWith({ calories: 5000 })
            const arcs = container.querySelectorAll('[role="img"] path')
            expect(arcs[1].getAttribute('stroke-dasharray')).toBe('100 100')
        })

        it('нулевая норма — это не норма: доля от неё не показывается', () => {
            // Ноль калорий как цель давал деление на ноль и оценку «ниже нормы»
            // на любом дне. Такой план — отсутствие нормы.
            renderWith({}, { ...mockWeeklyPlan, caloriesGoal: 0 })

            expect(screen.queryByTestId('calorie-remaining')).not.toBeInTheDocument()
            expect(screen.getByText('Норма не посчитана')).toBeInTheDocument()
        })

        // Раньше здесь проверялся светофор на калориях. Он снят намеренно: цвет в
        // блоке питания опознаёт показатель, а доля от нормы видна остатком и
        // пометкой о превышении.
        it('не окрашивает калории оценкой доли от нормы', () => {
            const seen = new Set<string>()
            ;[1000, 1600, 2000, 2200].forEach((calories) => {
                const { container, unmount } = renderWith({ calories })
                const arc = container.querySelectorAll('[role="img"] path')[1]
                seen.add(`${arc?.getAttribute('stroke')}|${screen.getByTestId('calorie-remaining').className}`)
                unmount()
            })
            expect(seen.size).toBe(1)
        })
    })

    describe('Макросы', () => {
        it('показывает остаток по каждому макросу в граммах и «съедено из нормы»', () => {
            renderWith({})

            const protein = screen.getByTestId('macro-remaining-protein')
            expect(protein).toHaveTextContent('Белки')
            expect(protein).toHaveTextContent('30г')
            expect(protein).toHaveTextContent('120 из 150 г')
            expect(screen.getByTestId('macro-remaining-fat')).toHaveTextContent('17г')
            expect(screen.getByTestId('macro-remaining-carbs')).toHaveTextContent('70г')
        })

        it('сверх нормы остаток не уходит в минус: превышение и пометка', () => {
            renderWith({ protein: 200 })

            const protein = screen.getByTestId('macro-remaining-protein')
            expect(protein).toHaveTextContent('+50г')
            expect(protein).toHaveTextContent('сверх нормы')
        })

        it('полосы названы для экранного диктора', () => {
            renderWith({})

            const bar = screen.getByRole('progressbar', { name: 'Белки: осталось 30 г, съедено 120 из 150 г' })
            expect(bar).toHaveAttribute('aria-valuenow', '120')
            expect(bar).toHaveAttribute('aria-valuemin', '0')
            expect(bar).toHaveAttribute('aria-valuemax', '150')
        })

        // Цвет каждой полосы — цвет её нутриента. Ожидаемое значение берётся из
        // того же модуля, что и реализация: второй цвет жиров, появившись где
        // угодно, уронит этот тест, а не доживёт до прода.
        it('красит заливку каждой полосы цветом её нутриента', () => {
            const { container } = renderWith({})
            const fills = Array.from(container.querySelectorAll<HTMLElement>('[role="progressbar"]'))
                .map((el) => (el.firstElementChild as HTMLElement).style.backgroundColor)

            expect(fills).toEqual([
                hexToRgb(MACRO_COLORS.protein),
                hexToRgb(MACRO_COLORS.fat),
                hexToRgb(MACRO_COLORS.carbs),
            ])
        })

        it('без записей за день остаток равен норме', () => {
            renderWith(undefined)

            expect(screen.getByTestId('calorie-value')).toHaveTextContent('0')
            expect(screen.getByTestId('calorie-remaining')).toHaveTextContent('2000')
            expect(screen.getByTestId('macro-remaining-protein')).toHaveTextContent('150г')
        })
    })

    describe('Без нормы', () => {
        // Этот тест закреплял дефект: без плана куратора и без расчёта
        // показывались 2000/150/67/250 — придуманные числа, выданные за личную
        // норму человека. На проде их видели 16 клиентов из 18.
        it('без плана и без расчёта нормы нет, и придуманная не подставляется', () => {
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: null,
            }))

            render(<NutritionBlock date={mockDate} />)

            expect(screen.queryByText('из 2000 ккал')).not.toBeInTheDocument()
            expect(screen.queryByText('120г / 150г')).not.toBeInTheDocument()
            expect(screen.queryByText('50г / 67г')).not.toBeInTheDocument()
            expect(screen.queryByText('180г / 250г')).not.toBeInTheDocument()

            // Вместо нормы — съеденное числом и приглашение её посчитать.
            expect(screen.getByTestId('calorie-value')).toHaveTextContent('1500')
            expect(screen.getByText('Норма не посчитана')).toBeInTheDocument()
            expect(screen.getByText('Посчитать норму')).toBeInTheDocument()
        })

        // Серый экран новичка и был жалобой, с которой всё началось: до расчёта
        // нормы в блоке питания не было ни одного цвета. Цвет нутриента доли от
        // нормы не сообщает, поэтому показывать его без нормы можно — а кольцо и
        // проценты нельзя, они именно доля.
        it('без нормы съеденное по нутриентам окрашено, но доли от нормы нет', () => {
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: null,
            }))

            const { container } = render(<NutritionBlock date={mockDate} />)

            const amounts = container.querySelector('[data-testid="macros-without-target"]')
            expect(amounts).not.toBeNull()

            const dots = Array.from(
                amounts!.querySelectorAll<HTMLElement>('span[aria-hidden="true"]')
            ).map((el) => el.style.backgroundColor)
            expect(dots).toEqual([
                hexToRgb(MACRO_COLORS.protein),
                hexToRgb(MACRO_COLORS.fat),
                hexToRgb(MACRO_COLORS.carbs),
            ])

            // Ни полос выполнения, ни кольца: и то и другое показывает долю.
            expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(0)
            expect(container.querySelector('[role="img"]')).toBeNull()
        })

        it('норма появляется, как только её стало из чего посчитать', async () => {
            // targetsVersion бампится после сохранения метрики: заполнил вес —
            // норма приехала, и приглашение ушло без перезагрузки страницы.
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: null,
            }))

            const { rerender } = render(<NutritionBlock date={mockDate} />)
            expect(await screen.findByText('Норма не посчитана')).toBeInTheDocument()

            mockGetTargets.mockResolvedValue({
                targets: {
                    calories: 2345,
                    protein: 140,
                    fat: 65,
                    carbs: 240,
                    bmr: 1600,
                    tdee: 2200,
                    workout_bonus: 0,
                    weight_used: 75,
                    source: 'calculated',
                },
                missing: null,
            })
            mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: null,
                targetsVersion: 1,
            }))
            // Тот же день, но новый объект: компонент под `memo`, а стор здесь
            // подменён, и о смене `targetsVersion` React сам не узнает. В
            // приложении об этом сообщает подписка Zustand. Дата не меняется,
            // поэтому эффект перезапускается именно из-за версии целей.
            rerender(<NutritionBlock date={new Date('2024-01-15')} />)

            await waitFor(() => expect(mockGetTargets).toHaveBeenCalledTimes(2))
            expect(await screen.findByTestId('calorie-remaining')).toHaveTextContent('845')
            expect(screen.queryByText('Норма не посчитана')).not.toBeInTheDocument()
        })

    })
})
