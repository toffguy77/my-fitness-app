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
            <div className="flex min-h-screen items-center justify-center bg-canvas">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
            </div>
        );
    }

    return <FoodTrackerPage />;
}

export default FoodTrackerPageClient;
