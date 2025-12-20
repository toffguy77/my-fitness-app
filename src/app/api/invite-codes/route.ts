import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Проверяем, что пользователь - тренер
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!profile || profile.role !== 'coach') {
            return NextResponse.json(
                { error: 'Forbidden: Only coaches can view invite codes' },
                { status: 403 }
            )
        }

        // Получаем все инвайт-коды тренера
        const { data: codes, error: codesError } = await supabase
            .from('invite_codes')
            .select('*')
            .eq('coach_id', user.id)
            .order('created_at', { ascending: false })

        if (codesError) {
            logger.error('InviteCodes: ошибка получения кодов', {
                userId: user.id,
                error: codesError.message,
            })
            return NextResponse.json(
                { error: 'Failed to fetch invite codes', details: codesError.message },
                { status: 500 }
            )
        }

        // Получаем статистику использования для каждого кода
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const codesWithStats = await Promise.all(
            (codes || []).map(async (code) => {
                // Общее количество использований
                const { count: totalRegistrations } = await supabase
                    .from('invite_code_usage')
                    .select('id', { count: 'exact', head: true })
                    .eq('invite_code_id', code.id)

                // Регистрации за последние 7 дней
                const sevenDaysAgo = new Date()
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
                const { count: recentRegistrations } = await supabase
                    .from('invite_code_usage')
                    .select('id', { count: 'exact', head: true })
                    .eq('invite_code_id', code.id)
                    .gte('used_at', sevenDaysAgo.toISOString())

                return {
                    id: code.id,
                    code: code.code,
                    link: `${baseUrl}/register?code=${code.code}`,
                    max_uses: code.max_uses,
                    used_count: code.used_count,
                    expires_at: code.expires_at,
                    is_active: code.is_active,
                    created_at: code.created_at,
                    last_used_at: code.last_used_at,
                    statistics: {
                        total_registrations: totalRegistrations || 0,
                        recent_registrations: recentRegistrations || 0,
                    },
                }
            })
        )

        return NextResponse.json({
            codes: codesWithStats,
        })
    } catch (error) {
        logger.error('InviteCodes: неожиданная ошибка', {
            error: error instanceof Error ? error.message : String(error),
        })
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

