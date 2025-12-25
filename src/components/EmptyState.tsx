'use client'

import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

export type EmptyStateVariant = 'default' | 'minimal' | 'illustration'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  variant?: EmptyStateVariant
  className?: string
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'default',
  className = '',
}: EmptyStateProps) {
  const baseStyles = 'flex flex-col items-center justify-center text-center'
  
  const variantStyles = {
    default: 'py-12 px-4',
    minimal: 'py-6 px-4',
    illustration: 'py-16 px-4',
  }

  const iconSize = variant === 'illustration' ? 64 : variant === 'default' ? 48 : 32
  const iconColor = variant === 'illustration' ? 'text-zinc-500' : 'text-zinc-600'

  return (
    <div className={`${baseStyles} ${variantStyles[variant]} ${className}`}>
      {Icon && (
        <div className={`mb-4 ${variant === 'illustration' ? 'mb-6' : ''}`}>
          <Icon size={iconSize} className={iconColor} strokeWidth={variant === 'illustration' ? 1.5 : 2} />
        </div>
      )}
      <h3 className={`font-semibold text-zinc-100 mb-2 ${variant === 'illustration' ? 'text-xl' : variant === 'default' ? 'text-lg' : 'text-base'}`}>
        {title}
      </h3>
      {description && (
        <p className={`text-zinc-400 mb-4 max-w-md ${variant === 'illustration' ? 'text-base' : 'text-sm'}`}>
          {description}
        </p>
      )}
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  )
}

