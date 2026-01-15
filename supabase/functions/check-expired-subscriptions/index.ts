/**
 * Supabase Edge Function для проверки и деактивации истекших подписок
 *
 * Использование:
 * POST /functions/v1/check-expired-subscriptions
 * Вызывается через cron job ежедневно в 00:00 UTC
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Fitness App <noreply@fitnessapp.com>'
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://app.fitnessapp.com'

serve(async (req) => {
  try {
    // Проверка авторизации (можно использовать service role key для cron)
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

    // Вызываем функцию БД для получения истекших подписок
    const { data: expiredSubscriptions, error: fetchError } = await supabaseClient
      .rpc('get_expired_subscriptions')

    if (fetchError) {
      console.error('Error fetching expired subscriptions:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Ошибка получения истекших подписок', details: fetchError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!expiredSubscriptions || expiredSubscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Нет истекших подписок',
          count: 0
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Деактивируем подписки через функцию БД
    const { data: deactivatedCount, error: deactivateError } = await supabaseClient
      .rpc('deactivate_expired_subscriptions')

    if (deactivateError) {
      console.error('Error deactivating subscriptions:', deactivateError)
      return new Response(
        JSON.stringify({ error: 'Ошибка деактивации подписок', details: deactivateError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Отправляем email уведомления об истечении подписок
    const emailResults = []
    for (const subscription of expiredSubscriptions) {
      if (subscription.email && RESEND_API_KEY) {
        try {
          const emailResult = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: RESEND_FROM_EMAIL,
              to: subscription.email,
              subject: 'Ваша Premium подписка истекла',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">Привет!</h2>
                  <p>Ваша Premium подписка истекла.</p>
                  <p>Вы можете продолжить пользоваться базовым функционалом или продлить Premium подписку для доступа ко всем возможностям.</p>
                  <a href="${APP_URL}/app/settings"
                     style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px;">
                    Управление подпиской
                  </a>
                </div>
              `,
              text: `Привет!\n\nВаша Premium подписка истекла.\n\nВы можете продолжить пользоваться базовым функционалом или продлить Premium подписку для доступа ко всем возможностям.\n\nУправление подпиской: ${APP_URL}/app/settings`,
            }),
          })

          if (emailResult.ok) {
            const emailData = await emailResult.json()
            emailResults.push({ userId: subscription.id, emailId: emailData.id, success: true })
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
        deactivatedCount: deactivatedCount || 0,
        expiredSubscriptionsCount: expiredSubscriptions.length,
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
