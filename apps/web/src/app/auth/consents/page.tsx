import { Suspense } from 'react'
import { OAuthConsentsScreen } from '@/features/auth/components/OAuthConsentsScreen'

export default function AuthConsentsPage() {
    return (
        <Suspense fallback={null}>
            <OAuthConsentsScreen />
        </Suspense>
    )
}
