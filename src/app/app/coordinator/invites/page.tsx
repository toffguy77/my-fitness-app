'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { ArrowLeft } from 'lucide-react'
import InviteCodeManager from '@/components/invites/InviteCodeManager'

export default function InviteCodesPage() {
    const supabase = createClient()
    const router = useRouter()
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data: { user: authUser }, error: userError } = await supabase.auth.getUser()
                if (userError || !authUser) {
                    router.push('/login')
                    return
                }

                // Проверяем, что пользователь - координатор
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', authUser.id)
                    .single()

                if (!profile || profile.role !== 'coordinator') {
                    router.push('/app/dashboard')
                    return
                }

                setUser(authUser)
            } catch (error) {
                console.error('Error fetching user:', error)
                router.push('/login')
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [router, supabase])

    if (loading) {
        return (
            <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-4xl md:mx-auto">
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                </div>
            </main>
        )
    }

    if (!user) {
        return null
    }

    return (
        <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-4xl md:mx-auto">
            <div className="mb-6">
                <button
                    onClick={() => router.push('/app/coordinator')}
                    className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors mb-4"
                >
                    <ArrowLeft size={20} />
                    <span>Назад к списку клиентов</span>
                </button>
            </div>

            <InviteCodeManager coordinatorId={user.id} />
        </main>
    )
}

