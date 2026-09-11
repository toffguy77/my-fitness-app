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
import { t } from '@/shared/i18n';

// ============================================================================
// Metadata
// ============================================================================

export const metadata: Metadata = {
    title: t('foodTracker.page.title'),
    description: t('foodTracker.page.description'),
};

// ============================================================================
// Page Component
// ============================================================================

export default function FoodTrackerPage() {
    return <FoodTrackerPageClient />;
}
