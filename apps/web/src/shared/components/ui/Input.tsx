import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/shared/utils/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    error?: string
    helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, helperText, id, ...props }, ref) => {
        const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
        const errorId = error ? `${inputId}-error` : undefined
        const helperId = helperText ? `${inputId}-helper` : undefined

        return (
            <div className="w-full">
                {label && (
                    <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-fg-muted">
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    aria-label={label || props['aria-label']}
                    aria-required={props.required}
                    aria-invalid={!!error}
                    aria-describedby={error ? errorId : helperId}
                    className={cn(
                        // 16 px текста — iOS не увеличивает страницу при фокусе.
                        'flex h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums',
                        'placeholder:text-fg-subtle',
                        'transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        error && 'border-danger focus:ring-danger',
                        className
                    )}
                    {...props}
                />
                {error && (
                    <p id={errorId} className="mt-1 text-sm text-danger-fg" role="alert">
                        {error}
                    </p>
                )}
                {helperText && !error && (
                    <p id={helperId} className="mt-1 text-sm text-fg-muted">
                        {helperText}
                    </p>
                )}
            </div>
        )
    }
)

Input.displayName = 'Input'
