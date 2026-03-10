/**
 * Type definitions for the dashboard feature
 */

import type { LucideIcon } from 'lucide-react'
import { z } from 'zod'

/**
 * Navigation item identifiers
 */
export type NavigationItemId = 'dashboard' | 'food-tracker' | 'workout' | 'chat' | 'content'

/**
 * Configuration for a single navigation item
 */
export interface NavigationItemConfig {
    id: NavigationItemId
    label: string
    icon: LucideIcon
    href: string
    isDisabled?: boolean
}

/**
 * User profile data displayed in header
 */
export interface UserProfile {
    id: string
    name: string
    avatarUrl?: string
}

/**
 * Notification summary for badge display
 */
export interface NotificationSummary {
    unreadCount: number
}

// ============================================================================
// Dashboard Data Types
// ============================================================================

/**
 * Nutrition data for a single day
 */
export interface NutritionData {
    calories: number
    protein: number
    fat: number
    carbs: number
}

/**
 * Workout data for a single day
 */
export interface WorkoutData {
    completed: boolean
    type?: string
    duration?: number // in minutes
}

/**
 * Completion status for daily goals
 */
export interface CompletionStatus {
    nutritionFilled: boolean
    weightLogged: boolean
    activityCompleted: boolean
}

/**
 * Daily metrics for tracking
 */
export interface DailyMetrics {
    date: string // ISO date string (YYYY-MM-DD)
    userId: string

    // Nutrition
    nutrition: NutritionData

    // Weight
    weight: number | null

    // Activity
    steps: number
    workout: WorkoutData

    // Completion status
    completionStatus: CompletionStatus

    // Metadata
    createdAt: Date
    updatedAt: Date
}

/**
 * Weekly plan assigned by curator
 */
export interface WeeklyPlan {
    id: string
    userId: string
    curatorId: string

    // Targets
    caloriesGoal: number
    proteinGoal: number
    fatGoal?: number
    carbsGoal?: number
    stepsGoal?: number

    // Curator comment
    comment?: string

    // Dates
    startDate: Date
    endDate: Date

    // Status
    isActive: boolean

    // Metadata
    createdAt: Date
    updatedAt: Date
    createdBy: string
}

/**
 * Task status
 */
export type TaskStatus = 'active' | 'completed' | 'overdue'

/**
 * Task assigned by curator
 */
export interface Task {
    id: string
    userId: string
    curatorId: string

    // Content
    title: string
    description: string

    // Timing
    weekNumber: number
    assignedAt: Date
    dueDate: Date
    completedAt?: Date

    // Status
    status: TaskStatus

    // Metadata
    createdAt: Date
    updatedAt: Date
}

/**
 * Weekly report summary data
 */
export interface WeeklyReportSummary {
    daysWithNutrition: number
    daysWithWeight: number
    daysWithActivity: number
    averageCalories: number
    averageWeight: number
    totalSteps: number
    workoutsCompleted: number
}

/**
 * Weekly report submitted to curator
 */
export interface WeeklyReport {
    id: string
    userId: string
    curatorId: string

    // Week identifier
    weekStart: Date
    weekEnd: Date
    weekNumber: number

    // Summary data
    summary: WeeklyReportSummary

    // Photo
    photoUrl?: string

    // Status
    submittedAt: Date
    reviewedAt?: Date
    curatorFeedback?: string

    // Metadata
    createdAt: Date
    updatedAt: Date
}

/**
 * Photo data for weekly progress
 */
export interface PhotoData {
    id: string
    userId: string

    // Week identifier
    weekStart: Date
    weekEnd: Date
    weekIdentifier: string // e.g., "2024-W01"

    // Photo data
    photoUrl: string
    fileSize: number
    mimeType: string

    // Metadata
    uploadedAt: Date
    createdAt: Date
}

/**
 * Metric update union type
 */
export type MetricUpdate =
    | { type: 'nutrition'; data: NutritionData }
    | { type: 'weight'; data: { weight: number } }
    | { type: 'steps'; data: { steps: number } }
    | { type: 'workout'; data: WorkoutData }

/**
 * Weight trend data point
 */
export interface WeightTrendPoint {
    date: Date
    weight: number
}

/**
 * Achievement data
 */
export interface Achievement {
    id: string
    title: string
    description: string
    achievedAt: Date
    icon?: string
}

/**
 * Progress data for visualization
 */
export interface ProgressData {
    weightTrend: WeightTrendPoint[]
    nutritionAdherence: number // percentage (0-100)
    achievements: Achievement[]
    targetWeight?: number | null
}

// ============================================================================
// Zod Validation Schemas
// ============================================================================

/**
 * Nutrition data validation schema
 */
export const nutritionDataSchema = z.object({
    calories: z.number().min(0).max(10000),
    protein: z.number().min(0).max(1000),
    fat: z.number().min(0).max(1000),
    carbs: z.number().min(0).max(1000),
})

/**
 * Workout data validation schema
 */
export const workoutDataSchema = z.object({
    completed: z.boolean(),
    type: z.string().optional(),
    duration: z.number().min(0).max(600).optional(), // max 10 hours
})

/**
 * Completion status validation schema
 */
export const completionStatusSchema = z.object({
    nutritionFilled: z.boolean(),
    weightLogged: z.boolean(),
    activityCompleted: z.boolean(),
})

/**
 * Daily metrics validation schema
 */
export const dailyMetricsSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
    userId: z.string().min(1),
    nutrition: nutritionDataSchema,
    weight: z.number().min(0.1).max(500).nullable(),
    steps: z.number().min(0).max(100000),
    workout: workoutDataSchema,
    completionStatus: completionStatusSchema,
    createdAt: z.date(),
    updatedAt: z.date(),
})

/**
 * Weekly plan validation schema
 */
export const weeklyPlanSchema = z.object({
    id: z.string().min(1),
    userId: z.string().min(1),
    curatorId: z.string().min(1),
    caloriesGoal: z.number().min(0).max(10000),
    proteinGoal: z.number().min(0).max(1000),
    fatGoal: z.number().min(0).max(1000).optional(),
    carbsGoal: z.number().min(0).max(1000).optional(),
    stepsGoal: z.number().min(0).max(100000).optional(),
    startDate: z.date(),
    endDate: z.date(),
    isActive: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    createdBy: z.string().min(1),
}).refine(data => data.endDate >= data.startDate, {
    message: "Дата окончания должна быть не раньше даты начала",
    path: ["endDate"],
})

/**
 * Task validation schema
 */
export const taskSchema = z.object({
    id: z.string().min(1),
    userId: z.string().min(1),
    curatorId: z.string().min(1),
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    weekNumber: z.number().min(1).max(52),
    assignedAt: z.date(),
    dueDate: z.date(),
    completedAt: z.date().optional(),
    status: z.enum(['active', 'completed', 'overdue']),
    createdAt: z.date(),
    updatedAt: z.date(),
})

/**
 * Weekly report summary validation schema
 */
export const weeklyReportSummarySchema = z.object({
    daysWithNutrition: z.number().min(0).max(7),
    daysWithWeight: z.number().min(0).max(7),
    daysWithActivity: z.number().min(0).max(7),
    averageCalories: z.number().min(0),
    averageWeight: z.number().min(0),
    totalSteps: z.number().min(0),
    workoutsCompleted: z.number().min(0).max(7),
})

/**
 * Weekly report validation schema
 */
export const weeklyReportSchema = z.object({
    id: z.string().min(1),
    userId: z.string().min(1),
    curatorId: z.string().min(1),
    weekStart: z.date(),
    weekEnd: z.date(),
    weekNumber: z.number().min(1).max(52),
    summary: weeklyReportSummarySchema,
    photoUrl: z.string().url().optional(),
    submittedAt: z.date(),
    reviewedAt: z.date().optional(),
    curatorFeedback: z.string().max(2000).optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
}).refine(data => data.weekEnd >= data.weekStart, {
    message: "Конец недели должен быть не раньше начала недели",
    path: ["weekEnd"],
})

/**
 * Photo data validation schema
 */
export const photoDataSchema = z.object({
    id: z.string().min(1),
    userId: z.string().min(1),
    weekStart: z.date(),
    weekEnd: z.date(),
    weekIdentifier: z.string().regex(/^\d{4}-W\d{2}$/), // YYYY-WNN
    photoUrl: z.string().url(),
    fileSize: z.number().min(1).max(10 * 1024 * 1024), // max 10MB
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    uploadedAt: z.date(),
    createdAt: z.date(),
})

/**
 * Metric update validation schemas
 */
export const metricUpdateSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('nutrition'),
        data: nutritionDataSchema,
    }),
    z.object({
        type: z.literal('weight'),
        data: z.object({
            weight: z.number().min(0.1).max(500),
        }),
    }),
    z.object({
        type: z.literal('steps'),
        data: z.object({
            steps: z.number().min(0).max(100000),
        }),
    }),
    z.object({
        type: z.literal('workout'),
        data: workoutDataSchema,
    }),
])

// ============================================================================
// Client-facing Task & Feedback Types (for curator-assigned content)
// ============================================================================

/**
 * Task type identifiers for curator-assigned tasks
 */
export type ClientTaskType = 'nutrition' | 'workout' | 'habit' | 'measurement'

/**
 * Task recurrence pattern
 */
export type TaskRecurrence = 'once' | 'daily' | 'weekly'

/**
 * Client-facing view of a curator-assigned task
 */
export interface ClientTaskView {
    id: string
    title: string
    type: ClientTaskType
    description?: string
    deadline: string
    recurrence: TaskRecurrence
    recurrence_days?: number[]
    status: TaskStatus
    completions?: string[]
}

/**
 * Rating level for feedback categories
 */
export type RatingLevel = 'excellent' | 'good' | 'needs_improvement'

/**
 * Rating for a specific feedback category
 */
export interface CategoryRating {
    rating: RatingLevel
    comment?: string
}

/**
 * Curator feedback on a weekly report
 */
export interface CuratorFeedback {
    nutrition?: CategoryRating
    activity?: CategoryRating
    water?: CategoryRating
    photo_uploaded?: boolean
    summary: string
    recommendations?: string
}
