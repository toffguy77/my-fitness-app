/**
 * Tests for dashboard test data generators
 * Validates that generators produce valid data for property-based testing
 */

import fc from 'fast-check';
import {
    nutritionDataArbitrary,
    workoutDataArbitrary,
    completionStatusArbitrary,
    dailyMetricsArbitrary,
    dailyMetricsWithCompletionArbitrary,
    weekOfDailyMetricsArbitrary,
} from '../generators';
import {
    nutritionDataSchema,
    workoutDataSchema,
    completionStatusSchema,
    dailyMetricsSchema,
} from '../../types';

describe('Dashboard Test Generators', () => {
    describe('nutritionDataArbitrary', () => {
        it('generates valid nutrition data', () => {
            fc.assert(
                fc.property(nutritionDataArbitrary(), (nutritionData) => {
                    // Should validate against schema
                    const result = nutritionDataSchema.safeParse(nutritionData);
                    return result.success;
                }),
                { numRuns: 100 }
            );
        });

        it('generates nutrition data within expected ranges', () => {
            fc.assert(
                fc.property(nutritionDataArbitrary(), (nutritionData) => {
                    return (
                        nutritionData.calories >= 0 &&
                        nutritionData.calories <= 10000 &&
                        nutritionData.protein >= 0 &&
                        nutritionData.protein <= 1000 &&
                        nutritionData.fat >= 0 &&
                        nutritionData.fat <= 1000 &&
                        nutritionData.carbs >= 0 &&
                        nutritionData.carbs <= 1000
                    );
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('workoutDataArbitrary', () => {
        it('generates valid workout data', () => {
            fc.assert(
                fc.property(workoutDataArbitrary(), (workoutData) => {
                    const result = workoutDataSchema.safeParse(workoutData);
                    return result.success;
                }),
                { numRuns: 100 }
            );
        });

        it('generates workout data with correct optional fields', () => {
            fc.assert(
                fc.property(workoutDataArbitrary(), (workoutData) => {
                    // completed is always present
                    const hasCompleted = typeof workoutData.completed === 'boolean';

                    // type is optional
                    const typeValid = workoutData.type === undefined ||
                        ['Силовая', 'Кардио', 'Йога', 'HIIT'].includes(workoutData.type);

                    // duration is optional and within range
                    const durationValid = workoutData.duration === undefined ||
                        (workoutData.duration >= 0 && workoutData.duration <= 600);

                    return hasCompleted && typeValid && durationValid;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('completionStatusArbitrary', () => {
        it('generates valid completion status', () => {
            fc.assert(
                fc.property(completionStatusArbitrary(), (completionStatus) => {
                    const result = completionStatusSchema.safeParse(completionStatus);
                    return result.success;
                }),
                { numRuns: 100 }
            );
        });

        it('generates completion status with all boolean fields', () => {
            fc.assert(
                fc.property(completionStatusArbitrary(), (completionStatus) => {
                    return (
                        typeof completionStatus.nutritionFilled === 'boolean' &&
                        typeof completionStatus.weightLogged === 'boolean' &&
                        typeof completionStatus.activityCompleted === 'boolean'
                    );
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('dailyMetricsArbitrary', () => {
        it('generates valid daily metrics without specific date', () => {
            fc.assert(
                fc.property(dailyMetricsArbitrary(), (dailyMetrics) => {
                    const result = dailyMetricsSchema.safeParse(dailyMetrics);
                    return result.success;
                }),
                { numRuns: 50 } // Reduced runs for complex object
            );
        });

        it('generates daily metrics with specific date', () => {
            const testDate = new Date('2024-06-15');
            const expectedDateStr = '2024-06-15';

            fc.assert(
                fc.property(dailyMetricsArbitrary(testDate), (dailyMetrics) => {
                    return dailyMetrics.date === expectedDateStr;
                }),
                { numRuns: 50 }
            );
        });

        it('generates daily metrics with valid weight values', () => {
            fc.assert(
                fc.property(dailyMetricsArbitrary(), (dailyMetrics) => {
                    return (
                        dailyMetrics.weight === null ||
                        (dailyMetrics.weight >= 0.1 && dailyMetrics.weight <= 500)
                    );
                }),
                { numRuns: 50 }
            );
        });

        it('generates daily metrics with valid steps', () => {
            fc.assert(
                fc.property(dailyMetricsArbitrary(), (dailyMetrics) => {
                    return dailyMetrics.steps >= 0 && dailyMetrics.steps <= 100000;
                }),
                { numRuns: 50 }
            );
        });
    });

    describe('dailyMetricsWithCompletionArbitrary', () => {
        it('generates daily metrics with specified completion status', () => {
            const testDate = new Date('2024-06-15');
            const testCompletion = {
                nutritionFilled: true,
                weightLogged: false,
                activityCompleted: true,
            };

            fc.assert(
                fc.property(
                    dailyMetricsWithCompletionArbitrary(testDate, testCompletion),
                    (dailyMetrics) => {
                        return (
                            dailyMetrics.date === '2024-06-15' &&
                            dailyMetrics.completionStatus.nutritionFilled === true &&
                            dailyMetrics.completionStatus.weightLogged === false &&
                            dailyMetrics.completionStatus.activityCompleted === true
                        );
                    }
                ),
                { numRuns: 50 }
            );
        });
    });

    describe('weekOfDailyMetricsArbitrary', () => {
        it('generates exactly 7 days of metrics', () => {
            const weekStart = new Date('2024-06-10'); // Monday

            fc.assert(
                fc.property(
                    weekOfDailyMetricsArbitrary(weekStart),
                    (weekMetrics) => {
                        const keys = Object.keys(weekMetrics);
                        return keys.length === 7;
                    }
                ),
                { numRuns: 20 } // Reduced runs for complex object
            );
        });

        it('generates metrics for consecutive dates', () => {
            const weekStart = new Date('2024-06-10'); // Monday

            fc.assert(
                fc.property(
                    weekOfDailyMetricsArbitrary(weekStart),
                    (weekMetrics) => {
                        const keys = Object.keys(weekMetrics).sort();
                        const expectedDates = [];

                        for (let i = 0; i < 7; i++) {
                            const date = new Date(weekStart);
                            date.setDate(weekStart.getDate() + i);
                            expectedDates.push(date.toISOString().split('T')[0]);
                        }

                        expectedDates.sort();

                        return JSON.stringify(keys) === JSON.stringify(expectedDates);
                    }
                ),
                { numRuns: 20 }
            );
        });

        it('generates valid daily metrics for each day', () => {
            const weekStart = new Date('2024-06-10');

            fc.assert(
                fc.property(
                    weekOfDailyMetricsArbitrary(weekStart),
                    (weekMetrics) => {
                        return Object.values(weekMetrics).every((dailyMetrics) => {
                            const result = dailyMetricsSchema.safeParse(dailyMetrics);
                            return result.success;
                        });
                    }
                ),
                { numRuns: 10 } // Reduced runs for very complex validation
            );
        });

        it('generates metrics with correct date strings matching keys', () => {
            const weekStart = new Date('2024-06-10');

            fc.assert(
                fc.property(
                    weekOfDailyMetricsArbitrary(weekStart),
                    (weekMetrics) => {
                        return Object.entries(weekMetrics).every(([dateKey, metrics]) => {
                            return dateKey === metrics.date;
                        });
                    }
                ),
                { numRuns: 20 }
            );
        });
    });

    describe('Edge Cases', () => {
        it('handles boundary dates correctly', () => {
            const boundaryDates = [
                new Date('2024-01-01'), // Start of year
                new Date('2024-12-31'), // End of year
                new Date('2024-02-29'), // Leap year
            ];

            boundaryDates.forEach((date) => {
                fc.assert(
                    fc.property(dailyMetricsArbitrary(date), (dailyMetrics) => {
                        const expectedDateStr = date.toISOString().split('T')[0];
                        return dailyMetrics.date === expectedDateStr;
                    }),
                    { numRuns: 10 }
                );
            });
        });

        it('handles week boundaries correctly', () => {
            // Test week that spans month boundary
            const weekStart = new Date('2024-06-30'); // Sunday -> next week starts Monday July 1

            fc.assert(
                fc.property(
                    weekOfDailyMetricsArbitrary(weekStart),
                    (weekMetrics) => {
                        const keys = Object.keys(weekMetrics);
                        return keys.length === 7;
                    }
                ),
                { numRuns: 10 }
            );
        });
    });
});
