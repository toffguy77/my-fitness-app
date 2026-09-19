/**
 * Настройки: причина отказа доезжает до человека.
 *
 * Сервер объясняет, почему не вышло — «сессия завершена», «нет доступа»,
 * «проверьте введённые данные». Пустой catch выбрасывал это объяснение и
 * показывал одну и ту же заготовку на все случаи: человек читал «не удалось
 * загрузить настройки» и там, где его на самом деле разлогинило.
 *
 * Здесь проверяется именно доставка причины, а не наличие тоста.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/shared/errors/apiErrors'
import { SettingsProviders } from '../SettingsProviders'
import { SettingsNotifications } from '../SettingsNotifications'
import { SettingsPrivacy } from '../SettingsPrivacy'
import { SettingsTelegram } from '../SettingsTelegram'
import { SettingsBody } from '../SettingsBody'

jest.mock('@/features/auth/api/providers', () => ({
    providersApi: {
        list: jest.fn(),
        startUrl: (provider: string) => `/api/v1/auth/oauth/${provider}`,
        linked: jest.fn(),
        unlink: jest.fn(),
    },
}))

const mockGetPrefs = jest.fn()
const mockUpdatePrefs = jest.fn()
jest.mock('@/features/notifications/api/preferencesApi', () => ({
    getNotificationPreferences: () => mockGetPrefs(),
    updateNotificationPreferences: (req: unknown) => mockUpdatePrefs(req),
}))

jest.mock('@/features/content/types', () => ({
    CATEGORY_LABELS: { nutrition: 'Питание' },
}))

jest.mock('../../api/account', () => ({
    accountApi: {
        getDeletionStatus: jest.fn(),
        listExports: jest.fn(),
        requestDeletion: jest.fn(),
        cancelDeletion: jest.fn(),
        requestExport: jest.fn(),
        downloadExportUrl: (id: string) => `/api/v1/users/me/export/${id}`,
    },
}))

jest.mock('@/features/settings/api/telegram', () => ({
    telegramApi: { status: jest.fn(), connect: jest.fn(), disconnect: jest.fn() },
}))

const mockRecalculate = jest.fn()
jest.mock('@/features/nutrition-calc/api/nutritionCalc', () => ({
    recalculate: () => mockRecalculate(),
}))

const mockSaveSettings = jest.fn()
jest.mock('../SettingsPageLayout', () => ({
    SettingsPageLayout: ({ children }: { children: (props: Record<string, unknown>) => React.ReactNode }) => (
        <div>
            {children({
                profile: {
                    id: 1,
                    email: 'a@b.c',
                    name: 'Иван',
                    role: 'user',
                    avatar_url: '',
                    onboarding_completed: true,
                    settings: {
                        language: 'ru',
                        units: 'metric',
                        timezone: 'Europe/Moscow',
                        telegram_username: '',
                        instagram_username: '',
                        apple_health_enabled: false,
                        birth_date: '1990-01-15',
                        biological_sex: 'male',
                        height: 180,
                        target_weight: 75,
                        activity_level: 'moderate',
                        fitness_goal: 'maintain',
                    },
                },
                isLoading: false,
                saveSettings: mockSaveSettings,
            })}
        </div>
    ),
}))

jest.mock('next/link', () => {
    const Link = ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>
    Link.displayName = 'Link'
    return Link
})

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

import toast from 'react-hot-toast'
import { providersApi } from '@/features/auth/api/providers'
import { accountApi } from '../../api/account'
import { telegramApi } from '@/features/settings/api/telegram'

const providers = providersApi as jest.Mocked<typeof providersApi>
const account = accountApi as jest.Mocked<typeof accountApi>
const telegram = telegramApi as jest.Mocked<typeof telegramApi>

/** Отказ, который сервер объяснил кодом. */
function refusal(status: number, code: string) {
    return new ApiError(status, { code, message: 'серверная проза' })
}

beforeEach(() => {
    jest.clearAllMocks()
    mockSaveSettings.mockResolvedValue(undefined)
    mockRecalculate.mockResolvedValue({})
})

describe('Способы входа', () => {
    it('говорит, что сессия завершена, а не «не удалось загрузить»', async () => {
        providers.linked.mockRejectedValue(refusal(401, 'session_ended'))
        providers.list.mockRejectedValue(refusal(401, 'session_ended'))

        render(<SettingsProviders />)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Сессия завершена, войдите заново'), { timeout: 1500 })
    })

    // Ошибка без объяснения — это не отказ сервера, а сбой здесь: повторять
    // нечего, и собственная фраза раздела честнее.
    it('оставляет свою фразу, когда объяснения не было', async () => {
        providers.linked.mockRejectedValue(new Error('boom'))
        providers.list.mockRejectedValue(new Error('boom'))

        render(<SettingsProviders />)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось загрузить привязки'), { timeout: 1500 })
    })
})

describe('Уведомления', () => {
    it('показывает причину отказа при загрузке', async () => {
        mockGetPrefs.mockRejectedValue(refusal(401, 'session_ended'))

        render(<SettingsNotifications />)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Сессия завершена, войдите заново'), { timeout: 1500 })
    })

    it('показывает причину отказа при сохранении', async () => {
        mockGetPrefs.mockResolvedValue({ muted: false, mutedCategories: [] })
        mockUpdatePrefs.mockRejectedValue(refusal(400, 'validation'))

        render(<SettingsNotifications />)
        await userEvent.click(await screen.findByRole('switch', { name: 'Не беспокоить' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Проверьте введённые данные'), { timeout: 1500 })
    })
})

describe('Приватность', () => {
    it('показывает причину, по которой состояние аккаунта не прочиталось', async () => {
        account.getDeletionStatus.mockRejectedValue(refusal(403, 'forbidden'))
        account.listExports.mockRejectedValue(refusal(403, 'forbidden'))

        render(<SettingsPrivacy />)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Нет доступа'), { timeout: 1500 })
    })

    it('показывает причину, по которой отмена удаления не прошла', async () => {
        account.getDeletionStatus.mockResolvedValue({ requested: true, scheduled_for: '2026-10-01T00:00:00Z' })
        account.listExports.mockResolvedValue({ exports: [] })
        account.cancelDeletion.mockRejectedValue(refusal(410, 'gone'))

        render(<SettingsPrivacy />)
        await userEvent.click(await screen.findByRole('button', { name: 'Отменить удаление' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Больше недоступно'), { timeout: 1500 })
    })
})

describe('Telegram', () => {
    it('показывает причину, по которой состояние привязки не прочиталось', async () => {
        telegram.status.mockRejectedValue(refusal(401, 'session_ended'))

        render(<SettingsTelegram />)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Сессия завершена, войдите заново'), { timeout: 1500 })
    })

    it('показывает причину, по которой отвязка не прошла', async () => {
        telegram.status.mockResolvedValue({ linked: true, username: 'ivanov' })
        telegram.disconnect.mockRejectedValue(refusal(409, 'gone'))

        render(<SettingsTelegram />)
        await userEvent.click(await screen.findByRole('button', { name: 'Отключить' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Больше недоступно'), { timeout: 1500 })
    })
})

describe('Тело и цели', () => {
    // Пересчёт с незаполненным профилем отказом не заканчивается: сервер
    // отвечает 200 и {targets: null}. Значит, сюда попадает только настоящий
    // сбой — и молчать о нём означает сказать «сохранено», когда нормы
    // остались прежними.
    it('не молчит, когда пересчёт норм не удался', async () => {
        mockRecalculate.mockRejectedValue(new ApiError(500, { code: 'internal' }))

        render(<SettingsBody />)
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Сервис временно недоступен'))
        expect(toast.success).not.toHaveBeenCalledWith('Нормы пересчитаны')
    })
})
