import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/utils/email'
import { logger } from '@/utils/logger'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Проверяем авторизацию
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { to, template, data } = body

    if (!to || !template) {
      return NextResponse.json(
        { error: 'Отсутствуют обязательные параметры: to, template' },
        { status: 400 }
      )
    }

    const success = await sendEmail(to, template, data || {})

    if (success) {
      logger.info('API Email: уведомление отправлено', { to, template, userId: user.id })
      return NextResponse.json({ success: true })
    } else {
      logger.warn('API Email: не удалось отправить уведомление', { to, template, userId: user.id })
      return NextResponse.json(
        { error: 'Не удалось отправить email' },
        { status: 500 }
      )
    }
  } catch (error) {
    logger.error('API Email: ошибка отправки', error, {})
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    )
  }
}
