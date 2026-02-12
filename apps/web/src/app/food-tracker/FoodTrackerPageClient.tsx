'use client';

/**
 * Food Tracker Page Client Component
 *
 * Client-side wrapper for the food tracker page.
 * Handles authentication check and redirects.
 *
 * Requirements: 16.6
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FoodTrackerPage } from '@/features/food-tracker/components/FoodTrackerPage';

// ============================================================================
// Types
// ============================================================================

interface UserData {
    id: string;
    email: string;
    name?: string;
}

// ============================================================================
// Component
// ============================================================================

export function FoodTrackerPageClient() {
    const router = useRouter();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

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

            // Verify user data exists
            const userDataStr = typeof window !== 'undefined'
                ? localStorage.getItem('user')
                : null;

            if (!userDataStr) {
                router.push('/auth');
                return;
            }

            try {
                JSON.parse(userDataStr) as UserData;
                setIsAuthenticated(true);
            } catch {
                router.push('/auth');
                return;
            }

            setIsLoading(false);
        };

        checkAuth();
    }, [router]);

    // Show loading state while checking authentication
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

    // Don't render if not authenticated (will redirect)
    if (!isAuthenticated) {
        return null;
    }

    return <FoodTrackerPage />;
}

export default FoodTrackerPageClient;
