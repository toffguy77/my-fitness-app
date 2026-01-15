import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params

        // Проверяем, что пользователь - куратор и владелец кода
        const { data: inviteCode, error: codeError } = await supabase
            .from('invite_codes')
            .select('curator_id')
            .eq('id', id)
            .single()

        if (codeError || !inviteCode) {
            return NextResponse.json(
                { error: 'Invite code not found' },
                { status: 404 }
            )
        }

        if (inviteCode.curator_id !== user.id) {
            return NextResponse.json(
                { error: 'Forbidden: You can only deactivate your own invite codes' },
                { status: 403 }
            )
        }

        // Деактивируем код
        const { error: updateError } = await supabase
            .from('invite_codes')
            .update({ is_active: false })
            .eq('id', id)

        if (updateError) {
            logger.error('InviteCodes: ошибка деактивации кода', {
                userId: user.id,
                codeId: id,
                error: updateError.message,
            })
            return NextResponse.json(
                { error: 'Failed to deactivate invite code', details: updateError.message },
                { status: 500 }
            )
        }

        logger.info('InviteCodes: код деактивирован', {
            userId: user.id,
            codeId: id,
        })

        return NextResponse.json({
            success: true,
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

