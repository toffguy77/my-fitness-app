'use client'

import { usePathname } from 'next/navigation'
import Header from './Header'
import Footer from './Footer'
import Navigation from './Navigation'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Показываем на непубличных страницах: /app/*, /leaderboard, /profile/*
  // Не показываем на: /, /login, /register, /offline
  const isPublicPage = pathname === '/' || 
    pathname === '/login' || 
    pathname === '/register' || 
    pathname === '/offline' ||
    pathname?.startsWith('/auth/')

  if (isPublicPage) {
    return <>{children}</>
  }

  return (
    <>
      <Navigation />
      <Header />
      <div className="lg:ml-64 pb-16 lg:pb-0 min-h-screen flex flex-col pt-16">
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </div>
    </>
  )
}

