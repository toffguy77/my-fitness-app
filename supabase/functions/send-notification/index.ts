/**
 * Supabase Edge Function для отправки email уведомлений
 * 
 * Использование:
 * POST /functions/v1/send-notification
 * Body: { userId: string, template: EmailTemplate, data: EmailData }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Fitness App <noreply@fitnessapp.com>'
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://app.fitnessapp.com'

interface RequestBody {
  userId: string
  template: 'reminder_data_entry' | 'curator_note_notification' | 'subscription_expiring' | 'subscription_expired'
  data?: Record<string, unknown>
}

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    }

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY не настроен' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { userId, template, data = {} }: RequestBody = await req.json()

    if (!userId || !template) {
      return new Response(
        JSON.stringify({ error: 'userId и template обязательны' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Получаем email пользователя из profiles
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (profileError || !profile?.email) {
      return new Response(
        JSON.stringify({ error: 'Пользователь не найден или email отсутствует' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Отправляем email через Resend API
    const emailResult = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: profile.email,
        subject: getEmailSubject(template, data),
        html: getEmailHtml(template, { ...data, userName: profile.full_name || undefined }),
        text: getEmailText(template, { ...data, userName: profile.full_name || undefined }),
      }),
    })

    if (!emailResult.ok) {
      const errorData = await emailResult.json()
      console.error('Resend API error:', errorData)
      return new Response(
        JSON.stringify({ error: 'Ошибка отправки email', details: errorData }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const emailData = await emailResult.json()

    return new Response(
      JSON.stringify({ success: true, emailId: emailData.id }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

function getEmailSubject(template: string, data: Record<string, unknown>): string {
  switch (template) {
    case 'reminder_data_entry':
      return 'Не забудьте внести данные о питании'
    case 'curator_note_notification':
      return `Новая заметка от куратора${data.date ? ` за ${data.date}` : ''}`
    case 'subscription_expiring':
      return `Ваша Premium подписка истекает через ${data.daysRemaining || 3} ${data.daysRemaining === 1 ? 'день' : 'дня'}`
    case 'subscription_expired':
      return 'Ваша Premium подписка истекла'
    default:
      return 'Уведомление от Fitness App'
  }
}

function getEmailHtml(template: string, data: Record<string, unknown>): string {
  const userName = data.userName ? `, ${data.userName}` : ''

  switch (template) {
    case 'reminder_data_entry':
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Привет${userName}!</h2>
          <p>Не забудьте внести данные о питании за сегодня.</p>
          <p>Регулярное отслеживание поможет вам достичь ваших целей.</p>
          <a href="${APP_URL}/app/nutrition" 
             style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px;">
            Внести данные
          </a>
        </div>
      `
    case 'curator_note_notification':
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Привет${userName}!</h2>
          <p>Ваш куратор${data.curatorName ? ` ${data.curatorName}` : ''} оставил вам заметку${data.date ? ` за ${data.date}` : ''}.</p>
          ${data.noteContent ? `<div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; white-space: pre-wrap;">${data.noteContent}</p>
          </div>` : ''}
          <a href="${APP_URL}/app/dashboard${data.date ? `?date=${data.date}` : ''}" 
             style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px;">
            Посмотреть на дашборде
          </a>
        </div>
      `
    case 'subscription_expiring':
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Привет${userName}!</h2>
          <p>Ваша Premium подписка истекает через <strong>${data.daysRemaining || 3} ${data.daysRemaining === 1 ? 'день' : 'дня'}</strong>.</p>
          <p>Чтобы продолжить пользоваться всеми возможностями платформы, продлите подписку.</p>
          <a href="${APP_URL}/app/settings" 
             style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px;">
            Управление подпиской
          </a>
        </div>
      `
    case 'subscription_expired':
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Привет${userName}!</h2>
          <p>Ваша Premium подписка истекла.</p>
          <p>Вы можете продолжить пользоваться базовым функционалом или продлить Premium подписку для доступа ко всем возможностям.</p>
          <a href="${APP_URL}/app/settings" 
             style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px;">
            Управление подпиской
          </a>
        </div>
      `
    default:
      return '<p>Уведомление от Fitness App</p>'
  }
}

function getEmailText(template: string, data: Record<string, unknown>): string {
  const userName = data.userName ? `, ${data.userName}` : ''

  switch (template) {
    case 'reminder_data_entry':
      return `Привет${userName}!\n\nНе забудьте внести данные о питании за сегодня.\n\nРегулярное отслеживание поможет вам достичь ваших целей.\n\nВнести данные: ${APP_URL}/app/nutrition`
    case 'curator_note_notification':
      return `Привет${userName}!\n\nВаш куратор${data.curatorName ? ` ${data.curatorName}` : ''} оставил вам заметку${data.date ? ` за ${data.date}` : ''}.\n\n${data.noteContent ? `Заметка:\n${data.noteContent}\n\n` : ''}Посмотреть на дашборде: ${APP_URL}/app/dashboard${data.date ? `?date=${data.date}` : ''}`
    case 'subscription_expiring':
      return `Привет${userName}!\n\nВаша Premium подписка истекает через ${data.daysRemaining || 3} ${data.daysRemaining === 1 ? 'день' : 'дня'}.\n\nЧтобы продолжить пользоваться всеми возможностями платформы, продлите подписку.\n\nУправление подпиской: ${APP_URL}/app/settings`
    case 'subscription_expired':
      return `Привет${userName}!\n\nВаша Premium подписка истекла.\n\nВы можете продолжить пользоваться базовым функционалом или продлить Premium подписку для доступа ко всем возможностям.\n\nУправление подпиской: ${APP_URL}/app/settings`
    default:
      return 'Уведомление от Fitness App'
  }
}

