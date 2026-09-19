import Link from 'next/link'
import { MagicLinkConsume } from '@/features/auth/components/MagicLinkConsume'
import { t } from '@/shared/i18n'

// Ссылка с одноразовым токеном в адресе не должна попадать в поисковый
// индекс и превращаться в кликабельный результат.
export const metadata = {
    title: 'Вход',
    robots: { index: false, follow: false },
}

export default async function MagicLinkConsumePage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>
}) {
    const { token } = await searchParams

    if (!token) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
                <p role="alert" className="text-sm text-gray-900">
                    {t('auth.magicLink.consume.noToken')}
                </p>
                <Link
                    href="/auth"
                    className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                    {t('auth.oauth.backToSignIn')}
                </Link>
            </main>
        )
    }

    return <MagicLinkConsume token={token} />
}
