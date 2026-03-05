'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FoodTrackerPage } from '@/features/food-tracker/components/FoodTrackerPage';

export function FoodTrackerPageClient() {
    const router = useRouter();
    const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

    useEffect(() => {
        const token = typeof window !== 'undefined'
            ? localStorage.getItem('auth_token')
            : null;

        if (!token) {
            router.push('/auth');
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAuthState(token ? 'authenticated' : 'unauthenticated');
    }, [router]);

    if (authState !== 'authenticated') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
            </div>
        );
    }

    return <FoodTrackerPage />;
}

export default FoodTrackerPageClient;
