'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, Logo } from '@/shared/components/ui'
import { Input } from '@/shared/components/ui/Input'
import { Button } from '@/shared/components/ui/Button'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [error, setError] = useState('')

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        // Validate email
        if (!email) {
            setError('Введите email')
            return
        }

        if (!validateEmail(email)) {
            setError('Введите корректный email адрес')
            return
        }

        setIsLoading(true)

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
            const response = await fetch(`${apiUrl}/api/v1/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            })

            const data = await response.json()

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Слишком много запросов. Попробуйте позже.')
                }
                throw new Error(data.error || 'Не удалось отправить письмо')
            }

            setIsSubmitted(true)
            toast.success('Проверьте почту для инструкций по сбросу пароля')
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка'
            setError(errorMessage)
            toast.error(errorMessage)
        } finally {
            setIsLoading(false)
        }
    }

    if (isSubmitted) {
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

                        <h1 className="text-2xl font-bold text-gray-900">Проверьте почту</h1>

                        <p className="text-gray-600">
                            Если аккаунт с адресом <strong>{email}</strong> существует, вы получите инструкции по сбросу пароля.
                        </p>

                        <p className="text-sm text-gray-500">
                            Не получили письмо? Проверьте папку "Спам" или попробуйте снова.
                        </p>

                        <div className="pt-4 space-y-2">
                            <Button
                                onClick={() => {
                                    setIsSubmitted(false)
                                    setEmail('')
                                }}
                                variant="outline"
                                className="w-full"
                            >
                                Попробовать другой email
                            </Button>

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

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <Card className="w-full max-w-md p-8">
                <div className="space-y-6">
                    <div className="text-center space-y-4">
                        <div className="flex justify-center">
                            <Logo width={160} height={48} className="text-gray-900" />
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold text-gray-900">Забыли пароль?</h1>
                            <p className="text-gray-600">
                                Введите ваш email и мы отправим инструкции по сбросу пароля.
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                                Email адрес
                            </label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value)
                                    setError('')
                                }}
                                placeholder="your.email@example.com"
                                error={error}
                                disabled={isLoading}
                                autoFocus
                                required
                            />
                        </div>

                        <Button type="submit" className="w-full" isLoading={isLoading} disabled={isLoading}>
                            {isLoading ? 'Отправка...' : 'Отправить инструкции'}
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
