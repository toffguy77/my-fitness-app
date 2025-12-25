import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { logger } from '@/utils/logger'
import { metricsCollector } from '@/utils/metrics/collector'

/**
 * Нормализует pathname для метрик (заменяет динамические параметры на шаблоны)
 */
function normalizeRoute(pathname: string): string {
  // Заменяем UUID на [id]
  let normalized = pathname.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/[id]')
  // Заменяем числовые ID на [id]
  normalized = normalized.replace(/\/\d+/g, '/[id]')
  // Заменяем другие динамические сегменты если есть (например, /app/coordinator/[clientId] -> /app/coordinator/[id])
  return normalized
}

export async function middleware(request: NextRequest) {
  const startTime = Date.now()
  const method = request.method
  const pathname = request.nextUrl.pathname
  const normalizedRoute = normalizeRoute(pathname)
  
  try {
    const response = NextResponse.next()
    
    // Добавляем хук для отслеживания статуса ответа после завершения
    response.headers.set('X-Request-Id', `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
    
    // Record RED metrics: Rate (запросы) - будет обновлен с статусом в конце

    // ВАЖНО: Логируем все запросы для отладки в production
    // Используем INFO уровень, чтобы логи были видны в контейнере
    try {
      logger.info('Middleware: обработка запроса', { 
        pathname, 
        method: request.method,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      })
      // В Edge Runtime process.stdout недоступен, используем только console
    } catch {
      // Если logger не работает, используем console напрямую
      console.log(`[MIDDLEWARE] ${request.method} ${pathname}`)
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

    // Публичные маршруты (не требуют авторизации)
    // Включаем стандартные endpoints для мониторинга и health checks
    const publicRoutes = [
      '/',
      '/login',
      '/register',
      '/auth/callback',
      '/metrics',        // Prometheus metrics endpoint
      '/health',         // Health check endpoint
      '/ready',          // Readiness check endpoint
      '/live',           // Liveness check endpoint
    ]
    const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/api')

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    // Логируем ошибки аутентификации только для защищенных маршрутов
    // Для публичных маршрутов отсутствие сессии - это нормально
    if (authError && !isPublicRoute) {
      try {
        // Проверяем, является ли это обычной ошибкой отсутствия сессии
        const isSessionMissing = authError.message?.includes('session missing') ||
          authError.message?.includes('Auth session missing') ||
          (authError as any)?.__isAuthError
        if (!isSessionMissing) {
          logger.error('Middleware: ошибка получения пользователя', authError, { pathname })
        } else {
          logger.debug('Middleware: сессия отсутствует (нормально для неавторизованных пользователей)', { pathname })
        }
      } catch {
        // Игнорируем ошибки логирования
      }
    }

    // Helper для записи RED метрик перед редиректом
    const recordRedirectMetrics = (statusCode: number, redirectPath: string) => {
      const duration = Date.now() - startTime
      try {
        metricsCollector.counter(
          'http_requests_total',
          'Total number of HTTP requests',
          {
            route: normalizedRoute,
            method: method,
            status_code: String(statusCode),
          }
        )
        metricsCollector.histogram(
          'http_request_duration_seconds',
          'HTTP request duration in seconds',
          duration / 1000,
          {
            route: normalizedRoute,
            method: method,
            status_code: String(statusCode),
          }
        )
      } catch {
        // Ignore metrics errors
      }
    }

    // Onboarding доступен только авторизованным пользователям
    if (pathname === '/onboarding' && !user) {
      recordRedirectMetrics(302, '/login')
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Лидерборд доступен только авторизованным пользователям
    if (pathname === '/leaderboard' && !user) {
      try {
        logger.info('Middleware: редирект на логин (попытка доступа к лидерборду без авторизации)', { pathname })
      } catch {
        // Игнорируем ошибки логирования
      }
      recordRedirectMetrics(302, '/login')
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Если пользователь не авторизован
    if (!user) {
      // Разрешаем доступ к публичным маршрутам
      if (isPublicRoute) {
        try {
          logger.debug('Middleware: доступ к публичному маршруту разрешен', { pathname })
          logger.userFlow('Middleware: неавторизованный доступ к публичному маршруту', { pathname })
        } catch {
          // Игнорируем ошибки логирования
        }
        return response
      }
      // Редирект на логин для защищенных маршрутов
      try {
        logger.info('Middleware: редирект на логин (неавторизованный пользователь)', { pathname })
        logger.userFlow('Middleware: редирект на логин - неавторизованный доступ к защищенному маршруту', { pathname })
      } catch {
        // Игнорируем ошибки логирования
      }
      recordRedirectMetrics(302, '/login')
      return NextResponse.redirect(new URL('/login', request.url))
    }

    try {
      logger.debug('Middleware: пользователь авторизован', { userId: user.id, pathname })
    } catch {
      // Игнорируем ошибки логирования
    }

    // Если пользователь авторизован
    // Загружаем профиль
    // Используем maybeSingle() вместо single() для обработки случая, когда профиль еще не создан
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, subscription_status, subscription_tier, subscription_end_date')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      try {
        // Безопасное логирование ошибки профиля
        const errorMessage = profileError.message || JSON.stringify(profileError);
        logger.error('Middleware: ошибка загрузки профиля', new Error(errorMessage), { userId: user.id, pathname })
        
        // Record database error metric
        try {
          metricsCollector.counter(
            'errors_database_total',
            'Total number of database errors',
            {
              code: profileError.code || 'unknown',
            }
          )
        } catch {
          // Ignore metrics errors
        }
      } catch {
        // Игнорируем ошибки логирования
      }
    }

    // Если профиль не существует (новый пользователь), логируем это
    if (!profile && !profileError) {
      try {
        logger.debug('Middleware: профиль не найден (новый пользователь, возможно еще не прошел onboarding)', { userId: user.id, pathname })
      } catch {
        // Игнорируем ошибки логирования
      }
    }

    const role = profile?.role || 'client'
    const subscriptionStatus = profile?.subscription_status || 'free'
    const subscriptionTier = profile?.subscription_tier || 'basic'
    const subscriptionEndDate = profile?.subscription_end_date

    // Проверка Premium только для клиентов (координаторы не имеют подписки)
    let isPremium = false
    if (role === 'client') {
      const isActive = subscriptionStatus === 'active'
      const isPremiumTier = subscriptionTier === 'premium'
      const isNotExpired = !subscriptionEndDate || new Date(subscriptionEndDate) > new Date()
      isPremium = isActive && isPremiumTier && isNotExpired
    }

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
      
      // Record subscription metrics in middleware
      try {
        if (role === 'client') {
          metricsCollector.gauge(
            'subscriptions_active_gauge',
            'Number of active subscriptions',
            isPremium ? 1 : 0,
            { tier: subscriptionTier }
          )
        }
      } catch {
        // Ignore metrics errors
      }
    } catch {
      // Игнорируем ошибки логирования
    }

    // Если авторизованный пользователь на лендинге - редирект в приложение
    if (pathname === '/') {
      let redirectPath = '/app/dashboard'
      if (isSuperAdmin) {
        redirectPath = '/admin'
      } else if (role === 'coordinator') {
        redirectPath = '/app/coordinator'
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
      recordRedirectMetrics(302, redirectPath)
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
        recordRedirectMetrics(403, '/app/dashboard')
        return NextResponse.redirect(new URL('/app/dashboard', request.url))
      }

      // Проверка доступа к кабинету координатора
      if (pathname.startsWith('/app/coordinator') && role !== 'coordinator') {
        try {
          logger.warn('Middleware: попытка доступа к кабинету координатора без прав', {
            userId: user.id,
            role,
            pathname,
          })
        } catch {
          // Игнорируем ошибки логирования
        }
        recordRedirectMetrics(403, '/app/dashboard')
        return NextResponse.redirect(new URL('/app/dashboard', request.url))
      }

      // Проверка доступа к metrics dashboard (только super_admin и coordinator)
      if (pathname.startsWith('/app/admin/metrics') && role !== 'super_admin' && role !== 'coordinator') {
        try {
          logger.warn('Middleware: попытка доступа к metrics dashboard без прав', {
            userId: user.id,
            role,
            pathname,
          })
        } catch {
          // Игнорируем ошибки логирования
        }
        recordRedirectMetrics(403, '/app/dashboard')
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
      recordRedirectMetrics(403, '/app/dashboard')
      return NextResponse.redirect(new URL('/app/dashboard', request.url))
    }

    try {
      logger.debug('Middleware: доступ разрешен', { userId: user.id, pathname })
      logger.userFlow('Middleware: навигация пользователя', {
        userId: user.id,
        pathname,
        role,
        isPremium,
        method: request.method
      })
    } catch {
      // Игнорируем ошибки логирования
    }
    
    // Record RED metrics: Duration и статус успешного ответа
    const duration = Date.now() - startTime
    const statusCode = 200 // Успешный ответ
    
    try {
      // Duration (histogram)
      metricsCollector.histogram(
        'http_request_duration_seconds',
        'HTTP request duration in seconds',
        duration / 1000, // конвертируем миллисекунды в секунды
        {
          route: normalizedRoute,
          method: method,
          status_code: String(statusCode),
        }
      )
      
      // Rate уже записан в начале, ошибок нет
    } catch {
      // Ignore metrics errors
    }
    
    return response
  } catch (error) {
    // Критические ошибки должны быть видны - возвращаем 500 ошибку
    const duration = Date.now() - startTime
    const statusCode = 500
    
    // Record RED metrics: Errors и Duration для ошибки
    try {
      metricsCollector.counter(
        'http_requests_errors_total',
        'Total number of HTTP request errors',
        {
          route: normalizedRoute,
          method: method,
          status_code: String(statusCode),
          error_type: error instanceof Error ? error.constructor.name : 'unknown',
        }
      )
      
      metricsCollector.histogram(
        'http_request_duration_seconds',
        'HTTP request duration in seconds',
        duration / 1000,
        {
          route: normalizedRoute,
          method: method,
          status_code: String(statusCode),
        }
      )
    } catch {
      // Ignore metrics errors
    }
    
    console.error('Middleware: критическая ошибка', error)
    return new NextResponse(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: statusCode,
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
