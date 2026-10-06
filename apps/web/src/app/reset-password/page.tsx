'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, X } from 'lucide-react'
import { Button, buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { AuthPanel, AuthShell, AuthStatusIcon } from '@/features/auth/components/AuthShell'
import { cn } from '@/shared/utils/cn'
import { PasswordInput } from '@/shared/components/forms/PasswordInput'
import toast from 'react-hot-toast'
import { validateResetToken, resetPassword as resetPasswordApi } from '@/features/auth/api/passwordReset'
import { passwordSchema } from '@/features/auth/utils/validation'
import { isApiError, serverMessageFrom } from '@/shared/errors/apiErrors'

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

    const validateToken = async () => {
        if (!token) return

        try {
            await validateResetToken(token)
            setIsTokenValid(true)
        } catch (err) {
            setTokenError(serverMessageFrom(err) || 'Неверная или истекшая ссылка')
            setIsTokenValid(false)
        } finally {
            setIsValidating(false)
        }
    }

    useEffect(() => {
        // One function inside the effect: both branches set state, and from the
        // effect body that is a render before the page has done anything.
        async function check() {
            if (!token) {
                setTokenError('Неверная ссылка для сброса. Токен не указан.')
                setIsValidating(false)
                return
            }
            await validateToken()
        }
        check()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token])


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        // Validate passwords
        if (!password) {
            setError('Введите пароль')
            return
        }

        // Проверяем всей политикой, а не одной длиной. Раньше здесь стояло
        // `password.length < 8`: пароль из восьми строчных букв форму
        // проходил, уходил на сервер и возвращался отказом — притом что
        // список требований прямо над полем уже показывал четыре невыполненных
        // правила. Спецификация password-policy требует обратного: отправка
        // не происходит, пока правила не выполнены.
        const policy = passwordSchema.safeParse(password)
        if (!policy.success) {
            setError(policy.error.issues[0].message)
            return
        }

        if (password !== confirmPassword) {
            setError('Пароли не совпадают')
            return
        }

        setIsLoading(true)

        try {
            await resetPasswordApi(token!, password)

            setIsSuccess(true)
            toast.success('Пароль успешно изменен!')

            // Redirect to login after 2 seconds
            setTimeout(() => {
                router.push('/auth')
            }, 2000)
        } catch (err) {
            const serverMessage = serverMessageFrom(err)
            let errorMessage: string
            if (serverMessage) {
                errorMessage = serverMessage
            } else if (isApiError(err)) {
                errorMessage = 'Не удалось сбросить пароль'
            } else {
                errorMessage = 'Произошла ошибка'
            }
            setError(errorMessage)
            toast.error(errorMessage)
        } finally {
            setIsLoading(false)
        }
    }

    // Loading state
    if (isValidating) {
        return (
            <AuthShell centered logo={false} className="text-center">
                <div
                    className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary"
                    aria-hidden="true"
                />
                <p className="mt-4 type-body text-fg-muted">Проверка ссылки...</p>
            </AuthShell>
        )
    }

    // Invalid token
    if (!isTokenValid) {
        return (
            <AuthShell
                centered
                logo={false}
                icon={
                    <AuthStatusIcon tone="danger">
                        <X className="h-7 w-7" strokeWidth={1.8} />
                    </AuthStatusIcon>
                }
                title="Неверная ссылка"
                description={tokenError}
            >
                <div className="space-y-2">
                    <Link href="/forgot-password" className={cn(buttonBase, buttonVariants.primary, buttonSizes.lg, 'w-full')}>
                        Запросить новую ссылку
                    </Link>

                    <Link href="/auth" className={cn(buttonBase, buttonVariants.ghost, buttonSizes.lg, 'w-full')}>
                        Вернуться к входу
                    </Link>
                </div>
            </AuthShell>
        )
    }

    // Success state
    if (isSuccess) {
        return (
            <AuthShell
                centered
                logo={false}
                icon={
                    <AuthStatusIcon tone="success">
                        <Check className="h-7 w-7" strokeWidth={1.8} />
                    </AuthStatusIcon>
                }
                title="Пароль успешно изменен!"
                description="Ваш пароль был успешно изменен. Теперь вы можете войти с новым паролем."
            >
                <p role="status" className="text-center text-sm text-fg-muted">Перенаправление на страницу входа...</p>
            </AuthShell>
        )
    }

    // Reset form
    return (
        <AuthShell title="Сброс пароля" description="Введите новый пароль.">
            <AuthPanel>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-fg-muted">
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
                            className="mb-1.5 block text-sm font-medium text-fg-muted"
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

                    <Button type="submit" size="lg" className="mt-1 w-full" isLoading={isLoading} disabled={isLoading}>
                        {isLoading ? 'Сброс пароля...' : 'Сбросить пароль'}
                    </Button>
                </form>
            </AuthPanel>

            <div className="mt-6 flex justify-center">
                <Link
                    href="/auth"
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary"
                >
                    <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Вернуться к входу
                </Link>
            </div>
        </AuthShell>
    )
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-canvas">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" />
            </div>
        }>
            <ResetPasswordContent />
        </Suspense>
    )
}
