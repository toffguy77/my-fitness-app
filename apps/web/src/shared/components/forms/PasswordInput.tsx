'use client'

import { forwardRef, useState } from 'react'
import { Input, type InputProps } from '../ui/Input'
import { IconButton } from '../ui/Button'
import { Eye, EyeOff, Check, X } from 'lucide-react'
import { PASSWORD_RULES } from '@/shared/validation/password'
import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'

export interface PasswordInputProps extends InputProps {
    showRequirements?: boolean
    showStrengthIndicator?: boolean
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
    ({ showRequirements = false, showStrengthIndicator = false, error, value, onChange, className, ...props }, ref) => {
        const [showPassword, setShowPassword] = useState(false)

        // Состояние правил выводится из текущего значения, а не хранится
        // отдельным useState, обновляемым в onChange: значение здесь
        // управляемое, и список, живущий своей жизнью, расходился с полем
        // каждый раз, когда значение меняли не набором с клавиатуры —
        // подстановкой менеджера паролей, сбросом формы, начальным значением.
        const current = (value as string) ?? ''
        const met = PASSWORD_RULES.map((rule) => rule.satisfied(current))

        const getStrength = (): { label: string; color: string; width: string } => {
            const password = current
            const metCount = met.filter(Boolean).length

            if (password.length === 0) {
                return { label: '', color: '', width: '0%' }
            }
            if (metCount <= 3) {
                return { label: 'Слабый', color: 'bg-danger', width: '33%' }
            }
            if (metCount <= 5) {
                return { label: 'Средний', color: 'bg-warning', width: '66%' }
            }
            return { label: 'Сильный', color: 'bg-success', width: '100%' }
        }

        const strength = showStrengthIndicator ? getStrength() : null

        return (
            <div className="space-y-2">
                <div className="relative">
                    <Input
                        ref={ref}
                        type={showPassword ? 'text' : 'password'}
                        value={value}
                        onChange={onChange}
                        error={error}
                        className={cn('pr-12', className)}
                        {...props}
                    />
                    {/*
                        Кнопка стоит против поля, а не против всего блока: над полем
                        может быть подпись (20 px строки + 6 px отступа у Input), под
                        ним — ошибка, и «по центру блока» уезжало с поля.
                        Область нажатия 44 px — внутри поля высотой 48.
                    */}
                    <IconButton
                        variant="ghost"
                        onClick={() => setShowPassword(!showPassword)}
                        className={cn(
                            'absolute right-0.5 text-fg-muted hover:bg-transparent hover:text-fg focus-visible:ring-offset-0',
                            props.label ? 'top-[28px]' : 'top-0.5'
                        )}
                        aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    >
                        {showPassword ? (
                            <EyeOff className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                        ) : (
                            <Eye className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                        )}
                    </IconButton>
                </div>

                {showStrengthIndicator && strength && strength.label && (
                    <div className="space-y-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-track">
                            <div
                                className={`h-full transition-all duration-300 ${strength.color}`}
                                style={{ width: strength.width }}
                            />
                        </div>
                        <p className="text-sm text-fg-muted">
                            Надежность пароля: <span className="font-medium">{strength.label}</span>
                        </p>
                    </div>
                )}

                {/*
                    Список требований отрисовывается из PASSWORD_RULES — того
                    же массива, из которого собрана схема проверки. Раньше он
                    перечислял правила своими словами и своими регулярками:
                    список и схема могли разойтись, и форма показывала бы
                    зелёные пункты, отклоняя отправку.
                */}
                {showRequirements && current.length > 0 && (
                    <div className="space-y-2 text-sm" data-testid="password-checklist">
                        <p className="font-medium text-fg-muted">{t('auth.validation.mustContain')}</p>
                        <ul className="space-y-1">
                            {PASSWORD_RULES.map((rule, index) => (
                                <RequirementItem
                                    key={rule.id}
                                    id={rule.id}
                                    met={met[index]}
                                    text={rule.message}
                                />
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        )
    }
)

PasswordInput.displayName = 'PasswordInput'

interface RequirementItemProps {
    id: string
    met: boolean
    text: string
}

function RequirementItem({ id, met, text }: RequirementItemProps) {
    return (
        <li className="flex items-center gap-2" data-testid={`password-rule-${id}`} data-met={met}>
            {met ? (
                <Check className="h-4 w-4 shrink-0 text-success-fg" strokeWidth={2} aria-label="Требование выполнено" />
            ) : (
                <X className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={2} aria-label="Требование не выполнено" />
            )}
            <span className={met ? 'text-success-fg' : 'text-fg-muted'}>{text}</span>
        </li>
    )
}
