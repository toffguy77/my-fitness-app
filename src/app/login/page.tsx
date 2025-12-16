'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const [, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        
        // Загружаем профиль для определения роли
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        
        const role = profile?.role || 'client'
        let redirectPath = '/app/dashboard'
        if (role === 'super_admin') {
          redirectPath = '/admin'
        } else if (role === 'coach') {
          redirectPath = '/app/coach'
        }
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.user) {
      setMessage('Успешный вход! Перенаправляем...')
      
      // Определяем роль и редиректим
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()
      
      const role = profile?.role || 'client'
      let redirectPath = '/app/dashboard'
      if (role === 'super_admin') {
        redirectPath = '/admin'
      } else if (role === 'coach') {
        redirectPath = '/app/coach'
      }
      
      setTimeout(() => {
        router.push(redirectPath)
        router.refresh()
      }, 500)
    }
  }

  return (
    <main className="max-w-md mx-auto min-h-screen bg-gray-50 p-4 font-sans flex items-center justify-center">
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
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-black outline-none"
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
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-black outline-none"
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

