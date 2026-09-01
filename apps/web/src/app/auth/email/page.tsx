import { Suspense } from 'react'
import { OAuthEmailScreen } from '@/features/auth/components/OAuthEmailScreen'

export default function AuthEmailPage() {
    return (
        <Suspense fallback={null}>
            <OAuthEmailScreen />
        </Suspense>
    )
}
