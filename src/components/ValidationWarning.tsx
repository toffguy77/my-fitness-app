'use client'

import { AlertCircle, AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'

export type ValidationWarningProps = {
  errors?: string[]
  warnings?: string[]
  onDismiss?: () => void
  className?: string
}

/**
 * Компонент для отображения предупреждений и ошибок валидации
 */
export default function ValidationWarning({
  errors = [],
  warnings = [],
  onDismiss,
  className = '',
}: ValidationWarningProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || (errors.length === 0 && warnings.length === 0)) {
    return null
  }

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Ошибки */}
      {errors.length > 0 && (
        <div className="p-3 bg-rose-950/20 border border-rose-800/50 rounded-lg text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-rose-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-rose-300 mb-1">Ошибки валидации:</div>
              <ul className="list-disc list-inside space-y-1 text-rose-200">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
            {onDismiss && (
              <button
                onClick={handleDismiss}
                className="text-rose-400 hover:text-rose-300 flex-shrink-0"
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Предупреждения */}
      {warnings.length > 0 && (
        <div className="p-3 bg-amber-950/20 border border-amber-800/50 rounded-lg text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-amber-300 mb-1">Предупреждения:</div>
              <ul className="list-disc list-inside space-y-1 text-amber-200">
                {warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
            {onDismiss && (
              <button
                onClick={handleDismiss}
                className="text-amber-400 hover:text-amber-300 flex-shrink-0"
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Компактная версия для inline отображения в формах
 */
export function InlineValidationWarning({
  errors = [],
  warnings = [],
  className = '',
}: ValidationWarningProps) {
  if (errors.length === 0 && warnings.length === 0) {
    return null
  }

  return (
    <div className={`text-xs ${className}`}>
      {errors.length > 0 && (
        <div className="text-rose-400 flex items-center gap-1">
          <AlertCircle size={12} />
          <span>{errors[0]}</span>
        </div>
      )}
      {warnings.length > 0 && errors.length === 0 && (
        <div className="text-amber-400 flex items-center gap-1">
          <AlertTriangle size={12} />
          <span>{warnings[0]}</span>
        </div>
      )}
    </div>
  )
}
