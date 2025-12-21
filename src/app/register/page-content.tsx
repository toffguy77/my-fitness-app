'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { logger } from '@/utils/logger'
// Email отправляется через API route, импорт не нужен
import type { InviteCodeValidation } from '@/types/invites'

export default function RegisterPage() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [codeValidation, setCodeValidation] = useState<InviteCodeValidation | null>(null)
  const [validatingCode, setValidatingCode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Извлекаем код из URL при загрузке
  useEffect(() => {
    const codeFromUrl = searchParams.get('code')
    if (codeFromUrl) {
      setInviteCode(codeFromUrl.toUpperCase())
      validateInviteCode(codeFromUrl)
    }
  }, [searchParams])

  // Валидация инвайт-кода
  const validateInviteCode = async (code: string) => {
    if (!code || code.length !== 8) {
      setCodeValidation({ valid: false })
      return
    }

    setValidatingCode(true)
    try {
      const response = await fetch(`/api/invite-codes/validate?code=${encodeURIComponent(code)}`)
      const data: InviteCodeValidation = await response.json()
      setCodeValidation(data)
    } catch (error) {
      setCodeValidation({ valid: false })
    } finally {
      setValidatingCode(false)
    }
  }

  // Валидация при изменении кода
  useEffect(() => {
    if (inviteCode && inviteCode.length === 8) {
      const timeoutId = setTimeout(() => {
        validateInviteCode(inviteCode)
      }, 500) // Debounce 500ms

      return () => clearTimeout(timeoutId)
    } else if (inviteCode.length === 0) {
      setCodeValidation(null)
    } else {
      setCodeValidation({ valid: false })
    }
  }, [inviteCode])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      // 1. Создаем пользователя в auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      if (!authData.user) {
        setError('Ошибка создания пользователя')
        setLoading(false)
        return
      }

      // 2. Создаем профиль с ролью 'client' и статусом 'free'
      let coachId: string | null = null

      // Если есть валидный инвайт-код, используем его
      if (inviteCode && codeValidation?.valid) {
        try {
          const { data: coachIdData, error: codeError } = await supabase.rpc(
            'use_invite_code',
            {
              code_param: inviteCode.toUpperCase(),
              user_id_param: authData.user.id,
            }
          )

          if (codeError) {
            logger.warn('Register: ошибка использования инвайт-кода', {
              error: codeError.message,
            })
            // Продолжаем регистрацию без тренера
          } else {
            coachId = coachIdData
          }
        } catch (err) {
          logger.warn('Register: ошибка использования инвайт-кода', {
            error: err instanceof Error ? err.message : String(err),
          })
          // Продолжаем регистрацию без тренера
        }
      }

      // Используем функцию create_user_profile для безопасного создания профиля
      // Эта функция обходит RLS, так как использует SECURITY DEFINER
      const { error: profileError } = await supabase.rpc('create_user_profile', {
        user_id: authData.user.id,
        user_email: email,
        user_full_name: fullName || null,
        user_role: 'client',
        user_coach_id: coachId || null,
      })

      if (profileError) {
        setError('Ошибка создания профиля: ' + profileError.message)
        setLoading(false)
        return
      }

      // Отправляем уведомление тренеру, если регистрация была по инвайт-коду
      if (coachId && inviteCode && codeValidation?.valid) {
        try {
          // Получаем данные тренера для уведомления
          const { data: coachProfile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', coachId)
            .single()

          if (coachProfile?.email) {
            // Отправляем email через API route (выполняется на сервере)
            try {
              const emailResponse = await fetch('/api/email/send', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: coachProfile.email,
                  template: 'invite_code_registration',
                  data: {
                    coachName: coachProfile.full_name || undefined,
                    clientName: fullName || undefined,
                    clientEmail: email,
                    inviteCode: inviteCode.toUpperCase(),
                  },
                }),
              })

              if (emailResponse.ok) {
                logger.info('Register: уведомление тренеру отправлено', {
                  coachId,
                  clientId: authData.user.id,
                })
              } else {
                logger.warn('Register: ошибка отправки уведомления тренеру', {
                  status: emailResponse.status,
                  coachId,
                })
              }
            } catch (emailError) {
              logger.warn('Register: ошибка отправки уведомления тренеру', {
                error: emailError instanceof Error ? emailError.message : String(emailError),
                coachId,
              })
            }
          }
        } catch (emailError) {
          // Не критично, продолжаем регистрацию
          logger.warn('Register: ошибка отправки уведомления тренеру', {
            error: emailError instanceof Error ? emailError.message : String(emailError),
          })
        }
      }

      setMessage('Регистрация успешна! Перенаправляем...')

      setTimeout(() => {
        router.push('/app/dashboard')
        router.refresh()
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
      setLoading(false)
    }
  }

  return (
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans flex items-center justify-center">
      <div className="w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Регистрация</h1>
          <p className="text-sm text-gray-600">
            Создайте бесплатный аккаунт для отслеживания питания
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200">
            {message}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700 mb-1">
              Инвайт-код (необязательно)
            </label>
            <div className="relative">
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none font-mono uppercase"
                placeholder="XXXXXXXX"
                maxLength={8}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {validatingCode ? (
                  <Loader2 size={18} className="animate-spin text-gray-400" />
                ) : codeValidation?.valid ? (
                  <CheckCircle size={18} className="text-green-600" />
                ) : inviteCode.length === 8 && codeValidation?.valid === false ? (
                  <XCircle size={18} className="text-red-600" />
                ) : null}
              </div>
            </div>
            {codeValidation?.valid && codeValidation.coach_name && (
              <p className="mt-1 text-xs text-green-600">
                ✓ Код валиден. Тренер: {codeValidation.coach_name}
              </p>
            )}
            {inviteCode.length === 8 && codeValidation?.valid === false && (
              <p className="mt-1 text-xs text-red-600">
                ✗ Неверный или истекший код
              </p>
            )}
            {codeValidation?.expires_at && (
              <p className="mt-1 text-xs text-gray-500">
                Истекает: {new Date(codeValidation.expires_at).toLocaleDateString('ru-RU')}
              </p>
            )}
            {codeValidation?.remaining_uses !== undefined && (
              <p className="mt-1 text-xs text-gray-500">
                Осталось использований: {codeValidation.remaining_uses}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
              Имя (необязательно)
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
              placeholder="Ваше имя"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Пароль *
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
              placeholder="Минимум 6 символов"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-white bg-black hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Регистрация...' : 'Создать аккаунт'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <p className="text-gray-500 mb-2">Уже есть аккаунт?</p>
          <Link href="/login" className="text-black font-medium underline decoration-dotted">
            Войти
          </Link>
        </div>
      </div>
    </main>
  )
}

