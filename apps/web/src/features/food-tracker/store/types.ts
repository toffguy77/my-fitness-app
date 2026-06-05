/**
 * Combined FoodTrackerStore type — union of all domain slice interfaces
 */

import type { EntriesSlice } from './entriesSlice';
import type { WaterSlice } from './waterSlice';
import type { OfflineSlice } from './offlineSlice';

export type FoodTrackerStore = EntriesSlice & WaterSlice & OfflineSlice;
