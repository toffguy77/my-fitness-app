import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Публичные маршруты (не требуют авторизации)
  const publicRoutes = ['/', '/login', '/register']
  const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/api')

  // Если пользователь не авторизован
  if (!user) {
    // Разрешаем доступ к публичным маршрутам
    if (isPublicRoute) {
      return NextResponse.next()
    }
    // Редирект на логин для защищенных маршрутов
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Если пользователь авторизован
  // Загружаем профиль
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, subscription_status, subscription_tier')
    .eq('id', user.id)
    .single()

  const role = profile?.role || 'client'
  const subscriptionStatus = profile?.subscription_status || 'free'
  const subscriptionTier = profile?.subscription_tier || 'basic'
  const isPremium = subscriptionStatus === 'active' && subscriptionTier === 'premium'
  const isSuperAdmin = role === 'super_admin'

  // Если авторизованный пользователь на лендинге - редирект в приложение
  if (pathname === '/') {
    if (isSuperAdmin) {
      return NextResponse.redirect(new URL('/admin', request.url))
    } else if (role === 'coach') {
      return NextResponse.redirect(new URL('/app/coach', request.url))
    } else {
      return NextResponse.redirect(new URL('/app/dashboard', request.url))
    }
  }

  // Защита маршрутов /app/*
  if (pathname.startsWith('/app')) {
    // Проверка доступа к отчетам (только Premium)
    if (pathname.startsWith('/app/reports') && !isPremium) {
      return NextResponse.redirect(new URL('/app/dashboard', request.url))
    }

    // Проверка доступа к кабинету тренера
    if (pathname.startsWith('/app/coach') && role !== 'coach') {
      return NextResponse.redirect(new URL('/app/dashboard', request.url))
    }
  }

  // Защита маршрутов /admin (только super_admin)
  if (pathname.startsWith('/admin') && !isSuperAdmin) {
    return NextResponse.redirect(new URL('/app/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
