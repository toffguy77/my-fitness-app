/**
 * RLS Error Handler
 * Detects and tracks Row Level Security policy violations
 *
 * **Validates: Requirements 2.5**
 */

import { PostgrestError } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'
import { trackRLSViolation } from '@/utils/metrics/error-handling-metrics'

/**
 * Check if error is an RLS policy violation
 * RLS errors typically have code '42501' (insufficient_privilege)
 */
export function isRLSError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false

    const pgError = error as PostgrestError

    // Check for RLS-specific error codes
    return Boolean(
        pgError.code === '42501' || // insufficient_privilege
        pgError.code === 'PGRST301' || // PostgREST RLS violation
        (pgError.message && (
            pgError.message.includes('row-level security') ||
            pgError.message.includes('policy') ||
            pgError.message.includes('permission denied')
        ))
    )
}

/**
 * Handle RLS error and track metrics
 *
 * @param error - The error from Supabase
 * @param context - Additional context about the operation
 */
export function handleRLSError(
    error: unknown,
    context: {
        table: string
        operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
        userId?: string
        role?: string
    }
): void {
    if (!isRLSError(error)) return

    // Log the RLS violation
    logger.warn('RLS policy violation detected', {
        table: context.table,
        operation: context.operation,
        userId: context.userId,
        role: context.role,
        error: error instanceof Error ? error.message : String(error)
    })

    // Track the violation in metrics
    trackRLSViolation({
        table: context.table,
        operation: context.operation,
        userId: context.userId,
        role: context.role
    })
}

/**
 * Wrap a Supabase query to automatically detect and track RLS errors
 *
 * @param queryPromise - The Supabase query promise
 * @param context - Context about the operation
 * @returns The query result
 *
 * @example
 * ```typescript
 * const { data, error } = await withRLSTracking(
 *   supabase.from('products').insert({ name: 'Test' }),
 *   { table: 'products', operation: 'INSERT', userId: user.id }
 * )
 * ```
 */
export async function withRLSTracking<T>(
    queryPromise: Promise<{ data: T | null; error: PostgrestError | null }>,
    context: {
        table: string
        operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
        userId?: string
        role?: string
    }
): Promise<{ data: T | null; error: PostgrestError | null }> {
    const result = await queryPromise

    if (result.error) {
        handleRLSError(result.error, context)
    }

    return result
}
