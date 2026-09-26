/**
 * A food tracker store value for a test that only cares about a few fields.
 *
 * Same reason as the dashboard's: see `features/dashboard/testing/storeValue`.
 * The cast lives here, once, and the fixture stays checked against the store.
 */

import type { DeepPartial } from '@/shared/testing/deepPartial'
import type { FoodTrackerStore } from '../store/types'

export function foodTrackerStoreValue(
    partial: DeepPartial<FoodTrackerStore>,
): FoodTrackerStore {
    return partial as FoodTrackerStore
}
