/**
 * Checkbox component with label and error state
 * Supports hyperlinked labels for legal documents
 *
 * Validates: Requirements AC-2.3, AC-2.6, AC-4.1, AC-4.2, TR-4.1
 */

import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    label?: ReactNode;
    error?: boolean;
    helperText?: string;
}

let checkboxCounter = 0;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
    ({ className, label, error, helperText, id, ...props }, ref) => {
        const checkboxId = id || `checkbox-${++checkboxCounter}`;
        const helperId = helperText ? `${checkboxId}-helper` : undefined;

        return (
            <div className="flex items-start">
                <div className="flex h-5 items-center">
                    <input
                        ref={ref}
                        type="checkbox"
                        id={checkboxId}
                        aria-invalid={error}
                        aria-describedby={helperId}
                        className={cn(
                            'h-4 w-4 rounded border-gray-300 text-blue-600',
                            'focus:ring-2 focus:ring-blue-600 focus:ring-offset-2',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                            error && 'border-red-500 focus:ring-red-600',
                            className
                        )}
                        {...props}
                    />
                </div>
                {label && (
                    <div className="ml-3 text-sm">
                        <label
                            htmlFor={checkboxId}
                            className={cn(
                                'font-medium text-gray-700',
                                error && 'text-red-600'
                            )}
                        >
                            {label}
                        </label>
                        {helperText && (
                            <p
                                id={helperId}
                                className={cn(
                                    'text-gray-500',
                                    error && 'text-red-600'
                                )}
                            >
                                {helperText}
                            </p>
                        )}
                    </div>
                )}
            </div>
        );
    }
);

Checkbox.displayName = 'Checkbox';
