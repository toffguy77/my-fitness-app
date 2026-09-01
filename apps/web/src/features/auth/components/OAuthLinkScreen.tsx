'use client'

/**
 * Claiming an existing account after an external sign-in.
 *
 * The provider says this address is theirs. We do not take that as proof: an
 * address we never verified would otherwise be enough to walk into somebody's
 * account. The password is the proof.
 */

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { providersApi, providerLabel } from '@/features/auth/api/providers'
import { storeSession, destinationFor } from '@/features/auth/utils/session'
import { isApiError } from '@/shared/errors/apiErrors'

export function OAuthLinkScreen() {
    const router = useRouter()
    const params = useSearchParams()
    const provider = params.get('provider') ?? ''
    const email = params.get('email') ?? ''

    const [password, setPassword] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        if (!password || isSubmitting) return

        setIsSubmitting(true)
        try {
            const response = await providersApi.confirmLink(password)
            storeSession(response)
            toast.success(`${providerLabel(provider)} привязан`)
            router.replace(destinationFor(response.user))
        } catch (error) {
            if (isApiError(error) && error.status === 401) {
                toast.error('Неверный пароль')
            } else if (isApiError(error) && error.status === 409) {
                toast.error('У этого аккаунта нет пароля. Войдите через привязанный сервис.')
            } else if (isApiError(error) && error.status === 400) {
                toast.error('Попытка входа истекла. Начните заново.')
                router.replace('/auth')
            } else {
                toast.error('Не удалось привязать аккаунт')
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <main className="flex min-h-screen flex-col justify-center bg-gray-50 px-6">
            <div className="mx-auto w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h1 className="text-lg font-semibold text-gray-900">Аккаунт уже существует</h1>
                <p className="mt-2 text-sm text-gray-600">
                    {email ? (
                        <>
                            На адрес <span className="font-medium text-gray-900">{email}</span> уже
                            зарегистрирован аккаунт. Введите его пароль, чтобы привязать{' '}
                            {providerLabel(provider)} и входить одним нажатием.
                        </>
                    ) : (
                        <>Введите пароль от аккаунта, чтобы привязать {providerLabel(provider)}.</>
                    )}
                </p>

                <form onSubmit={handleSubmit} className="mt-6">
                    <label htmlFor="link-password" className="block text-sm font-medium text-gray-900">
                        Пароль
                    </label>
                    <input
                        id="link-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-600"
                    />

                    <button
                        type="submit"
                        disabled={!password || isSubmitting}
                        className="mt-4 w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isSubmitting ? 'Привязываем...' : 'Привязать и войти'}
                    </button>
                </form>

                <button
                    onClick={() => router.replace('/auth')}
                    className="mt-4 w-full text-sm text-gray-600 hover:text-gray-900"
                >
                    Войти обычным способом
                </button>

                <p className="mt-4 text-center text-sm text-gray-600">
                    Забыли пароль?{' '}
                    <a href="/forgot-password" className="text-blue-600 hover:underline">
                        Восстановить
                    </a>
                </p>
            </div>
        </main>
    )
}
