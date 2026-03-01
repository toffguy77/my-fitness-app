'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FoodTrackerPage } from '@/features/food-tracker/components/FoodTrackerPage';

export function FoodTrackerPageClient() {
    const router = useRouter();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const token = typeof window !== 'undefined'
            ? localStorage.getItem('auth_token')
            : null;

        if (!token) {
            router.push('/auth');
            return;
        }

        setIsAuthenticated(true);
        setIsLoading(false);
    }, [router]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return <FoodTrackerPage />;
}

export default FoodTrackerPageClient;
