/**
 * Nutrient Detail Page
 *
 * Dynamic route for displaying detailed nutrient information.
 * Shows nutrient description, benefits, effects, and food sources.
 *
 * Requirements: 11.5, 12.1
 */

import { Metadata } from 'next';
import { NutrientDetailPageClient } from './NutrientDetailPageClient';

// ============================================================================
// Types
// ============================================================================

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

// ============================================================================
// Metadata
// ============================================================================

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;

    return {
        title: `Нутриент | BURCEV`,
        description: 'Подробная информация о нутриенте, его пользе и источниках в рационе.',
    };
}

// ============================================================================
// Page Component
// ============================================================================

export default async function NutrientDetailPage({ params }: PageProps) {
    const { id } = await params;

    return <NutrientDetailPageClient nutrientId={id} />;
}
