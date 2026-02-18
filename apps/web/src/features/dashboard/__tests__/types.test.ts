/**
 * Tests for dashboard type definitions and validation schemas
 */

import {
    nutritionDataSchema,
    workoutDataSchema,
    completionStatusSchema,
    dailyMetricsSchema,
    weeklyPlanSchema,
    taskSchema,
    weeklyReportSummarySchema,
    weeklyReportSchema,
    photoDataSchema,
    metricUpdateSchema,
    type NutritionData,
    type WorkoutData,
    type DailyMetrics,
    type WeeklyPlan,
    type Task,
    type WeeklyReport,
    type PhotoData,
    type MetricUpdate,
    type WeightTrendPoint,
    type Achievement,
    type ProgressData,
} from '../types'

describe('Dashboard Types - Validation Schemas', () => {
    describe('nutritionDataSchema', () => {
        it('validates correct nutrition data', () => {
            const validData: NutritionData = {
                calories: 2000,
                protein: 150,
                fat: 70,
                carbs: 250,
            }

            const result = nutritionDataSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('rejects negative calories', () => {
            const invalidData = {
                calories: -100,
                protein: 150,
                fat: 70,
                carbs: 250,
            }

            const result = nutritionDataSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('rejects calories exceeding maximum', () => {
            const invalidData = {
                calories: 15000,
                protein: 150,
                fat: 70,
                carbs: 250,
            }

            const result = nutritionDataSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('accepts zero values', () => {
            const validData: NutritionData = {
                calories: 0,
                protein: 0,
                fat: 0,
                carbs: 0,
            }

            const result = nutritionDataSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('rejects missing required fields', () => {
            const invalidData = {
                calories: 2000,
                protein: 150,
            }

            const result = nutritionDataSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })
    })

    describe('workoutDataSchema', () => {
        it('validates completed workout with details', () => {
            const validData: WorkoutData = {
                completed: true,
                type: 'strength',
                duration: 60,
            }

            const result = workoutDataSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('validates incomplete workout without details', () => {
            const validData: WorkoutData = {
                completed: false,
            }

            const result = workoutDataSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('rejects negative duration', () => {
            const invalidData = {
                completed: true,
                type: 'cardio',
                duration: -30,
            }

            const result = workoutDataSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('rejects duration exceeding maximum', () => {
            const invalidData = {
                completed: true,
                type: 'endurance',
                duration: 700,
            }

            const result = workoutDataSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })
    })

    describe('completionStatusSchema', () => {
        it('validates all completion flags', () => {
            const validData = {
                nutritionFilled: true,
                weightLogged: false,
                activityCompleted: true,
            }

            const result = completionStatusSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('rejects missing fields', () => {
            const invalidData = {
                nutritionFilled: true,
            }

            const result = completionStatusSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })
    })

    describe('dailyMetricsSchema', () => {
        it('validates complete daily metrics', () => {
            const validData: DailyMetrics = {
                date: '2024-01-29',
                userId: 'user-123',
                nutrition: {
                    calories: 2000,
                    protein: 150,
                    fat: 70,
                    carbs: 250,
                },
                weight: 75.5,
                steps: 10000,
                workout: {
                    completed: true,
                    type: 'strength',
                    duration: 60,
                },
                completionStatus: {
                    nutritionFilled: true,
                    weightLogged: true,
                    activityCompleted: true,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = dailyMetricsSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('validates metrics with null weight', () => {
            const validData = {
                date: '2024-01-29',
                userId: 'user-123',
                nutrition: {
                    calories: 2000,
                    protein: 150,
                    fat: 70,
                    carbs: 250,
                },
                weight: null,
                steps: 10000,
                workout: {
                    completed: false,
                },
                completionStatus: {
                    nutritionFilled: true,
                    weightLogged: false,
                    activityCompleted: false,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = dailyMetricsSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('rejects invalid date format', () => {
            const invalidData = {
                date: '29-01-2024',
                userId: 'user-123',
                nutrition: { calories: 2000, protein: 150, fat: 70, carbs: 250 },
                weight: 75.5,
                steps: 10000,
                workout: { completed: false },
                completionStatus: { nutritionFilled: true, weightLogged: true, activityCompleted: false },
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = dailyMetricsSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('rejects weight below minimum', () => {
            const invalidData = {
                date: '2024-01-29',
                userId: 'user-123',
                nutrition: { calories: 2000, protein: 150, fat: 70, carbs: 250 },
                weight: 0.05,
                steps: 10000,
                workout: { completed: false },
                completionStatus: { nutritionFilled: true, weightLogged: true, activityCompleted: false },
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = dailyMetricsSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('rejects steps exceeding maximum', () => {
            const invalidData = {
                date: '2024-01-29',
                userId: 'user-123',
                nutrition: { calories: 2000, protein: 150, fat: 70, carbs: 250 },
                weight: 75.5,
                steps: 150000,
                workout: { completed: false },
                completionStatus: { nutritionFilled: true, weightLogged: true, activityCompleted: false },
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = dailyMetricsSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })
    })

    describe('weeklyPlanSchema', () => {
        it('validates complete weekly plan', () => {
            const validData: WeeklyPlan = {
                id: 'plan-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                caloriesGoal: 2000,
                proteinGoal: 150,
                fatGoal: 70,
                carbsGoal: 250,
                stepsGoal: 10000,
                startDate: new Date('2024-01-29'),
                endDate: new Date('2024-02-04'),
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: 'curator-456',
            }

            const result = weeklyPlanSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('validates plan with optional fields omitted', () => {
            const validData = {
                id: 'plan-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                caloriesGoal: 2000,
                proteinGoal: 150,
                startDate: new Date('2024-01-29'),
                endDate: new Date('2024-02-04'),
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: 'curator-456',
            }

            const result = weeklyPlanSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('rejects end date before start date', () => {
            const invalidData = {
                id: 'plan-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                caloriesGoal: 2000,
                proteinGoal: 150,
                startDate: new Date('2024-02-04'),
                endDate: new Date('2024-01-29'),
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: 'curator-456',
            }

            const result = weeklyPlanSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('accepts same start and end date', () => {
            const validData = {
                id: 'plan-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                caloriesGoal: 2000,
                proteinGoal: 150,
                startDate: new Date('2024-01-29'),
                endDate: new Date('2024-01-29'),
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: 'curator-456',
            }

            const result = weeklyPlanSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })
    })

    describe('taskSchema', () => {
        it('validates active task', () => {
            const validData: Task = {
                id: 'task-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                title: 'Complete workout plan',
                description: 'Follow the strength training routine',
                weekNumber: 1,
                assignedAt: new Date('2024-01-29'),
                dueDate: new Date('2024-02-04'),
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = taskSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('validates completed task with completion date', () => {
            const validData: Task = {
                id: 'task-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                title: 'Complete workout plan',
                description: 'Follow the strength training routine',
                weekNumber: 1,
                assignedAt: new Date('2024-01-29'),
                dueDate: new Date('2024-02-04'),
                completedAt: new Date('2024-02-03'),
                status: 'completed',
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = taskSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('rejects empty title', () => {
            const invalidData = {
                id: 'task-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                title: '',
                description: 'Follow the strength training routine',
                weekNumber: 1,
                assignedAt: new Date(),
                dueDate: new Date(),
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = taskSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('rejects title exceeding maximum length', () => {
            const invalidData = {
                id: 'task-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                title: 'a'.repeat(201),
                description: 'Description',
                weekNumber: 1,
                assignedAt: new Date(),
                dueDate: new Date(),
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = taskSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('rejects invalid week number', () => {
            const invalidData = {
                id: 'task-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                title: 'Task',
                description: 'Description',
                weekNumber: 0,
                assignedAt: new Date(),
                dueDate: new Date(),
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = taskSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('rejects invalid status', () => {
            const invalidData = {
                id: 'task-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                title: 'Task',
                description: 'Description',
                weekNumber: 1,
                assignedAt: new Date(),
                dueDate: new Date(),
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = taskSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })
    })

    describe('weeklyReportSummarySchema', () => {
        it('validates complete summary', () => {
            const validData = {
                daysWithNutrition: 7,
                daysWithWeight: 6,
                daysWithActivity: 5,
                averageCalories: 2000,
                averageWeight: 75.5,
                totalSteps: 70000,
                workoutsCompleted: 4,
            }

            const result = weeklyReportSummarySchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('rejects days exceeding maximum', () => {
            const invalidData = {
                daysWithNutrition: 8,
                daysWithWeight: 6,
                daysWithActivity: 5,
                averageCalories: 2000,
                averageWeight: 75.5,
                totalSteps: 70000,
                workoutsCompleted: 4,
            }

            const result = weeklyReportSummarySchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('accepts zero values', () => {
            const validData = {
                daysWithNutrition: 0,
                daysWithWeight: 0,
                daysWithActivity: 0,
                averageCalories: 0,
                averageWeight: 0,
                totalSteps: 0,
                workoutsCompleted: 0,
            }

            const result = weeklyReportSummarySchema.safeParse(validData)
            expect(result.success).toBe(true)
        })
    })

    describe('weeklyReportSchema', () => {
        it('validates complete weekly report', () => {
            const validData: WeeklyReport = {
                id: 'report-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                weekStart: new Date('2024-01-29'),
                weekEnd: new Date('2024-02-04'),
                weekNumber: 5,
                summary: {
                    daysWithNutrition: 7,
                    daysWithWeight: 6,
                    daysWithActivity: 5,
                    averageCalories: 2000,
                    averageWeight: 75.5,
                    totalSteps: 70000,
                    workoutsCompleted: 4,
                },
                photoUrl: 'https://example.com/photo.jpg',
                submittedAt: new Date(),
                reviewedAt: new Date(),
                curatorFeedback: 'Great progress!',
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = weeklyReportSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('validates report without optional fields', () => {
            const validData = {
                id: 'report-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                weekStart: new Date('2024-01-29'),
                weekEnd: new Date('2024-02-04'),
                weekNumber: 5,
                summary: {
                    daysWithNutrition: 7,
                    daysWithWeight: 6,
                    daysWithActivity: 5,
                    averageCalories: 2000,
                    averageWeight: 75.5,
                    totalSteps: 70000,
                    workoutsCompleted: 4,
                },
                submittedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = weeklyReportSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('rejects week end before week start', () => {
            const invalidData = {
                id: 'report-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                weekStart: new Date('2024-02-04'),
                weekEnd: new Date('2024-01-29'),
                weekNumber: 5,
                summary: {
                    daysWithNutrition: 7,
                    daysWithWeight: 6,
                    daysWithActivity: 5,
                    averageCalories: 2000,
                    averageWeight: 75.5,
                    totalSteps: 70000,
                    workoutsCompleted: 4,
                },
                submittedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = weeklyReportSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('rejects invalid photo URL', () => {
            const invalidData = {
                id: 'report-123',
                userId: 'user-123',
                curatorId: 'curator-456',
                weekStart: new Date('2024-01-29'),
                weekEnd: new Date('2024-02-04'),
                weekNumber: 5,
                summary: {
                    daysWithNutrition: 7,
                    daysWithWeight: 6,
                    daysWithActivity: 5,
                    averageCalories: 2000,
                    averageWeight: 75.5,
                    totalSteps: 70000,
                    workoutsCompleted: 4,
                },
                photoUrl: 'not-a-url',
                submittedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const result = weeklyReportSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })
    })

    describe('photoDataSchema', () => {
        it('validates complete photo data', () => {
            const validData: PhotoData = {
                id: 'photo-123',
                userId: 'user-123',
                weekStart: new Date('2024-01-29'),
                weekEnd: new Date('2024-02-04'),
                weekIdentifier: '2024-W05',
                photoUrl: 'https://example.com/photo.jpg',
                fileSize: 1024000,
                mimeType: 'image/jpeg',
                uploadedAt: new Date(),
                createdAt: new Date(),
            }

            const result = photoDataSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('validates PNG format', () => {
            const validData: PhotoData = {
                id: 'photo-123',
                userId: 'user-123',
                weekStart: new Date('2024-01-29'),
                weekEnd: new Date('2024-02-04'),
                weekIdentifier: '2024-W05',
                photoUrl: 'https://example.com/photo.png',
                fileSize: 2048000,
                mimeType: 'image/png',
                uploadedAt: new Date(),
                createdAt: new Date(),
            }

            const result = photoDataSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('validates WebP format', () => {
            const validData: PhotoData = {
                id: 'photo-123',
                userId: 'user-123',
                weekStart: new Date('2024-01-29'),
                weekEnd: new Date('2024-02-04'),
                weekIdentifier: '2024-W05',
                photoUrl: 'https://example.com/photo.webp',
                fileSize: 512000,
                mimeType: 'image/webp',
                uploadedAt: new Date(),
                createdAt: new Date(),
            }

            const result = photoDataSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('rejects invalid week identifier format', () => {
            const invalidData = {
                id: 'photo-123',
                userId: 'user-123',
                weekStart: new Date('2024-01-29'),
                weekEnd: new Date('2024-02-04'),
                weekIdentifier: '2024-5',
                photoUrl: 'https://example.com/photo.jpg',
                fileSize: 1024000,
                mimeType: 'image/jpeg',
                uploadedAt: new Date(),
                createdAt: new Date(),
            }

            const result = photoDataSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('rejects file size exceeding maximum', () => {
            const invalidData = {
                id: 'photo-123',
                userId: 'user-123',
                weekStart: new Date('2024-01-29'),
                weekEnd: new Date('2024-02-04'),
                weekIdentifier: '2024-W05',
                photoUrl: 'https://example.com/photo.jpg',
                fileSize: 11 * 1024 * 1024,
                mimeType: 'image/jpeg',
                uploadedAt: new Date(),
                createdAt: new Date(),
            }

            const result = photoDataSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('rejects unsupported MIME type', () => {
            const invalidData = {
                id: 'photo-123',
                userId: 'user-123',
                weekStart: new Date('2024-01-29'),
                weekEnd: new Date('2024-02-04'),
                weekIdentifier: '2024-W05',
                photoUrl: 'https://example.com/photo.gif',
                fileSize: 1024000,
                mimeType: 'image/gif',
                uploadedAt: new Date(),
                createdAt: new Date(),
            }

            const result = photoDataSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })
    })

    describe('metricUpdateSchema', () => {
        it('validates nutrition update', () => {
            const validData: MetricUpdate = {
                type: 'nutrition',
                data: {
                    calories: 2000,
                    protein: 150,
                    fat: 70,
                    carbs: 250,
                },
            }

            const result = metricUpdateSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('validates weight update', () => {
            const validData: MetricUpdate = {
                type: 'weight',
                data: {
                    weight: 75.5,
                },
            }

            const result = metricUpdateSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('validates steps update', () => {
            const validData: MetricUpdate = {
                type: 'steps',
                data: {
                    steps: 10000,
                },
            }

            const result = metricUpdateSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('validates workout update', () => {
            const validData: MetricUpdate = {
                type: 'workout',
                data: {
                    completed: true,
                    type: 'strength',
                    duration: 60,
                },
            }

            const result = metricUpdateSchema.safeParse(validData)
            expect(result.success).toBe(true)
        })

        it('rejects invalid discriminator', () => {
            const invalidData = {
                type: 'invalid',
                data: {},
            }

            const result = metricUpdateSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })

        it('rejects mismatched type and data', () => {
            const invalidData = {
                type: 'nutrition',
                data: {
                    weight: 75.5,
                },
            }

            const result = metricUpdateSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
        })
    })

    describe('Type Definitions', () => {
        describe('WeightTrendPoint', () => {
            it('accepts valid weight trend point', () => {
                const validPoint: WeightTrendPoint = {
                    date: new Date('2024-01-29'),
                    weight: 75.5,
                }

                expect(validPoint.date).toBeInstanceOf(Date)
                expect(typeof validPoint.weight).toBe('number')
            })

            it('accepts weight with multiple decimal places', () => {
                const validPoint: WeightTrendPoint = {
                    date: new Date('2024-01-29'),
                    weight: 75.567,
                }

                expect(validPoint.weight).toBe(75.567)
            })

            it('accepts zero weight', () => {
                const validPoint: WeightTrendPoint = {
                    date: new Date('2024-01-29'),
                    weight: 0,
                }

                expect(validPoint.weight).toBe(0)
            })
        })

        describe('Achievement', () => {
            it('accepts complete achievement with icon', () => {
                const validAchievement: Achievement = {
                    id: 'achievement-123',
                    title: 'First Week Complete',
                    description: 'Completed your first week of tracking',
                    achievedAt: new Date('2024-01-29'),
                    icon: '🏆',
                }

                expect(validAchievement.id).toBe('achievement-123')
                expect(validAchievement.icon).toBe('🏆')
            })

            it('accepts achievement without icon', () => {
                const validAchievement: Achievement = {
                    id: 'achievement-456',
                    title: 'Consistency Master',
                    description: 'Logged data for 30 consecutive days',
                    achievedAt: new Date('2024-02-28'),
                }

                expect(validAchievement.icon).toBeUndefined()
            })

            it('accepts empty description', () => {
                const validAchievement: Achievement = {
                    id: 'achievement-789',
                    title: 'Goal Reached',
                    description: '',
                    achievedAt: new Date('2024-03-15'),
                }

                expect(validAchievement.description).toBe('')
            })
        })

        describe('ProgressData', () => {
            it('accepts complete progress data', () => {
                const validProgress: ProgressData = {
                    weightTrend: [
                        { date: new Date('2024-01-01'), weight: 80.0 },
                        { date: new Date('2024-01-08'), weight: 79.5 },
                        { date: new Date('2024-01-15'), weight: 79.0 },
                        { date: new Date('2024-01-22'), weight: 78.5 },
                    ],
                    nutritionAdherence: 85.5,
                    achievements: [
                        {
                            id: 'ach-1',
                            title: 'First Week',
                            description: 'Completed first week',
                            achievedAt: new Date('2024-01-08'),
                        },
                    ],
                }

                expect(validProgress.weightTrend).toHaveLength(4)
                expect(validProgress.nutritionAdherence).toBe(85.5)
                expect(validProgress.achievements).toHaveLength(1)
            })

            it('accepts empty weight trend', () => {
                const validProgress: ProgressData = {
                    weightTrend: [],
                    nutritionAdherence: 0,
                    achievements: [],
                }

                expect(validProgress.weightTrend).toHaveLength(0)
                expect(validProgress.achievements).toHaveLength(0)
            })

            it('accepts 100% nutrition adherence', () => {
                const validProgress: ProgressData = {
                    weightTrend: [],
                    nutritionAdherence: 100,
                    achievements: [],
                }

                expect(validProgress.nutritionAdherence).toBe(100)
            })

            it('accepts 0% nutrition adherence', () => {
                const validProgress: ProgressData = {
                    weightTrend: [],
                    nutritionAdherence: 0,
                    achievements: [],
                }

                expect(validProgress.nutritionAdherence).toBe(0)
            })

            it('accepts single weight trend point', () => {
                const validProgress: ProgressData = {
                    weightTrend: [
                        { date: new Date('2024-01-01'), weight: 80.0 },
                    ],
                    nutritionAdherence: 50,
                    achievements: [],
                }

                expect(validProgress.weightTrend).toHaveLength(1)
            })

            it('accepts multiple achievements', () => {
                const validProgress: ProgressData = {
                    weightTrend: [],
                    nutritionAdherence: 75,
                    achievements: [
                        {
                            id: 'ach-1',
                            title: 'Achievement 1',
                            description: 'First achievement',
                            achievedAt: new Date('2024-01-01'),
                        },
                        {
                            id: 'ach-2',
                            title: 'Achievement 2',
                            description: 'Second achievement',
                            achievedAt: new Date('2024-01-15'),
                            icon: '🎉',
                        },
                    ],
                }

                expect(validProgress.achievements).toHaveLength(2)
                expect(validProgress.achievements[1].icon).toBe('🎉')
            })
        })
    })
})
