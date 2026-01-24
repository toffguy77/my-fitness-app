'use client'

import { useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'

interface LoginFormProps {
    onSubmit?: (data: { email: string; password: string }) => void | Promise<void>
}

export function LoginForm({ onSubmit }: LoginFormProps) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
    const [isLoading, setIsLoading] = useState(false)

    const validateEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const newErrors: { email?: string; password?: string } = {}

        if (!email) {
            newErrors.email = 'Обязательное поле'
        } else if (!validateEmail(email)) {
            newErrors.email = 'Некорректный email'
        }

        if (!password) {
            newErrors.password = 'Обязательное поле'
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        setIsLoading(true)
        try {
            await onSubmit?.({ email, password })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="email" className="block text-sm font-medium">
                    Email
                </label>
                <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setEmail(e.target.value)
                        setErrors((prev) => ({ ...prev, email: undefined }))
                    }}
                    aria-invalid={!!errors.email}
                />
                {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                )}
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium">
                    Password
                </label>
                <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setPassword(e.target.value)
                        setErrors((prev) => ({ ...prev, password: undefined }))
                    }}
                    aria-invalid={!!errors.password}
                />
                {errors.password && (
                    <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                )}
            </div>

            <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? 'Загрузка...' : 'Войти'}
            </Button>
        </form>
    )
}
