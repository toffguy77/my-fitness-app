'use client';

import { FoodTrackerPage } from '@/features/food-tracker/components/FoodTrackerPage';
import { useSession } from '@/shared/hooks/useSession';

export function FoodTrackerPageClient() {
    // A signed-out visitor is redirected by middleware.ts before this renders.
    // What is left is the wait while the session is minted from the cookie —
    // a real state, and rendering it as "signed out" would flash the sign-in
    // screen at somebody who is signed in.
    const session = useSession();

    if (session !== 'authenticated') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
            </div>
        );
    }

    return <FoodTrackerPage />;
}

export default FoodTrackerPageClient;
