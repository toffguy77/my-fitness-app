'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'

function LoginPageContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false)
  const [resendingEmail, setResendingEmail] = useState(false)

  useEffect(() => {
    const checkUser = async () => {
      logger.userFlow('Login: проверка существующей сессии')
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError) {
        logger.authentication('Login: ошибка проверки сессии', { error: userError.message })
        return
      }

      if (user) {
        logger.authentication('Login: найдена активная сессия', {
          userId: user.id,
          email: user.email,
          emailConfirmed: !!user.email_confirmed_at
        })
        setUser(user)

        // Загружаем профиль для определения роли
        logger.userFlow('Login: загрузка профиля для определения роли', { userId: user.id })
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profileError) {
          logger.error('Login: ошибка загрузки профиля', profileError, { userId: user.id })
        }

        const role = profile?.role || 'client'
        let redirectPath = '/app/dashboard'
        if (role === 'super_admin') {
          redirectPath = '/admin'
        } else if (role === 'curator') {
          redirectPath = '/app/curator'
        }

        logger.authentication('Login: редирект авторизованного пользователя', {
          userId: user.id,
          role,
          redirectPath
        })
        router.push(redirectPath)
      } else {
        logger.userFlow('Login: активная сессия не найдена')
      }
    }
    checkUser()
  }, [router, supabase])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    logger.authentication('Login: попытка входа', { email })

    logger.userFlow('Login: вызов signInWithPassword', { email })
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      logger.authentication('Login: ошибка входа', {
        email,
        error: error.message,
        errorCode: (error as any).code || 'unknown'
      })

      // Проверяем, связана ли ошибка с неподтвержденным email
      if (error.message.includes('Email not confirmed') || error.message.includes('email not confirmed')) {
        logger.userFlow('Login: email не подтвержден', { email })
        setNeedsEmailConfirmation(true)
        setError(
          'Email не подтвержден. Пожалуйста, проверьте вашу почту и перейдите по ссылке в письме. ' +
          'Если письмо не пришло, вы можете запросить его повторно.'
        )
      } else {
        setError(error.message)
      }
      setLoading(false)
    } else if (data.user) {
      logger.authentication('Login: успешный вход', {
        userId: data.user.id,
        email,
        emailConfirmed: !!data.user.email_confirmed_at,
        sessionId: data.session?.access_token?.substring(0, 20) || 'unknown'
      })
      setMessage('Успешный вход! Перенаправляем...')

      // Определяем роль и редиректим
      logger.userFlow('Login: загрузка профиля после успешного входа', { userId: data.user.id })
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()

      if (profileError) {
        logger.error('Login: ошибка загрузки профиля после входа', profileError, { userId: data.user.id })
      }

      const role = profile?.role || 'client'
      let redirectPath = '/app/dashboard'
      if (role === 'super_admin') {
        redirectPath = '/admin'
      } else if (role === 'curator') {
        redirectPath = '/app/curator'
      }

      logger.authentication('Login: редирект после успешного входа', {
        userId: data.user.id,
        role,
        redirectPath
      })

      setTimeout(() => {
        router.push(redirectPath)
        router.refresh()
      }, 500)
    }
  }

  const handleResendConfirmationEmail = async () => {
    if (!email) {
      setError('Пожалуйста, введите email адрес')
      return
    }

    logger.userFlow('Login: повторная отправка письма подтверждения', { email })
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
        logger.error('Login: ошибка повторной отправки письма', resendError, { email })
        setError('Ошибка отправки письма: ' + resendError.message)
      } else {
        logger.authentication('Login: письмо подтверждения отправлено повторно', { email })
        setMessage('Письмо с подтверждением отправлено! Проверьте вашу почту.')
        setNeedsEmailConfirmation(false)
      }
    } catch (err) {
      logger.error('Login: исключение при повторной отправке письма', err, { email })
      setError(err instanceof Error ? err.message : 'Произошла ошибка при отправке письма')
    } finally {
      setResendingEmail(false)
    }
  }

  // Проверяем параметры URL для сообщений об успешном подтверждении
  useEffect(() => {
    const errorParam = searchParams.get('error')
    const messageParam = searchParams.get('message')

    if (errorParam === 'invalid_code' && messageParam) {
      setError('Ошибка подтверждения: ' + decodeURIComponent(messageParam))
    } else if (errorParam === 'no_code') {
      setError('Отсутствует код подтверждения')
    } else if (!errorParam && searchParams.get('confirmed') === 'true') {
      setMessage('Email успешно подтвержден! Теперь вы можете войти в систему.')
    }
  }, [searchParams])

  return (
    <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans flex items-center justify-center">
      <div className="w-full bg-zinc-900 p-8 rounded-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Вход в систему</h1>
          <p className="text-sm text-zinc-400">
            Войдите в свой аккаунт для отслеживания питания и тренировок
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

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-100 mb-1">
              Email
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
              Пароль
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-sm text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none placeholder:text-zinc-600"
              placeholder="Введите пароль"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-zinc-950 bg-white hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <p className="text-zinc-500 mb-2">Нет аккаунта?</p>
          <Link href="/register" className="text-zinc-400 font-medium underline decoration-dotted hover:text-zinc-100">
            Зарегистрироваться бесплатно
          </Link>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-400 mx-auto mb-4"></div>
          <p className="text-zinc-400">Загрузка...</p>
        </div>
      </main>
    }>
      <LoginPageContent />
    </Suspense>
  )
}
