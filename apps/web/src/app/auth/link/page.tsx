import { Suspense } from 'react'
import { OAuthLinkScreen } from '@/features/auth/components/OAuthLinkScreen'

export default function AuthLinkPage() {
    return (
        <Suspense fallback={null}>
            <OAuthLinkScreen />
        </Suspense>
    )
}
