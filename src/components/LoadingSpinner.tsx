'use client'

type LoadingSpinnerProps = {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  }

  return (
    <div
      className={`inline-block animate-spin rounded-full border-gray-300 border-t-black ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Загрузка"
    >
      <span className="sr-only">Загрузка...</span>
    </div>
  )
}

