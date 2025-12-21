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
      logger.debug('Login: проверка существующей сессии')
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError) {
        logger.warn('Login: ошибка проверки сессии', { error: userError.message })
        return
      }

      if (user) {
        logger.info('Login: найдена активная сессия', { userId: user.id })
        setUser(user)

        // Загружаем профиль для определения роли
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
        } else if (role === 'coach') {
          redirectPath = '/app/coach'
        }

        logger.info('Login: редирект авторизованного пользователя', { userId: user.id, role, redirectPath })
        router.push(redirectPath)
      }
    }
    checkUser()
  }, [router, supabase])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    logger.info('Login: попытка входа', { email })

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      logger.error('Login: ошибка входа', error, { email })
      
      // Проверяем, связана ли ошибка с неподтвержденным email
      if (error.message.includes('Email not confirmed') || error.message.includes('email not confirmed')) {
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
      logger.info('Login: успешный вход', { userId: data.user.id, email })
      setMessage('Успешный вход! Перенаправляем...')

      // Определяем роль и редиректим
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
      } else if (role === 'coach') {
        redirectPath = '/app/coach'
      }

      logger.info('Login: редирект после успешного входа', { userId: data.user.id, role, redirectPath })

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
        setError('Ошибка отправки письма: ' + resendError.message)
      } else {
        setMessage('Письмо с подтверждением отправлено! Проверьте вашу почту.')
        setNeedsEmailConfirmation(false)
      }
    } catch (err) {
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
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans flex items-center justify-center">
      <div className="w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Вход в систему</h1>
          <p className="text-sm text-gray-600">
            Войдите в свой аккаунт для отслеживания питания и тренировок
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

        {needsEmailConfirmation && (
          <div className="mb-4 p-4 bg-blue-50 text-blue-800 text-sm rounded-lg border border-blue-200">
            <p className="font-medium mb-2">Требуется подтверждение email</p>
            <p className="mb-3">
              Мы отправили письмо с подтверждением на адрес <strong>{email}</strong>. 
              Пожалуйста, проверьте вашу почту и перейдите по ссылке в письме.
            </p>
            <p className="mb-3 text-xs text-blue-600">
              Не получили письмо? Проверьте папку "Спам" или запросите отправку повторно.
            </p>
            <button
              type="button"
              onClick={handleResendConfirmationEmail}
              disabled={resendingEmail}
              className="w-full py-2 px-4 rounded-lg font-medium text-blue-800 bg-blue-100 hover:bg-blue-200 disabled:bg-blue-50 disabled:text-blue-400 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {resendingEmail ? 'Отправка...' : 'Отправить письмо повторно'}
            </button>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
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
              Пароль
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
              placeholder="Введите пароль"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-white bg-black hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <p className="text-gray-500 mb-2">Нет аккаунта?</p>
          <Link href="/register" className="text-black font-medium underline decoration-dotted">
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
      <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </main>
    }>
      <LoginPageContent />
    </Suspense>
  )
}

