/**
 * Calculation utilities for dashboard metrics
 */

import type { DailyMetrics, WeeklyReportSummary } from '../types'

/**
 * Calculate percentage of goal achieved
 *
 * @param current - Current value
 * @param goal - Goal value
 * @returns Percentage (0-100+), or 0 if goal is 0 or extremely small
 */
export function calculatePercentage(current: number, goal: number): number {
    // Handle edge case: goal is 0 or extremely small (would cause overflow)
    if (goal === 0 || goal < Number.EPSILON) {
        return 0
    }

    // Calculate percentage
    const percentage = (current / goal) * 100

    // Handle edge case: result is not finite (Infinity or -Infinity)
    if (!isFinite(percentage)) {
        return 0
    }

    // Round to 1 decimal place
    return Math.round(percentage * 10) / 10
}

/**
 * Calculate completion status for daily metrics
 *
 * Requirements:
 * - nutritionFilled: true if calories > 0
 * - weightLogged: true if weight is not null
 * - activityCompleted: true if steps >= stepsGoal OR workout completed
 *
 * @param metrics - Daily metrics
 * @param stepsGoal - Daily steps goal (optional, defaults to 10000)
 * @returns Completion status object
 */
export function calculateCompletionStatus(
    metrics: Pick<DailyMetrics, 'nutrition' | 'weight' | 'steps' | 'workout'>,
    stepsGoal: number = 10000
): { nutritionFilled: boolean; weightLogged: boolean; activityCompleted: boolean } {
    return {
        nutritionFilled: metrics.nutrition.calories > 0,
        weightLogged: metrics.weight !== null,
        activityCompleted: metrics.steps >= stepsGoal || metrics.workout.completed,
    }
}

/**
 * Calculate weekly summary from daily metrics
 *
 * @param weekMetrics - Array of daily metrics for the week
 * @returns Weekly report summary
 */
export function calculateWeekSummary(weekMetrics: DailyMetrics[]): WeeklyReportSummary {
    // Initialize counters
    let daysWithNutrition = 0
    let daysWithWeight = 0
    let daysWithActivity = 0
    let totalCalories = 0
    let totalWeight = 0
    let weightCount = 0
    let totalSteps = 0
    let workoutsCompleted = 0

    // Process each day
    for (const day of weekMetrics) {
        // Count days with nutrition data
        if (day.nutrition.calories > 0) {
            daysWithNutrition++
            totalCalories += day.nutrition.calories
        }

        // Count days with weight data
        if (day.weight !== null) {
            daysWithWeight++
            totalWeight += day.weight
            weightCount++
        }

        // Count days with activity
        if (day.steps > 0 || day.workout.completed) {
            daysWithActivity++
        }

        // Sum total steps
        totalSteps += day.steps

        // Count workouts
        if (day.workout.completed) {
            workoutsCompleted++
        }
    }

    // Calculate averages
    const averageCalories = daysWithNutrition > 0
        ? Math.round(totalCalories / daysWithNutrition)
        : 0

    const averageWeight = weightCount > 0
        ? Math.round((totalWeight / weightCount) * 10) / 10 // Round to 1 decimal
        : 0

    return {
        daysWithNutrition,
        daysWithWeight,
        daysWithActivity,
        averageCalories,
        averageWeight,
        totalSteps,
        workoutsCompleted,
    }
}

/**
 * Format timestamp to human-readable string
 *
 * Formats:
 * - Today: "Today at HH:MM"
 * - Yesterday: "Yesterday at HH:MM"
 * - This week: "Day at HH:MM" (e.g., "Monday at 14:30")
 * - This year: "DD MMM at HH:MM" (e.g., "15 Jan at 14:30")
 * - Previous years: "DD MMM YYYY at HH:MM" (e.g., "15 Jan 2023 at 14:30")
 *
 * @param date - Date to format
 * @param locale - Locale for formatting (defaults to 'ru-RU')
 * @returns Formatted timestamp string
 */
export function formatTimestamp(date: Date | string, locale: string = 'ru-RU'): string {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const inputDate = typeof date === 'string' ? new Date(date) : new Date(date)
    const inputDay = new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate())

    // Format time (HH:MM)
    const timeStr = inputDate.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
    })

    // Today
    if (inputDay.getTime() === today.getTime()) {
        return locale === 'ru-RU' ? `Сегодня в ${timeStr}` : `Today at ${timeStr}`
    }

    // Yesterday
    if (inputDay.getTime() === yesterday.getTime()) {
        return locale === 'ru-RU' ? `Вчера в ${timeStr}` : `Yesterday at ${timeStr}`
    }

    // This week (last 7 days)
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)
    if (inputDay > weekAgo) {
        const dayName = inputDate.toLocaleDateString(locale, { weekday: 'long' })
        return locale === 'ru-RU' ? `${dayName} в ${timeStr}` : `${dayName} at ${timeStr}`
    }

    // This year
    if (inputDate.getFullYear() === now.getFullYear()) {
        const dateStr = inputDate.toLocaleDateString(locale, {
            day: 'numeric',
            month: 'short',
        })
        return locale === 'ru-RU' ? `${dateStr} в ${timeStr}` : `${dateStr} at ${timeStr}`
    }

    // Previous years
    const dateStr = inputDate.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
    return locale === 'ru-RU' ? `${dateStr} в ${timeStr}` : `${dateStr} at ${timeStr}`
}

/**
 * Check if all daily goals are met
 *
 * @param status - Completion status object
 * @returns True if all three goals are met
 */
export function isAllGoalsMet(status: {
    nutritionFilled: boolean
    weightLogged: boolean
    activityCompleted: boolean
}): boolean {
    return status.nutritionFilled && status.weightLogged && status.activityCompleted
}

/**
 * Calculate adherence percentage for a week
 *
 * Adherence is the percentage of days where all goals were met
 *
 * @param weekMetrics - Array of daily metrics for the week
 * @param stepsGoal - Daily steps goal (optional, defaults to 10000)
 * @returns Adherence percentage (0-100)
 */
export function calculateAdherence(
    weekMetrics: DailyMetrics[],
    stepsGoal: number = 10000
): number {
    if (weekMetrics.length === 0) {
        return 0
    }

    // Count days where all goals are met
    let daysWithAllGoalsMet = 0

    for (const day of weekMetrics) {
        const status = calculateCompletionStatus(day, stepsGoal)
        if (isAllGoalsMet(status)) {
            daysWithAllGoalsMet++
        }
    }

    // Calculate percentage
    const adherence = (daysWithAllGoalsMet / weekMetrics.length) * 100

    // Round to 1 decimal place
    return Math.round(adherence * 10) / 10
}
