import { MagicLinkConsume } from '@/features/auth/components/MagicLinkConsume'
import { MagicLinkFailure } from '@/features/auth/components/MagicLinkFailure'
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
        return <MagicLinkFailure message={t('auth.magicLink.consume.noToken')} />
    }

    return <MagicLinkConsume token={token} />
}
