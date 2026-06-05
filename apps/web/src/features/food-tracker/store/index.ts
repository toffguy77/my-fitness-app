/**
 * Food tracker store — combines all domain slices into one Zustand store
 */

import { create } from 'zustand';
import { createEntriesSlice } from './entriesSlice';
import { createWaterSlice } from './waterSlice';
import { createOfflineSlice } from './offlineSlice';
import type { FoodTrackerStore } from './types';

export const useFoodTrackerStore = create<FoodTrackerStore>()((...a) => ({
    ...createEntriesSlice(...a),
    ...createWaterSlice(...a),
    ...createOfflineSlice(...a),
}));

export type { FoodTrackerStore } from './types';
