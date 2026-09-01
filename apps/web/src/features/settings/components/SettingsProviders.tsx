'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
    providersApi,
    providerLabel,
    type LinkedProvider,
} from '@/features/auth/api/providers'
import { isApiError } from '@/shared/errors/apiErrors'
import { SettingsPageLayout } from './SettingsPageLayout'

/**
 * External sign-in services attached to this account.
 *
 * Unlinking the last way in is refused rather than merely warned about: an
 * account with no password and one provider would lose a year of data to a
 * single click.
 */
export function SettingsProviders() {
    const [linked, setLinked] = useState<LinkedProvider[]>([])
    const [available, setAvailable] = useState<string[]>([])
    const [hasPassword, setHasPassword] = useState(true)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)

    const refresh = async () => {
        const [state, providers] = await Promise.all([
            providersApi.linked(),
            providersApi.list(),
        ])
        setLinked(state.linked)
        setHasPassword(state.has_password)
        setAvailable(providers)
    }

    useEffect(() => {
        async function loadInitial() {
            try {
                await refresh()
            } catch {
                toast.error('Не удалось загрузить привязки')
            } finally {
                setLoading(false)
            }
        }
        loadInitial()
    }, [])

    const isOnlyWayIn = (provider: string) =>
        !hasPassword && linked.length === 1 && linked[0].provider === provider

    const handleUnlink = async (provider: string) => {
        setBusy(provider)
        try {
            await providersApi.unlink(provider)
            setLinked((current) => current.filter((item) => item.provider !== provider))
            toast.success(`${providerLabel(provider)} отвязан`)
        } catch (error) {
            if (isApiError(error) && error.status === 409) {
                toast.error('Это единственный способ входа. Сначала задайте пароль.')
            } else {
                toast.error('Не удалось отвязать сервис')
            }
        } finally {
            setBusy(null)
        }
    }

    if (loading) {
        return <p className="py-8 text-center text-sm text-gray-500">Загрузка...</p>
    }

    const unlinked = available.filter(
        (provider) => !linked.some((item) => item.provider === provider)
    )

    return (
        <section>
            <h2 className="text-sm font-bold text-gray-900">Вход через сервисы</h2>
            <p className="mt-1 text-sm text-gray-600">
                Привязанный сервис позволяет входить без пароля.
            </p>

            {linked.length === 0 && unlinked.length === 0 && (
                <p className="mt-4 text-sm text-gray-500">
                    Вход через внешние сервисы сейчас недоступен.
                </p>
            )}

            <ul className="mt-4 space-y-3">
                {linked.map((item) => (
                    <li
                        key={item.provider}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
                    >
                        <div>
                            <p className="text-sm font-medium text-gray-900">
                                {providerLabel(item.provider)}
                            </p>
                            {item.email && <p className="text-xs text-gray-500">{item.email}</p>}
                            {isOnlyWayIn(item.provider) && (
                                <p className="mt-1 text-xs text-gray-500">
                                    Единственный способ входа.{' '}
                                    <a href="/forgot-password" className="text-blue-600 hover:underline">
                                        Задайте пароль
                                    </a>
                                    , чтобы отвязать.
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => handleUnlink(item.provider)}
                            disabled={busy === item.provider || isOnlyWayIn(item.provider)}
                            className="text-sm font-medium text-red-500 transition-colors hover:text-red-600 disabled:text-gray-300"
                        >
                            Отвязать
                        </button>
                    </li>
                ))}

                {unlinked.map((provider) => (
                    <li
                        key={provider}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
                    >
                        <p className="text-sm font-medium text-gray-900">{providerLabel(provider)}</p>
                        <a
                            href={providersApi.startUrl(provider)}
                            className="text-sm font-medium text-blue-600 hover:text-blue-700"
                        >
                            Привязать
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    )
}

export function SettingsProvidersPage() {
    return (
        <SettingsPageLayout title="Вход через сервисы">
            {() => <SettingsProviders />}
        </SettingsPageLayout>
    )
}
