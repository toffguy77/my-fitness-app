import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'

export async function DELETE(
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
                { error: 'Forbidden: You can only delete your own invite codes' },
                { status: 403 }
            )
        }

        // Удаляем код (каскадное удаление через CASCADE в БД)
        const { error: deleteError } = await supabase
            .from('invite_codes')
            .delete()
            .eq('id', id)

        if (deleteError) {
            logger.error('InviteCodes: ошибка удаления кода', {
                userId: user.id,
                codeId: id,
                error: deleteError.message,
            })
            return NextResponse.json(
                { error: 'Failed to delete invite code', details: deleteError.message },
                { status: 500 }
            )
        }

        logger.info('InviteCodes: код удален', {
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
