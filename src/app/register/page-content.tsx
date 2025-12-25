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
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false)
  const [resendingEmail, setResendingEmail] = useState(false)

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
      logger.userFlow('Register: валидация инвайт-кода - неверная длина', { codeLength: code.length })
      setCodeValidation({ valid: false })
      return
    }

    setValidatingCode(true)
    logger.userFlow('Register: начало валидации инвайт-кода', { code: code.toUpperCase() })
    try {
      const response = await fetch(`/api/invite-codes/validate?code=${encodeURIComponent(code)}`)
      const data: InviteCodeValidation = await response.json()
      setCodeValidation(data)
      if (data.valid) {
        logger.registration('Register: инвайт-код валиден', { 
          code: code.toUpperCase(), 
          coordinatorName: data.coordinator_name,
          expiresAt: data.expires_at,
          remainingUses: data.remaining_uses
        })
      } else {
        logger.userFlow('Register: инвайт-код невалиден', { code: code.toUpperCase() })
      }
    } catch (error) {
      logger.error('Register: ошибка валидации инвайт-кода', error, { code: code.toUpperCase() })
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

    logger.registration('Register: начало регистрации', { 
      email, 
      hasInviteCode: !!inviteCode,
      inviteCodeValid: codeValidation?.valid || false,
      hasFullName: !!fullName
    })

    try {
      // 1. Создаем пользователя в auth
      logger.userFlow('Register: создание пользователя в auth', { email })
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
        },
      })

      if (authError) {
        logger.registration('Register: ошибка создания пользователя в auth', { 
          error: authError.message,
          email 
        })
        setError(authError.message)
        setLoading(false)
        return
      }

      if (!authData.user) {
        logger.error('Register: пользователь не создан', new Error('User is null'), { email })
        setError('Ошибка создания пользователя')
        setLoading(false)
        return
      }

      logger.registration('Register: пользователь создан в auth', { 
        userId: authData.user.id,
        email: authData.user.email,
        emailConfirmed: !!authData.user.email_confirmed_at
      })

      // 2. Создаем профиль с ролью 'client' и статусом 'free'
      // ВАЖНО: Профиль создается всегда, даже если email не подтвержден,
      // чтобы пользователь мог войти после подтверждения email
      let coordinatorId: string | null = null

      // Если есть валидный инвайт-код, используем его
      if (inviteCode && codeValidation?.valid) {
        logger.userFlow('Register: использование инвайт-кода', { 
          code: inviteCode.toUpperCase(),
          userId: authData.user.id
        })
        try {
          const { data: coordinatorIdData, error: codeError } = await supabase.rpc(
            'use_invite_code',
            {
              code_param: inviteCode.toUpperCase(),
              user_id_param: authData.user.id,
            }
          )

          if (codeError) {
            logger.registration('Register: ошибка использования инвайт-кода', {
              error: codeError.message,
              code: inviteCode.toUpperCase(),
              userId: authData.user.id
            })
            // Продолжаем регистрацию без координатора
          } else {
            coordinatorId = coordinatorIdData
            logger.registration('Register: инвайт-код успешно использован', {
              code: inviteCode.toUpperCase(),
              userId: authData.user.id,
              coordinatorId
            })
          }
        } catch (err) {
          logger.error('Register: исключение при использовании инвайт-кода', err, {
            code: inviteCode.toUpperCase(),
            userId: authData.user.id
          })
          // Продолжаем регистрацию без координатора
        }
      } else {
        logger.userFlow('Register: регистрация без инвайт-кода', { userId: authData.user.id })
      }

      // Используем функцию create_user_profile для безопасного создания профиля
      // Эта функция обходит RLS, так как использует SECURITY DEFINER
      logger.userFlow('Register: создание профиля пользователя', {
        userId: authData.user.id,
        email,
        fullName: fullName || null,
        coordinatorId: coordinatorId || null
      })
      const { error: profileError } = await supabase.rpc('create_user_profile', {
        user_id: authData.user.id,
        user_email: email,
        user_full_name: fullName || null,
        user_role: 'client',
        user_coordinator_id: coordinatorId || null,
      })

      if (profileError) {
        logger.error('Register: ошибка создания профиля', profileError, {
          userId: authData.user.id,
          email
        })
        setError('Ошибка создания профиля: ' + profileError.message)
        setLoading(false)
        return
      }

      logger.registration('Register: профиль успешно создан', {
        userId: authData.user.id,
        email,
        coordinatorId: coordinatorId || null
      })

      // Отправляем уведомление координатору, если регистрация была по инвайт-коду
      if (coordinatorId && inviteCode && codeValidation?.valid) {
        try {
          // Получаем данные координатора для уведомления
          const { data: coordinatorProfile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', coordinatorId)
            .single()

          if (coordinatorProfile?.email) {
            // Отправляем email через API route (выполняется на сервере)
            try {
              const emailResponse = await fetch('/api/email/send', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: coordinatorProfile.email,
                  template: 'invite_code_registration',
                  data: {
                    coordinatorName: coordinatorProfile.full_name || undefined,
                    clientName: fullName || undefined,
                    clientEmail: email,
                    inviteCode: inviteCode.toUpperCase(),
                  },
                }),
              })

              if (emailResponse.ok) {
                logger.info('Register: уведомление координатору отправлено', {
                  coordinatorId,
                  clientId: authData.user.id,
                })
              } else {
                logger.warn('Register: ошибка отправки уведомления координатору', {
                  status: emailResponse.status,
                  coordinatorId,
                })
              }
            } catch (emailError) {
              logger.warn('Register: ошибка отправки уведомления координатору', {
                error: emailError instanceof Error ? emailError.message : String(emailError),
                coordinatorId,
              })
            }
          }
        } catch (emailError) {
          // Не критично, продолжаем регистрацию
          logger.warn('Register: ошибка отправки уведомления координатору', {
            error: emailError instanceof Error ? emailError.message : String(emailError),
          })
        }
      }

      // Проверяем, требуется ли подтверждение email
      if (authData.user && !authData.user.email_confirmed_at) {
        // Email не подтвержден - показываем сообщение и предлагаем отправить письмо повторно
        logger.registration('Register: регистрация завершена, требуется подтверждение email', {
          userId: authData.user.id,
          email
        })
        setNeedsEmailConfirmation(true)
        setMessage(
          'Регистрация успешна! Пожалуйста, проверьте вашу почту и подтвердите email адрес. ' +
          'Если письмо не пришло, вы можете запросить его повторно.'
        )
        setLoading(false)
      } else {
        // Email подтвержден - перенаправляем
        logger.registration('Register: регистрация завершена, email подтвержден, редирект на dashboard', {
          userId: authData.user.id,
          email
        })
        setMessage('Регистрация успешна! Перенаправляем...')

        setTimeout(() => {
          router.push('/app/dashboard')
          router.refresh()
        }, 1000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
      setLoading(false)
    }
  }

  const handleResendConfirmationEmail = async () => {
    if (!email) return

    logger.userFlow('Register: повторная отправка письма подтверждения', { email })
    setResendingEmail(true)
    setError(null)

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
        },
      })

      if (resendError) {
        logger.error('Register: ошибка повторной отправки письма', resendError, { email })
        setError('Ошибка отправки письма: ' + resendError.message)
      } else {
        logger.registration('Register: письмо подтверждения отправлено повторно', { email })
        setMessage('Письмо с подтверждением отправлено! Проверьте вашу почту.')
        setNeedsEmailConfirmation(false)
      }
    } catch (err) {
      logger.error('Register: исключение при повторной отправке письма', err, { email })
      setError(err instanceof Error ? err.message : 'Произошла ошибка при отправке письма')
    } finally {
      setResendingEmail(false)
    }
  }

  return (
    <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans flex items-center justify-center">
      <div className="w-full bg-zinc-900 p-8 rounded-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Регистрация</h1>
          <p className="text-sm text-zinc-400">
            Создайте бесплатный аккаунт для отслеживания питания
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-zinc-800 border border-red-400/20 text-red-400 text-sm rounded-lg">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-zinc-800 border border-emerald-400/20 text-emerald-400 text-sm rounded-lg">
            {message}
          </div>
        )}

        {needsEmailConfirmation && (
          <div className="mb-4 p-4 bg-zinc-800 border border-zinc-700 text-sm rounded-lg">
            <p className="font-medium mb-2 text-zinc-100">Требуется подтверждение email</p>
            <p className="mb-3 text-zinc-300">
              Мы отправили письмо с подтверждением на адрес <strong className="text-zinc-100">{email}</strong>.
              Пожалуйста, проверьте вашу почту и перейдите по ссылке в письме.
            </p>
            <p className="mb-3 text-xs text-zinc-400">
              Не получили письмо? Проверьте папку "Спам" или запросите отправку повторно.
            </p>
            <button
              type="button"
              onClick={handleResendConfirmationEmail}
              disabled={resendingEmail}
              className="w-full py-2 px-4 rounded-lg font-medium text-zinc-950 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {resendingEmail ? 'Отправка...' : 'Отправить письмо повторно'}
            </button>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label htmlFor="inviteCode" className="block text-sm font-medium text-zinc-100 mb-1">
              Инвайт-код (необязательно)
            </label>
            <div className="relative">
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                className="w-full p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-sm text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none font-mono uppercase placeholder:text-zinc-600"
                placeholder="XXXXXXXX"
                maxLength={8}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {validatingCode ? (
                  <Loader2 size={18} className="animate-spin text-zinc-500" />
                ) : codeValidation?.valid ? (
                  <CheckCircle size={18} className="text-emerald-400" />
                ) : inviteCode.length === 8 && codeValidation?.valid === false ? (
                  <XCircle size={18} className="text-red-400" />
                ) : null}
              </div>
            </div>
            {codeValidation?.valid && codeValidation.coordinator_name && (
              <p className="mt-1 text-xs text-emerald-400">
                ✓ Код валиден. Координатор: {codeValidation.coordinator_name}
              </p>
            )}
            {inviteCode.length === 8 && codeValidation?.valid === false && (
              <p className="mt-1 text-xs text-red-400">
                ✗ Неверный или истекший код
              </p>
            )}
            {codeValidation?.expires_at && (
              <p className="mt-1 text-xs text-zinc-500">
                Истекает: {new Date(codeValidation.expires_at).toLocaleDateString('ru-RU')}
              </p>
            )}
            {codeValidation?.remaining_uses !== undefined && (
              <p className="mt-1 text-xs text-zinc-500 tabular-nums">
                Осталось использований: {codeValidation.remaining_uses}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-zinc-100 mb-1">
              Имя (необязательно)
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-sm text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none placeholder:text-zinc-600"
              placeholder="Ваше имя"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-100 mb-1">
              Email *
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-sm text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none placeholder:text-zinc-600"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-100 mb-1">
              Пароль *
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-sm text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none placeholder:text-zinc-600"
              placeholder="Минимум 6 символов"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-zinc-950 bg-white hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Регистрация...' : 'Создать аккаунт'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <p className="text-zinc-500 mb-2">Уже есть аккаунт?</p>
          <Link href="/login" className="text-zinc-400 font-medium underline decoration-dotted hover:text-zinc-100">
            Войти
          </Link>
        </div>
      </div>
    </main>
  )
}

