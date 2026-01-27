'use client'

import { forwardRef, useState } from 'react'
import { Input } from '../ui/Input'
import { Eye, EyeOff, Check, X } from 'lucide-react'

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    showRequirements?: boolean
    showStrengthIndicator?: boolean
    error?: string
}

interface PasswordRequirements {
    minLength: boolean
    hasUppercase: boolean
    hasLowercase: boolean
    hasNumber: boolean
    hasSpecialChar: boolean
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
    ({ showRequirements = false, showStrengthIndicator = false, error, value, onChange, ...props }, ref) => {
        const [showPassword, setShowPassword] = useState(false)
        const [requirements, setRequirements] = useState<PasswordRequirements>({
            minLength: false,
            hasUppercase: false,
            hasLowercase: false,
            hasNumber: false,
            hasSpecialChar: false,
        })

        const validatePassword = (password: string): PasswordRequirements => {
            return {
                minLength: password.length >= 8,
                hasUppercase: /[A-Z]/.test(password),
                hasLowercase: /[a-z]/.test(password),
                hasNumber: /[0-9]/.test(password),
                hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
            }
        }

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const newValue = e.target.value
            if (showRequirements || showStrengthIndicator) {
                setRequirements(validatePassword(newValue))
            }
            onChange?.(e)
        }

        const getStrength = (): { label: string; color: string; width: string } => {
            const password = (value as string) || ''
            const reqs = validatePassword(password)
            const metCount = Object.values(reqs).filter(Boolean).length

            if (password.length === 0) {
                return { label: '', color: '', width: '0%' }
            }
            if (metCount <= 2) {
                return { label: 'Слабый', color: 'bg-red-500', width: '33%' }
            }
            if (metCount <= 4) {
                return { label: 'Средний', color: 'bg-yellow-500', width: '66%' }
            }
            return { label: 'Сильный', color: 'bg-green-500', width: '100%' }
        }

        const strength = showStrengthIndicator ? getStrength() : null

        return (
            <div className="space-y-2">
                <div className="relative">
                    <Input
                        ref={ref}
                        type={showPassword ? 'text' : 'password'}
                        value={value}
                        onChange={handleChange}
                        error={error}
                        {...props}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                        aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    >
                        {showPassword ? (
                            <EyeOff className="h-5 w-5" />
                        ) : (
                            <Eye className="h-5 w-5" />
                        )}
                    </button>
                </div>

                {showStrengthIndicator && strength && strength.label && (
                    <div className="space-y-1">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-300 ${strength.color}`}
                                style={{ width: strength.width }}
                            />
                        </div>
                        <p className="text-sm text-gray-600">
                            Надежность пароля: <span className="font-medium">{strength.label}</span>
                        </p>
                    </div>
                )}

                {showRequirements && (
                    <div className="space-y-2 text-sm">
                        <p className="font-medium text-gray-700">Пароль должен содержать:</p>
                        <ul className="space-y-1">
                            <RequirementItem met={requirements.minLength} text="Минимум 8 символов" />
                            <RequirementItem met={requirements.hasUppercase} text="Одну заглавную букву" />
                            <RequirementItem met={requirements.hasLowercase} text="Одну строчную букву" />
                            <RequirementItem met={requirements.hasNumber} text="Одну цифру" />
                            <RequirementItem met={requirements.hasSpecialChar} text="Один специальный символ" />
                        </ul>
                    </div>
                )}
            </div>
        )
    }
)

PasswordInput.displayName = 'PasswordInput'

interface RequirementItemProps {
    met: boolean
    text: string
}

function RequirementItem({ met, text }: RequirementItemProps) {
    return (
        <li className="flex items-center gap-2">
            {met ? (
                <Check className="h-4 w-4 text-green-600" aria-label="Требование выполнено" />
            ) : (
                <X className="h-4 w-4 text-gray-400" aria-label="Требование не выполнено" />
            )}
            <span className={met ? 'text-green-700' : 'text-gray-600'}>{text}</span>
        </li>
    )
}
