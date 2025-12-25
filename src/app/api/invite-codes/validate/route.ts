import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { searchParams } = new URL(request.url)
        const code = searchParams.get('code')

        if (!code) {
            return NextResponse.json(
                { error: 'Code parameter is required' },
                { status: 400 }
            )
        }

        // Проверяем код (анонимные пользователи могут читать активные коды благодаря RLS)
        const { data: inviteCode, error: codeError } = await supabase
            .from('invite_codes')
            .select('id, code, coordinator_id, max_uses, used_count, expires_at, is_active')
            .eq('code', code)
            .eq('is_active', true)
            .single()

        if (codeError || !inviteCode) {
            return NextResponse.json({
                valid: false,
            })
        }

        // Проверяем дополнительные условия
        const now = new Date()
        const isExpired = inviteCode.expires_at && new Date(inviteCode.expires_at) <= now
        const isLimitReached = inviteCode.max_uses && inviteCode.used_count >= inviteCode.max_uses

        if (isExpired || isLimitReached) {
            return NextResponse.json({
                valid: false,
            })
        }

        // Получаем имя координатора
        const { data: coordinatorProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', inviteCode.coordinator_id)
            .single()

        return NextResponse.json({
            valid: true,
            coordinator_name: coordinatorProfile?.full_name || undefined,
            expires_at: inviteCode.expires_at || undefined,
            remaining_uses: inviteCode.max_uses
                ? inviteCode.max_uses - inviteCode.used_count
                : undefined,
        })
    } catch (error) {
        logger.error('InviteCodes: ошибка валидации', {
            error: error instanceof Error ? error.message : String(error),
        })
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

