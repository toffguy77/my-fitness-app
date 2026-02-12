/**
 * Food Tracker Page
 *
 * Main page for the food tracking feature.
 * Server component with authentication check.
 *
 * Requirements: 16.6
 */

import { Metadata } from 'next';
import { FoodTrackerPageClient } from './FoodTrackerPageClient';

// ============================================================================
// Metadata
// ============================================================================

export const metadata: Metadata = {
    title: 'Дневник питания | BURCEV',
    description: 'Отслеживайте свой рацион, КБЖУ и водный баланс. Получайте персональные рекомендации по питанию.',
};

// ============================================================================
// Page Component
// ============================================================================

export default function FoodTrackerPage() {
    return <FoodTrackerPageClient />;
}
