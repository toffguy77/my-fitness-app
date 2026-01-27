'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, Logo } from '@/shared/components/ui'
import { Button } from '@/shared/components/ui/Button'
import { PasswordInput } from '@/shared/components/forms/PasswordInput'
import toast from 'react-hot-toast'

function ResetPasswordContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const token = searchParams.get('token')

    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isValidating, setIsValidating] = useState(true)
    const [isTokenValid, setIsTokenValid] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [error, setError] = useState('')
    const [tokenError, setTokenError] = useState('')

    useEffect(() => {
        if (!token) {
            setTokenError('Неверная ссылка для сброса. Токен не указан.')
            setIsValidating(false)
            return
        }

        validateToken()
    }, [token])

    const validateToken = async () => {
        if (!token) return

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
            const response = await fetch(
                `${apiUrl}/api/v1/auth/validate-reset-token?token=${encodeURIComponent(token)}`
            )

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Неверная или истекшая ссылка')
            }

            setIsTokenValid(true)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Неверная ссылка'
            setTokenError(errorMessage)
            setIsTokenValid(false)
        } finally {
            setIsValidating(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        // Validate passwords
        if (!password) {
            setError('Введите пароль')
            return
        }

        if (password.length < 8) {
            setError('Пароль должен содержать минимум 8 символов')
            return
        }

        if (password !== confirmPassword) {
            setError('Пароли не совпадают')
            return
        }

        setIsLoading(true)

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
            const response = await fetch(`${apiUrl}/api/v1/auth/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token,
                    password,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Не удалось сбросить пароль')
            }

            setIsSuccess(true)
            toast.success('Пароль успешно изменен!')

            // Redirect to login after 2 seconds
            setTimeout(() => {
                router.push('/auth')
            }, 2000)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка'
            setError(errorMessage)
            toast.error(errorMessage)
        } finally {
            setIsLoading(false)
        }
    }

    // Loading state
    if (isValidating) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <Card className="w-full max-w-md p-8">
                    <div className="text-center space-y-4">
                        <div className="animate-spin mx-auto w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full" />
                        <p className="text-gray-600">Проверка ссылки...</p>
                    </div>
                </Card>
            </div>
        )
    }

    // Invalid token
    if (!isTokenValid) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <Card className="w-full max-w-md p-8">
                    <div className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                            <svg
                                className="w-8 h-8 text-red-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </div>

                        <h1 className="text-2xl font-bold text-gray-900">Неверная ссылка</h1>

                        <p className="text-gray-600">{tokenError}</p>

                        <div className="pt-4 space-y-2">
                            <Link href="/forgot-password" className="block">
                                <Button className="w-full">Запросить новую ссылку</Button>
                            </Link>

                            <Link href="/auth" className="block">
                                <Button variant="outline" className="w-full">
                                    Вернуться к входу
                                </Button>
                            </Link>
                        </div>
                    </div>
                </Card>
            </div>
        )
    }

    // Success state
    if (isSuccess) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <Card className="w-full max-w-md p-8">
                    <div className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                            <svg
                                className="w-8 h-8 text-green-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        </div>

                        <h1 className="text-2xl font-bold text-gray-900">Пароль успешно изменен!</h1>

                        <p className="text-gray-600">
                            Ваш пароль был успешно изменен. Теперь вы можете войти с новым паролем.
                        </p>

                        <p className="text-sm text-gray-500">Перенаправление на страницу входа...</p>
                    </div>
                </Card>
            </div>
        )
    }

    // Reset form
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <Card className="w-full max-w-md p-8">
                <div className="space-y-6">
                    <div className="text-center space-y-4">
                        <div className="flex justify-center">
                            <Logo width={160} height={48} className="text-gray-900" />
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold text-gray-900">Сброс пароля</h1>
                            <p className="text-gray-600">Введите новый пароль.</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                                Новый пароль
                            </label>
                            <PasswordInput
                                id="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value)
                                    setError('')
                                }}
                                placeholder="Введите новый пароль"
                                disabled={isLoading}
                                showRequirements
                                showStrengthIndicator
                                autoFocus
                                required
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="confirmPassword"
                                className="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Подтвердите пароль
                            </label>
                            <PasswordInput
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => {
                                    setConfirmPassword(e.target.value)
                                    setError('')
                                }}
                                placeholder="Подтвердите новый пароль"
                                error={error}
                                disabled={isLoading}
                                required
                            />
                        </div>

                        <Button type="submit" className="w-full" isLoading={isLoading} disabled={isLoading}>
                            {isLoading ? 'Сброс пароля...' : 'Сбросить пароль'}
                        </Button>
                    </form>

                    <div className="text-center">
                        <Link
                            href="/auth"
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                            ← Вернуться к входу
                        </Link>
                    </div>
                </div>
            </Card>
        </div>
    )
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
        }>
            <ResetPasswordContent />
        </Suspense>
    )
}
