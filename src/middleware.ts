import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { logger } from '@/utils/logger'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const pathname = request.nextUrl.pathname

  logger.debug('Middleware: обработка запроса', { pathname, method: request.method })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    logger.error('Middleware: ошибка получения пользователя', authError, { pathname })
  }

  // Публичные маршруты (не требуют авторизации)
  const publicRoutes = ['/', '/login', '/register']
  const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/api')

  // Если пользователь не авторизован
  if (!user) {
    // Разрешаем доступ к публичным маршрутам
    if (isPublicRoute) {
      logger.debug('Middleware: доступ к публичному маршруту разрешен', { pathname })
      return response
    }
    // Редирект на логин для защищенных маршрутов
    logger.info('Middleware: редирект на логин (неавторизованный пользователь)', { pathname })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  logger.debug('Middleware: пользователь авторизован', { userId: user.id, pathname })

  // Если пользователь авторизован
  // Загружаем профиль
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, subscription_status, subscription_tier')
    .eq('id', user.id)
    .single()

  if (profileError) {
    logger.error('Middleware: ошибка загрузки профиля', profileError, { userId: user.id, pathname })
  }

  const role = profile?.role || 'client'
  const subscriptionStatus = profile?.subscription_status || 'free'
  const subscriptionTier = profile?.subscription_tier || 'basic'
  const isPremium = subscriptionStatus === 'active' && subscriptionTier === 'premium'
  const isSuperAdmin = role === 'super_admin'

  logger.debug('Middleware: данные профиля', {
    userId: user.id,
    role,
    subscriptionStatus,
    subscriptionTier,
    isPremium,
    isSuperAdmin,
    pathname,
  })

  // Если авторизованный пользователь на лендинге - редирект в приложение
  if (pathname === '/') {
    let redirectPath = '/app/dashboard'
    if (isSuperAdmin) {
      redirectPath = '/admin'
    } else if (role === 'coach') {
      redirectPath = '/app/coach'
    }
    logger.info('Middleware: редирект авторизованного пользователя', {
      userId: user.id,
      role,
      redirectPath,
    })
    return NextResponse.redirect(new URL(redirectPath, request.url))
  }

  // Защита маршрутов /app/*
  if (pathname.startsWith('/app')) {
    // Проверка доступа к отчетам (только Premium)
    if (pathname.startsWith('/app/reports') && !isPremium) {
      logger.warn('Middleware: попытка доступа к отчетам без Premium', {
        userId: user.id,
        pathname,
      })
      return NextResponse.redirect(new URL('/app/dashboard', request.url))
    }

    // Проверка доступа к кабинету тренера
    if (pathname.startsWith('/app/coach') && role !== 'coach') {
      logger.warn('Middleware: попытка доступа к кабинету тренера без прав', {
        userId: user.id,
        role,
        pathname,
      })
      return NextResponse.redirect(new URL('/app/dashboard', request.url))
    }
  }

  // Защита маршрутов /admin (только super_admin)
  if (pathname.startsWith('/admin') && !isSuperAdmin) {
    logger.warn('Middleware: попытка доступа к админ-панели без прав', {
      userId: user.id,
      role,
      pathname,
    })
    return NextResponse.redirect(new URL('/app/dashboard', request.url))
  }

  logger.debug('Middleware: доступ разрешен', { userId: user.id, pathname })
  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
