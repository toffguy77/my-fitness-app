'use client'

import { ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw, Home, Mail, Copy, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface ErrorDisplayProps {
  error: Error | null
  errorInfo?: ErrorInfo | null
  onReset?: () => void
  title?: string
  description?: string
}

export default function ErrorDisplay({
  error,
  errorInfo,
  onReset,
  title,
  description,
}: ErrorDisplayProps) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  const handleCopyError = () => {
    const errorText = `
Ошибка: ${error?.message || 'Неизвестная ошибка'}
Стек: ${error?.stack || 'Нет стека'}
${errorInfo ? `Компонент: ${errorInfo.componentStack}` : ''}
Время: ${new Date().toLocaleString('ru-RU')}
    `.trim()

    navigator.clipboard.writeText(errorText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getErrorSuggestions = (): string[] => {
    const suggestions: string[] = []

    if (error?.message.includes('network') || error?.message.includes('fetch')) {
      suggestions.push('Проверьте подключение к интернету')
      suggestions.push('Попробуйте обновить страницу')
    } else if (error?.message.includes('permission') || error?.message.includes('unauthorized')) {
      suggestions.push('Проверьте, что вы авторизованы в системе')
      suggestions.push('Попробуйте выйти и войти снова')
    } else if (error?.message.includes('database') || error?.message.includes('supabase')) {
      suggestions.push('Возможно, проблема с базой данных')
      suggestions.push('Попробуйте обновить страницу через несколько секунд')
    } else {
      suggestions.push('Попробуйте обновить страницу')
      suggestions.push('Очистите кэш браузера')
      suggestions.push('Если проблема сохраняется, свяжитесь с поддержкой')
    }

    return suggestions
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        {/* Иконка и заголовок */}
        <div className="flex items-start gap-4 mb-6">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {title || 'Произошла ошибка'}
            </h1>
            <p className="text-gray-600">
              {description || 'Что-то пошло не так. Мы уже работаем над исправлением.'}
            </p>
          </div>
        </div>

        {/* Детали ошибки */}
        {error && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900">Детали ошибки:</h3>
              <button
                onClick={handleCopyError}
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                title="Скопировать информацию об ошибке"
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    Скопировано
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Копировать
                  </>
                )}
              </button>
            </div>
            <p className="text-sm text-gray-700 font-mono break-words">
              {error.message || 'Неизвестная ошибка'}
            </p>
            {process.env.NODE_ENV === 'development' && error.stack && (
              <details className="mt-3">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  Показать стек ошибки
                </summary>
                <pre className="mt-2 text-xs text-gray-600 overflow-auto max-h-40 p-2 bg-white rounded border border-gray-200">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Предложения по исправлению */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Что можно сделать:</h3>
          <ul className="space-y-2">
            {getErrorSuggestions().map((suggestion, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="text-gray-400 mt-1">•</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Кнопки действий */}
        <div className="flex flex-col sm:flex-row gap-3">
          {onReset && (
            <button
              onClick={onReset}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              <RefreshCw size={18} />
              Попробовать снова
            </button>
          )}
          <button
            onClick={() => router.push('/app/dashboard')}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <Home size={18} />
            На главную
          </button>
          <a
            href="mailto:support@fitnessapp.com?subject=Ошибка в приложении"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <Mail size={18} />
            Связаться с поддержкой
          </a>
        </div>
      </div>
    </div>
  )
}

