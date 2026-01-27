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
                    <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-gray-700">
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
                        'flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm',
                        'placeholder:text-gray-400',
                        'focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        error && 'border-red-500 focus:ring-red-600',
                        className
                    )}
                    {...props}
                />
                {error && (
                    <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
                        {error}
                    </p>
                )}
                {helperText && !error && (
                    <p id={helperId} className="mt-1 text-sm text-gray-500">
                        {helperText}
                    </p>
                )}
            </div>
        )
    }
)

Input.displayName = 'Input'
