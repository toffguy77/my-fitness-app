/**
 * Утилита для отправки email уведомлений через Resend API
 */

import { Resend } from 'resend'
import { logger } from './logger'

const resend = new Resend(process.env.RESEND_API_KEY)

export type EmailTemplate =
  | 'reminder_data_entry'
  | 'coach_note_notification'
  | 'subscription_expiring'
  | 'subscription_expired'

export interface EmailData {
  userName?: string
  date?: string
  coachName?: string
  daysRemaining?: number
  [key: string]: any
}

/**
 * Отправка email уведомления
 */
export async function sendEmail(
  to: string,
  template: EmailTemplate,
  data: EmailData = {}
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    logger.error('Email: RESEND_API_KEY не настроен', undefined, { to, template })
    return false
  }

  try {
    const { subject, html, text } = getEmailTemplate(template, data)

    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Fitness App <noreply@fitnessapp.com>',
      to,
      subject,
      html,
      text,
    })

    if (result.error) {
      logger.error('Email: ошибка отправки', result.error, { to, template })
      return false
    }

    logger.info('Email: уведомление отправлено', { to, template, emailId: result.data?.id })
    return true
  } catch (error) {
    logger.error('Email: исключение при отправке', error, { to, template })
    return false
  }
}

/**
 * Получение шаблона email по типу
 */
function getEmailTemplate(template: EmailTemplate, data: EmailData): {
  subject: string
  html: string
  text: string
} {
  switch (template) {
    case 'reminder_data_entry':
      return {
        subject: 'Не забудьте внести данные о питании',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Привет${data.userName ? `, ${data.userName}` : ''}!</h2>
            <p>Не забудьте внести данные о питании за сегодня.</p>
            <p>Регулярное отслеживание поможет вам достичь ваших целей.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.fitnessapp.com'}/app/nutrition" 
               style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px;">
              Внести данные
            </a>
          </div>
        `,
        text: `Привет${data.userName ? `, ${data.userName}` : ''}!\n\nНе забудьте внести данные о питании за сегодня.\n\nРегулярное отслеживание поможет вам достичь ваших целей.\n\nВнести данные: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.fitnessapp.com'}/app/nutrition`,
      }

    case 'coach_note_notification':
      return {
        subject: `Новая заметка от тренера${data.date ? ` за ${data.date}` : ''}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Привет${data.userName ? `, ${data.userName}` : ''}!</h2>
            <p>Ваш тренер${data.coachName ? ` ${data.coachName}` : ''} оставил вам заметку${data.date ? ` за ${data.date}` : ''}.</p>
            ${data.noteContent ? `<div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; white-space: pre-wrap;">${data.noteContent}</p>
            </div>` : ''}
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.fitnessapp.com'}/app/dashboard${data.date ? `?date=${data.date}` : ''}" 
               style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px;">
              Посмотреть на дашборде
            </a>
          </div>
        `,
        text: `Привет${data.userName ? `, ${data.userName}` : ''}!\n\nВаш тренер${data.coachName ? ` ${data.coachName}` : ''} оставил вам заметку${data.date ? ` за ${data.date}` : ''}.\n\n${data.noteContent ? `Заметка:\n${data.noteContent}\n\n` : ''}Посмотреть на дашборде: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.fitnessapp.com'}/app/dashboard${data.date ? `?date=${data.date}` : ''}`,
      }

    case 'subscription_expiring':
      return {
        subject: `Ваша Premium подписка истекает через ${data.daysRemaining || 3} ${data.daysRemaining === 1 ? 'день' : 'дня'}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Привет${data.userName ? `, ${data.userName}` : ''}!</h2>
            <p>Ваша Premium подписка истекает через <strong>${data.daysRemaining || 3} ${data.daysRemaining === 1 ? 'день' : 'дня'}</strong>.</p>
            <p>Чтобы продолжить пользоваться всеми возможностями платформы, продлите подписку.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.fitnessapp.com'}/app/settings" 
               style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px;">
              Управление подпиской
            </a>
          </div>
        `,
        text: `Привет${data.userName ? `, ${data.userName}` : ''}!\n\nВаша Premium подписка истекает через ${data.daysRemaining || 3} ${data.daysRemaining === 1 ? 'день' : 'дня'}.\n\nЧтобы продолжить пользоваться всеми возможностями платформы, продлите подписку.\n\nУправление подпиской: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.fitnessapp.com'}/app/settings`,
      }

    case 'subscription_expired':
      return {
        subject: 'Ваша Premium подписка истекла',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Привет${data.userName ? `, ${data.userName}` : ''}!</h2>
            <p>Ваша Premium подписка истекла.</p>
            <p>Вы можете продолжить пользоваться базовым функционалом или продлить Premium подписку для доступа ко всем возможностям.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.fitnessapp.com'}/app/settings" 
               style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px;">
              Управление подпиской
            </a>
          </div>
        `,
        text: `Привет${data.userName ? `, ${data.userName}` : ''}!\n\nВаша Premium подписка истекла.\n\nВы можете продолжить пользоваться базовым функционалом или продлить Premium подписку для доступа ко всем возможностям.\n\nУправление подпиской: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.fitnessapp.com'}/app/settings`,
      }

    default:
      return {
        subject: 'Уведомление от Fitness App',
        html: '<p>Уведомление от Fitness App</p>',
        text: 'Уведомление от Fitness App',
      }
  }
}

