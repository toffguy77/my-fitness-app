import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { logger } from '@/utils/logger'

export async function middleware(request: NextRequest) {
  try {
    const response = NextResponse.next()
    const pathname = request.nextUrl.pathname

    // Безопасное логирование
    try {
      logger.debug('Middleware: обработка запроса', { pathname, method: request.method })
    } catch {
      // Игнорируем ошибки логирования
    }

    // Проверка переменных окружения - приложение должно падать, если они не настроены
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      const error = new Error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY')
      console.error('Middleware: критическая ошибка - отсутствуют переменные окружения Supabase', error)
      throw error
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
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      try {
        logger.error('Middleware: ошибка получения пользователя', authError, { pathname })
      } catch {
        // Игнорируем ошибки логирования
      }
    }

    // Публичные маршруты (не требуют авторизации)
    const publicRoutes = ['/', '/login', '/register']
    const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/api')

    // Если пользователь не авторизован
    if (!user) {
      // Разрешаем доступ к публичным маршрутам
      if (isPublicRoute) {
        try {
          logger.debug('Middleware: доступ к публичному маршруту разрешен', { pathname })
        } catch {
          // Игнорируем ошибки логирования
        }
        return response
      }
      // Редирект на логин для защищенных маршрутов
      try {
        logger.info('Middleware: редирект на логин (неавторизованный пользователь)', { pathname })
      } catch {
        // Игнорируем ошибки логирования
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }

    try {
      logger.debug('Middleware: пользователь авторизован', { userId: user.id, pathname })
    } catch {
      // Игнорируем ошибки логирования
    }

    // Если пользователь авторизован
    // Загружаем профиль
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, subscription_status, subscription_tier')
      .eq('id', user.id)
      .single()

    if (profileError) {
      try {
        logger.error('Middleware: ошибка загрузки профиля', profileError, { userId: user.id, pathname })
      } catch {
        // Игнорируем ошибки логирования
      }
    }

    const role = profile?.role || 'client'
    const subscriptionStatus = profile?.subscription_status || 'free'
    const subscriptionTier = profile?.subscription_tier || 'basic'
    const isPremium = subscriptionStatus === 'active' && subscriptionTier === 'premium'
    const isSuperAdmin = role === 'super_admin'

    try {
      logger.debug('Middleware: данные профиля', {
        userId: user.id,
        role,
        subscriptionStatus,
        subscriptionTier,
        isPremium,
        isSuperAdmin,
        pathname,
      })
    } catch {
      // Игнорируем ошибки логирования
    }

    // Если авторизованный пользователь на лендинге - редирект в приложение
    if (pathname === '/') {
      let redirectPath = '/app/dashboard'
      if (isSuperAdmin) {
        redirectPath = '/admin'
      } else if (role === 'coach') {
        redirectPath = '/app/coach'
      }
      try {
        logger.info('Middleware: редирект авторизованного пользователя', {
          userId: user.id,
          role,
          redirectPath,
        })
      } catch {
        // Игнорируем ошибки логирования
      }
      return NextResponse.redirect(new URL(redirectPath, request.url))
    }

    // Защита маршрутов /app/*
    if (pathname.startsWith('/app')) {
      // Проверка доступа к отчетам (только Premium)
      if (pathname.startsWith('/app/reports') && !isPremium) {
        try {
          logger.warn('Middleware: попытка доступа к отчетам без Premium', {
            userId: user.id,
            pathname,
          })
        } catch {
          // Игнорируем ошибки логирования
        }
        return NextResponse.redirect(new URL('/app/dashboard', request.url))
      }

      // Проверка доступа к кабинету тренера
      if (pathname.startsWith('/app/coach') && role !== 'coach') {
        try {
          logger.warn('Middleware: попытка доступа к кабинету тренера без прав', {
            userId: user.id,
            role,
            pathname,
          })
        } catch {
          // Игнорируем ошибки логирования
        }
        return NextResponse.redirect(new URL('/app/dashboard', request.url))
      }
    }

    // Защита маршрутов /admin (только super_admin)
    if (pathname.startsWith('/admin') && !isSuperAdmin) {
      try {
        logger.warn('Middleware: попытка доступа к админ-панели без прав', {
          userId: user.id,
          role,
          pathname,
        })
      } catch {
        // Игнорируем ошибки логирования
      }
      return NextResponse.redirect(new URL('/app/dashboard', request.url))
    }

    try {
      logger.debug('Middleware: доступ разрешен', { userId: user.id, pathname })
    } catch {
      // Игнорируем ошибки логирования
    }
    return response
  } catch (error) {
    // Критические ошибки должны быть видны - возвращаем 500 ошибку
    console.error('Middleware: критическая ошибка', error)
    return new NextResponse(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
