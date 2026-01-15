/**
 * Supabase Edge Function для проверки подписок, истекающих через N дней
 *
 * Использование:
 * POST /functions/v1/check-expiring-subscriptions
 * Body: { daysAhead?: number } (по умолчанию 3)
 * Вызывается через cron job ежедневно
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Fitness App <noreply@fitnessapp.com>'
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://app.fitnessapp.com'

serve(async (req) => {
  try {
    // Проверка авторизации
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Получаем параметр daysAhead из body или используем дефолт 3
    let daysAhead = 3
    try {
      const body = await req.json().catch(() => ({}))
      daysAhead = body.daysAhead || 3
    } catch {
      // Используем дефолт
    }

    // Вызываем функцию БД для получения подписок, истекающих через N дней
    const { data: expiringSubscriptions, error: fetchError } = await supabaseClient
      .rpc('get_expiring_subscriptions', { days_ahead: daysAhead })

    if (fetchError) {
      console.error('Error fetching expiring subscriptions:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Ошибка получения подписок', details: fetchError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!expiringSubscriptions || expiringSubscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Нет подписок, истекающих через ${daysAhead} ${daysAhead === 1 ? 'день' : 'дня'}`,
          count: 0,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Отправляем email предупреждения
    const emailResults = []
    for (const subscription of expiringSubscriptions) {
      if (subscription.email && RESEND_API_KEY) {
        try {
          const daysRemaining = subscription.days_remaining || daysAhead
          const emailResult = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: RESEND_FROM_EMAIL,
              to: subscription.email,
              subject: `Ваша Premium подписка истекает через ${daysRemaining} ${daysRemaining === 1 ? 'день' : 'дня'}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">Привет!</h2>
                  <p>Ваша Premium подписка истекает через <strong>${daysRemaining} ${daysRemaining === 1 ? 'день' : 'дня'}</strong>.</p>
                  <p>Чтобы продолжить пользоваться всеми возможностями платформы, продлите подписку.</p>
                  <a href="${APP_URL}/app/settings"
                     style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px;">
                    Управление подпиской
                  </a>
                </div>
              `,
              text: `Привет!\n\nВаша Premium подписка истекает через ${daysRemaining} ${daysRemaining === 1 ? 'день' : 'дня'}.\n\nЧтобы продолжить пользоваться всеми возможностями платформы, продлите подписку.\n\nУправление подпиской: ${APP_URL}/app/settings`,
            }),
          })

          if (emailResult.ok) {
            const emailData = await emailResult.json()
            emailResults.push({
              userId: subscription.id,
              emailId: emailData.id,
              daysRemaining,
              success: true,
            })
          } else {
            const errorData = await emailResult.json()
            emailResults.push({ userId: subscription.id, success: false, error: errorData })
          }
        } catch (error) {
          console.error(`Error sending email to ${subscription.email}:`, error)
          emailResults.push({ userId: subscription.id, success: false, error: error.message })
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        expiringSubscriptionsCount: expiringSubscriptions.length,
        daysAhead,
        emailResults,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
