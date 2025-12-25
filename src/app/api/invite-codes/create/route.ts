import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createUniqueInviteCode } from '@/utils/invites/generate'
import { logger } from '@/utils/logger'
import { z } from 'zod'

const createInviteCodeSchema = z.object({
    max_uses: z.number().int().positive().optional().nullable(),
    expires_at: z.string().datetime().optional().nullable(),
})

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Проверяем, что пользователь - координатор
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!profile || profile.role !== 'coordinator') {
            return NextResponse.json(
                { error: 'Forbidden: Only coordinators can create invite codes' },
                { status: 403 }
            )
        }

        const body = await request.json()
        const validationResult = createInviteCodeSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: validationResult.error.issues },
                { status: 400 }
            )
        }

        const { max_uses, expires_at } = validationResult.data

        // Генерируем уникальный код
        const code = await createUniqueInviteCode(supabase)

        // Создаем инвайт-код
        const { data: inviteCode, error: createError } = await supabase
            .from('invite_codes')
            .insert({
                code,
                coordinator_id: user.id,
                max_uses: max_uses || null,
                expires_at: expires_at || null,
                is_active: true,
            })
            .select()
            .single()

        if (createError) {
            logger.error('InviteCodes: ошибка создания кода', {
                userId: user.id,
                error: createError.message,
            })
            return NextResponse.json(
                { error: 'Failed to create invite code', details: createError.message },
                { status: 500 }
            )
        }

        // Формируем ссылку для регистрации
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const link = `${baseUrl}/register?code=${code}`

        logger.info('InviteCodes: код создан', {
            userId: user.id,
            codeId: inviteCode.id,
        })

        return NextResponse.json({
            id: inviteCode.id,
            code: inviteCode.code,
            link,
            max_uses: inviteCode.max_uses,
            expires_at: inviteCode.expires_at,
            created_at: inviteCode.created_at,
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

