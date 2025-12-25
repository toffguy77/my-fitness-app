import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { logger } from '@/utils/logger'

/**
 * Валидирует параметр next для предотвращения open redirect атак
 * Разрешает только относительные пути, начинающиеся с /
 */
function validateNextPath(next: string | null): string {
  if (!next) {
    return '/app/dashboard'
  }

  // Разрешаем только пути, начинающиеся с /
  if (!next.startsWith('/')) {
    logger.warn('Auth callback: попытка редиректа на внешний домен', { next })
    return '/app/dashboard'
  }

  // Дополнительная проверка: не разрешаем протоколы (http://, https://, //)
  if (next.includes('://') || next.startsWith('//')) {
    logger.warn('Auth callback: попытка редиректа с протоколом', { next })
    return '/app/dashboard'
  }

  return next
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextParam = requestUrl.searchParams.get('next')
  const next = validateNextPath(nextParam)

  // Создаем response объект для установки cookies
  const response = NextResponse.next()

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
            // ВАЖНО: устанавливаем cookies и на request, и на response
            // чтобы они были отправлены клиенту
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value)
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    try {
      logger.userFlow('Auth callback: начало обмена кода на сессию', { codeLength: code.length })
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

      if (exchangeError) {
        logger.error('Auth callback: ошибка обмена кода на сессию', exchangeError, { codeLength: code.length })
        return NextResponse.redirect(new URL(`/login?error=invalid_code&message=${encodeURIComponent(exchangeError.message)}`, requestUrl))
      }

      logger.userFlow('Auth callback: код успешно обменян на сессию')
      // Получаем пользователя после обмена кода
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        logger.error('Auth callback: ошибка получения пользователя', userError)
        return NextResponse.redirect(new URL('/login?error=user_not_found', requestUrl))
      }

      logger.authentication('Auth callback: успешное подтверждение email', { 
        userId: user.id,
        email: user.email,
        emailConfirmed: !!user.email_confirmed_at
      })

      // Редиректим на указанную страницу или дашборд
      // Создаем redirect response и копируем cookies из response объекта
      const redirectResponse = NextResponse.redirect(new URL(next, requestUrl))
      // Копируем все cookies из response в redirect response
      response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, {
          path: cookie.path,
          domain: cookie.domain,
          maxAge: cookie.maxAge,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
        })
      })
      return redirectResponse
    } catch (error) {
      logger.error('Auth callback: неожиданная ошибка', error)
      return NextResponse.redirect(new URL('/login?error=unexpected', requestUrl))
    }
  }

  // Если нет кода, редиректим на логин
  return NextResponse.redirect(new URL('/login?error=no_code', requestUrl))
}

