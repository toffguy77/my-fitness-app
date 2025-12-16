'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { ArrowLeft } from 'lucide-react'
import ClientDashboardView from '@/components/ClientDashboardView'

export default function ClientViewPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const clientId = params.clientId as string
  const [, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientName, setClientName] = useState<string>('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          router.push('/login')
          return
        }
        setUser(user)

        // Проверяем, что текущий пользователь - тренер этого клиента
        const { data: clientProfile } = await supabase
          .from('profiles')
          .select('coach_id, full_name, email')
          .eq('id', clientId)
          .single()

        if (!clientProfile || clientProfile.coach_id !== user.id) {
          router.push('/coach')
          return
        }

        setClientName(clientProfile.full_name || clientProfile.email || 'Клиент')
        setLoading(false)
      } catch (error) {
        console.error('Ошибка загрузки данных:', error)
        router.push('/coach')
      }
    }

    fetchData()
  }, [router, supabase, clientId])

  if (loading) return <div className="p-8 text-center">Загрузка...</div>

  return (
    <main className="max-w-md mx-auto min-h-screen bg-gray-50 p-4 font-sans">
      <header className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push('/coach')}
          className="h-8 w-8 flex items-center justify-center bg-gray-200 rounded-full hover:bg-gray-300 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{clientName}</h1>
          <p className="text-sm text-gray-500">Режим просмотра</p>
        </div>
      </header>

      <ClientDashboardView 
        clientId={clientId} 
        readOnly={true}
        onTargetsUpdate={() => {
          // Обновляем данные после изменения целей
          router.refresh()
        }}
      />
    </main>
  )
}

