/**
 * Test data generators for property-based testing
 * Uses fast-check library for generating test data
 */

import fc from 'fast-check';
import type {
    DailyMetrics,
    NutritionData,
    WorkoutData,
    CompletionStatus,
    ProgressData,
    WeightTrendPoint,
    Achievement,
} from '../types';

/**
 * Generate nutrition data
 */
export const nutritionDataArbitrary = (): fc.Arbitrary<NutritionData> =>
    fc.record({
        calories: fc.nat({ max: 10000 }),
        protein: fc.nat({ max: 1000 }),
        fat: fc.nat({ max: 1000 }),
        carbs: fc.nat({ max: 1000 }),
    });

/**
 * Generate workout data
 */
export const workoutDataArbitrary = (): fc.Arbitrary<WorkoutData> =>
    fc.record({
        completed: fc.boolean(),
        type: fc.option(fc.constantFrom('Силовая', 'Кардио', 'Йога', 'HIIT'), {
            nil: undefined,
        }),
        duration: fc.option(fc.nat({ max: 600 }), { nil: undefined }),
    });

/**
 * Generate completion status
 */
export const completionStatusArbitrary = (): fc.Arbitrary<CompletionStatus> =>
    fc.record({
        nutritionFilled: fc.boolean(),
        weightLogged: fc.boolean(),
        activityCompleted: fc.boolean(),
    });

/**
 * Generate daily metrics for a specific date
 */
export const dailyMetricsArbitrary = (
    date?: Date
): fc.Arbitrary<DailyMetrics> => {
    const dateStr = date
        ? date.toISOString().split('T')[0]
        : fc.date({
            min: new Date('2024-01-01'),
            max: new Date('2024-12-31')
        })
            .filter((d) => !isNaN(d.getTime())) // Filter out invalid dates
            .map((d) => d.toISOString().split('T')[0]);

    return fc.record({
        date: typeof dateStr === 'string' ? fc.constant(dateStr) : dateStr,
        userId: fc.uuid(),
        nutrition: nutritionDataArbitrary(),
        weight: fc.option(fc.float({ min: Math.fround(0.1), max: Math.fround(500), noNaN: true }), {
            nil: null,
        }),
        steps: fc.nat({ max: 100000 }),
        workout: workoutDataArbitrary(),
        completionStatus: completionStatusArbitrary(),
        createdAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }).filter((d) => !isNaN(d.getTime())),
        updatedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }).filter((d) => !isNaN(d.getTime())),
    });
};

/**
 * Generate daily metrics with specific completion status
 */
export const dailyMetricsWithCompletionArbitrary = (
    date: Date,
    completionStatus: CompletionStatus
): fc.Arbitrary<DailyMetrics> =>
    fc.record({
        date: fc.constant(date.toISOString().split('T')[0]),
        userId: fc.uuid(),
        nutrition: nutritionDataArbitrary(),
        weight: fc.option(fc.float({ min: Math.fround(0.1), max: Math.fround(500), noNaN: true }), {
            nil: null,
        }),
        steps: fc.nat({ max: 100000 }),
        workout: workoutDataArbitrary(),
        completionStatus: fc.constant(completionStatus),
        createdAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }).filter((d) => !isNaN(d.getTime())),
        updatedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }).filter((d) => !isNaN(d.getTime())),
    });

/**
 * Generate a week of daily metrics (7 days)
 */
export const weekOfDailyMetricsArbitrary = (
    weekStart: Date
): fc.Arbitrary<Record<string, DailyMetrics>> => {
    const days: fc.Arbitrary<[string, DailyMetrics]>[] = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];

        days.push(
            dailyMetricsArbitrary(date).map((metrics) => [dateStr, metrics])
        );
    }

    return fc.tuple(...days).map((entries) => Object.fromEntries(entries));
};


/**
 * Generate weight trend point
 */
export const weightTrendPointArbitrary = (): fc.Arbitrary<WeightTrendPoint> =>
    fc.record({
        date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }).filter((d) => !isNaN(d.getTime())),
        weight: fc.float({ min: Math.fround(40), max: Math.fround(200), noNaN: true }),
    });

/**
 * Generate achievement
 */
export const achievementArbitrary = (): fc.Arbitrary<Achievement> =>
    fc.record({
        id: fc.uuid(),
        title: fc.constantFrom(
            'Первая неделя',
            '7 дней подряд',
            'Цель достигнута',
            'Месяц прогресса',
            'Идеальная неделя'
        ),
        description: fc.constantFrom(
            'Отслеживали питание 7 дней подряд',
            'Выполнили все цели недели',
            'Достигли целевого веса',
            'Месяц регулярных тренировок',
            'Соблюдали план питания 100%'
        ),
        achievedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }).filter((d) => !isNaN(d.getTime())),
        icon: fc.option(fc.constantFrom('🏆', '⭐', '🎯', '💪', '🔥'), { nil: undefined }),
    });

/**
 * Generate progress data with at least 3 weight trend points
 */
export const progressDataArbitrary = (): fc.Arbitrary<ProgressData> =>
    fc.record({
        weightTrend: fc.array(weightTrendPointArbitrary(), { minLength: 3, maxLength: 28 }), // 3-28 days (4 weeks)
        nutritionAdherence: fc.float({ min: 0, max: 100, noNaN: true }),
        achievements: fc.array(achievementArbitrary(), { minLength: 0, maxLength: 10 }),
    });

/**
 * Generate progress data with insufficient data (< 3 weight points)
 */
export const insufficientProgressDataArbitrary = (): fc.Arbitrary<ProgressData> =>
    fc.record({
        weightTrend: fc.array(weightTrendPointArbitrary(), { minLength: 0, maxLength: 2 }),
        nutritionAdherence: fc.constant(0),
        achievements: fc.constant([]),
    });
