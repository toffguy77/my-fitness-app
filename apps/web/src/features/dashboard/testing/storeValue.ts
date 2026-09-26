/**
 * A dashboard store value for a test that only cares about a few of its fields.
 *
 * Every test that mocks `useDashboardStore` needs to return something in the
 * shape the component reads, and no test needs the whole store. That was
 * written as `mockReturnValue({ ...few fields... } as any)` in a hundred and
 * fifteen places, and `as any` checks nothing: a field renamed in the store, or
 * given a different shape, kept arriving in the component as `undefined` while
 * every one of those tests went on passing.
 *
 * The cast lives here, once. The argument is checked against the real store, so
 * a stale field name fails the build where it is written.
 */

import type { DeepPartial } from '@/shared/testing/deepPartial'
import type { useDashboardStore } from '../store/dashboardStore'

/** What `useDashboardStore()` returns, without exporting the store's state interface. */
export type DashboardStoreValue = ReturnType<typeof useDashboardStore.getState>

export function dashboardStoreValue(
    partial: DeepPartial<DashboardStoreValue>,
): DashboardStoreValue {
    return partial as DashboardStoreValue
}
