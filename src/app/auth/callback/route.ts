import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { logger } from '@/utils/logger'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/app/dashboard'

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      logger.error('Auth callback: отсутствуют переменные окружения Supabase')
      return NextResponse.redirect(new URL('/login?error=configuration', requestUrl))
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value)
            })
          },
        },
      }
    )

    try {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

      if (exchangeError) {
        logger.error('Auth callback: ошибка обмена кода на сессию', exchangeError)
        return NextResponse.redirect(new URL(`/login?error=invalid_code&message=${encodeURIComponent(exchangeError.message)}`, requestUrl))
      }

      // Получаем пользователя после обмена кода
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        logger.error('Auth callback: ошибка получения пользователя', userError)
        return NextResponse.redirect(new URL('/login?error=user_not_found', requestUrl))
      }

      logger.info('Auth callback: успешное подтверждение email', { userId: user.id })

      // Редиректим на указанную страницу или дашборд
      return NextResponse.redirect(new URL(next, requestUrl))
    } catch (error) {
      logger.error('Auth callback: неожиданная ошибка', error)
      return NextResponse.redirect(new URL('/login?error=unexpected', requestUrl))
    }
  }

  // Если нет кода, редиректим на логин
  return NextResponse.redirect(new URL('/login?error=no_code', requestUrl))
}

