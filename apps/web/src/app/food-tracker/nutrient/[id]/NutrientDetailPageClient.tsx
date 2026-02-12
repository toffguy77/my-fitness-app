'use client';

/**
 * Nutrient Detail Page Client Component
 *
 * Client-side wrapper for the nutrient detail page.
 * Handles authentication check and data fetching.
 *
 * Requirements: 11.5, 12.1
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NutrientDetailPage } from '@/features/food-tracker/components/NutrientDetailPage';
import type { NutrientDetail } from '@/features/food-tracker/types';

// ============================================================================
// Types
// ============================================================================

interface NutrientDetailPageClientProps {
    nutrientId: string;
}

// ============================================================================
// Mock Data (to be replaced with API call)
// ============================================================================

const MOCK_NUTRIENT_DETAILS: Record<string, NutrientDetail> = {
    'vitamin-d': {
        id: 'vitamin-d',
        name: 'Витамин D',
        description: 'Витамин D — жирорастворимый витамин, который играет важную роль в усвоении кальция и фосфора, поддержании здоровья костей и иммунной системы.',
        benefits: 'Укрепляет кости и зубы, поддерживает иммунную систему, помогает в регуляции настроения и снижении риска депрессии.',
        effects: 'Влияет на усвоение кальция в кишечнике, регулирует уровень кальция и фосфора в крови, участвует в работе иммунных клеток.',
        minRecommendation: 10,
        optimalRecommendation: 20,
        unit: 'мкг',
        sourcesInDiet: [
            { foodName: 'Лосось', amount: 100, unit: 'г', contribution: 15 },
            { foodName: 'Яичный желток', amount: 2, unit: 'шт', contribution: 3 },
            { foodName: 'Молоко обогащённое', amount: 200, unit: 'мл', contribution: 2.5 },
        ],
    },
    'vitamin-c': {
        id: 'vitamin-c',
        name: 'Витамин C',
        description: 'Витамин C — водорастворимый витамин, мощный антиоксидант, необходимый для синтеза коллагена и поддержания иммунитета.',
        benefits: 'Укрепляет иммунитет, способствует заживлению ран, улучшает усвоение железа, защищает клетки от окислительного стресса.',
        effects: 'Участвует в синтезе коллагена, нейтрализует свободные радикалы, поддерживает работу надпочечников.',
        minRecommendation: 75,
        optimalRecommendation: 100,
        unit: 'мг',
        sourcesInDiet: [
            { foodName: 'Апельсин', amount: 1, unit: 'шт', contribution: 70 },
            { foodName: 'Болгарский перец', amount: 100, unit: 'г', contribution: 128 },
            { foodName: 'Киви', amount: 1, unit: 'шт', contribution: 64 },
        ],
    },
};

// ============================================================================
// Component
// ============================================================================

export function NutrientDetailPageClient({ nutrientId }: NutrientDetailPageClientProps) {
    const router = useRouter();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [nutrientDetail, setNutrientDetail] = useState<NutrientDetail | null>(null);
    const [currentIntake, setCurrentIntake] = useState(0);

    useEffect(() => {
        // Check authentication
        const checkAuth = () => {
            const token = typeof window !== 'undefined'
                ? localStorage.getItem('auth_token')
                : null;

            if (!token) {
                router.push('/auth');
                return;
            }

            setIsAuthenticated(true);

            // Load nutrient data (mock for now)
            const detail = MOCK_NUTRIENT_DETAILS[nutrientId];
            if (detail) {
                setNutrientDetail(detail);
                // Calculate current intake from sources
                const intake = detail.sourcesInDiet.reduce((sum, source) => sum + source.contribution, 0);
                setCurrentIntake(intake);
            }

            setIsLoading(false);
        };

        checkAuth();
    }, [router, nutrientId]);

    // Handle back navigation
    const handleBack = () => {
        router.back();
    };

    // Show loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                    <p className="text-gray-600">Загрузка...</p>
                </div>
            </div>
        );
    }

    // Don't render if not authenticated
    if (!isAuthenticated) {
        return null;
    }

    // Show not found if nutrient doesn't exist
    if (!nutrientDetail) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <p className="text-gray-600 mb-4">Нутриент не найден</p>
                    <button
                        type="button"
                        onClick={handleBack}
                        className="text-blue-600 hover:text-blue-800"
                    >
                        ← Вернуться назад
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-2xl mx-auto px-4 py-4">
                <NutrientDetailPage
                    nutrient={nutrientDetail}
                    currentIntake={currentIntake}
                    onBack={handleBack}
                />
            </div>
        </div>
    );
}

export default NutrientDetailPageClient;
