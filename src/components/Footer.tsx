'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getUserProfile, type UserProfile } from '@/utils/supabase/profile'

export default function Footer() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const userProfile = await getUserProfile(user)
        if (userProfile) {
          setProfile(userProfile)
        }
      }
      setLoading(false)
    }
    fetchProfile()
  }, [])

  const isCoordinator = profile?.role === 'coordinator'

  return (
    <footer className="bg-zinc-950 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-zinc-400">
            © {new Date().getFullYear()} BURCEV. Все права защищены.
          </div>
          {!loading && (
            <div className="flex items-center gap-4 text-sm text-zinc-400">
              <a href="/app/settings" className="hover:text-zinc-100 transition-colors">
                Настройки
              </a>
              {!isCoordinator && (
                <>
                  <span className="text-zinc-600">|</span>
                  <a href="/leaderboard" className="hover:text-zinc-100 transition-colors">
                    Лидерборд
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </footer>
  )
}

