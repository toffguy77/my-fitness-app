'use client'

import { useEffect, useRef } from 'react'
import { X, AlertTriangle, Info, AlertCircle } from 'lucide-react'

export type ConfirmVariant = 'danger' | 'warning' | 'info'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  variant?: ConfirmVariant
  confirmText?: string
  cancelText?: string
  isLoading?: boolean
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  variant = 'info',
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  isLoading = false,
}: ConfirmModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  // Закрытие по Escape
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose, isLoading])

  // Фокус на кнопке подтверждения при открытии
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      // Небольшая задержка для анимации
      setTimeout(() => {
        confirmButtonRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Блокировка скролла body при открытом модальном окне
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleConfirm = () => {
    if (!isLoading) {
      onConfirm()
    }
  }

  const handleCancel = () => {
    if (!isLoading) {
      onClose()
    }
  }

  // Обработка Enter для подтверждения
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      e.preventDefault()
      handleConfirm()
    }
  }

  const variantStyles = {
    danger: {
      icon: AlertCircle,
      iconColor: 'text-red-400',
      iconBg: 'bg-zinc-800 border border-red-400/20',
      confirmButton: 'bg-zinc-800 text-zinc-400 hover:text-red-400',
      border: 'border-red-400/20',
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      iconBg: 'bg-zinc-800 border border-amber-400/20',
      confirmButton: 'bg-zinc-800 text-zinc-400 hover:text-amber-400',
      border: 'border-amber-400/20',
    },
    info: {
      icon: Info,
      iconColor: 'text-zinc-400',
      iconBg: 'bg-zinc-800',
      confirmButton: 'bg-white text-zinc-950 hover:bg-zinc-200',
      border: 'border-zinc-800',
    },
  }

  const style = variantStyles[variant]
  const Icon = style.icon

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative bg-zinc-900 rounded-2xl shadow-xl max-w-md w-full border-2 border-zinc-800 animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-zinc-800">
          <div className={`flex-shrink-0 w-12 h-12 rounded-full ${style.iconBg} flex items-center justify-center`}>
            <Icon size={24} className={style.iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="confirm-title" className="text-lg font-bold text-zinc-100 mb-2">
              {title}
            </h3>
            <p id="confirm-message" className="text-sm text-zinc-400">
              {message}
            </p>
          </div>
          {!isLoading && (
            <button
              onClick={handleCancel}
              className="flex-shrink-0 p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800"
              aria-label="Закрыть"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6">
          <button
            ref={cancelButtonRef}
            onClick={handleCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-zinc-700 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={handleConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
              variant === 'danger'
                ? 'focus:ring-red-400'
                : variant === 'warning'
                ? 'focus:ring-amber-400'
                : 'focus:ring-white'
            } ${style.confirmButton}`}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <div className={`w-4 h-4 border-2 ${variant === 'info' ? 'border-zinc-950' : 'border-zinc-400'} border-t-transparent rounded-full animate-spin`} />
                Обработка...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
