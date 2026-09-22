/**
 * The onboarding a visitor can do before having an account.
 *
 * Two things happen here that the rest of the app never does: a calculation
 * with no session behind it, and a record of somebody who is not a user yet.
 */

import { apiClient } from '@/shared/utils/api-client'

export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active'
export type FitnessGoal = 'loss' | 'maintain' | 'gain'

export interface GuestParameters {
    sex: Sex | ''
    birth_date: string
    height_cm: number | null
    weight_kg: number | null
    activity_level: ActivityLevel
    goal: FitnessGoal
}

export interface GuestResult {
    calories: number
    protein: number
    fat: number
    carbs: number
    bmr: number
    tdee: number
    water_glasses: number
}

export interface LeadConsents {
    data_processing: boolean
    contact: boolean
}

export interface SavedLead {
    id: string
    email: string
    name?: string
    parameters: GuestParameters
    result?: GuestResult
    last_step: string
}

/** Where the browser keeps its claim on a saved lead. */
export const LEAD_TOKEN_KEY = 'lead_token'

export const guestApi = {
    /** The same formula a signed-in user gets. Nothing is stored. */
    calculate(parameters: GuestParameters): Promise<GuestResult> {
        return apiClient.post<GuestResult>('/api/v1/public/nutrition/calculate', parameters)
    },

    /**
     * Saves the attempt. Refused by the server without the data-processing
     * consent, because body parameters are health data.
     */
    async createLead(input: {
        email: string
        name?: string
        parameters: GuestParameters
        result: GuestResult | null
        last_step: string
        source?: string
        /**
         * Where the contact was left: contact_step | result | bot. Left
         * unset, the server assumes contact_step — the only place a lead
         * was ever created before the result screen could capture one too.
         */
        capture_source?: string
        consents: LeadConsents
    }): Promise<{ token: string; lead: SavedLead }> {
        return apiClient.post('/api/v1/public/leads', input)
    },

    /** Records how far somebody got, so a follow-up knows what to say. */
    async updateStep(token: string, step: string): Promise<void> {
        await apiClient.post('/api/v1/public/leads/step', { token, step })
    },

    /** Opens a saved attempt from the link in the reminder. */
    async resume(token: string): Promise<SavedLead> {
        const data = await apiClient.get<{ lead: SavedLead }>(
            `/api/v1/public/leads/resume?token=${encodeURIComponent(token)}`
        )
        return data.lead
    },
}

/**
 * Keeps the token where both the registration form and the provider callback
 * can find it: localStorage for the app, a cookie for the redirect that comes
 * back through the server.
 */
export function rememberLeadToken(token: string): void {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(LEAD_TOKEN_KEY, token)
    } catch {
        // Private browsing can refuse storage; the cookie below still works.
    }
    // Not HttpOnly on purpose: this is the browser's own claim on its lead,
    // and the wizard has to be able to clear it.
    document.cookie = `${LEAD_TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${14 * 24 * 60 * 60}; samesite=lax`
}

export function leadToken(): string | null {
    if (typeof window === 'undefined') return null
    try {
        return localStorage.getItem(LEAD_TOKEN_KEY)
    } catch {
        // Молчим намеренно: приватный просмотр отказывает в хранилище, и это
        // не отказ сервера — показывать нечего. Ответ «токена нет» здесь
        // верен: дальше по коду он означает «начинаем заново», а не ошибку.
        return null
    }
}

export function forgetLeadToken(): void {
    if (typeof window === 'undefined') return
    try {
        localStorage.removeItem(LEAD_TOKEN_KEY)
    } catch {
        // Nothing to clean up if storage was never available.
    }
    document.cookie = `${LEAD_TOKEN_KEY}=; path=/; max-age=0; samesite=lax`
}

/**
 * Почта, которую гость назвал в мастере расчёта.
 *
 * Экран входа читает её отсюда, а не из хранилища мастера напрямую: features
 * не должны тянуть состояние друг друга. Пустая строка, если мастер не
 * проходили или хранилище недоступно (приватное окно, отключённые данные
 * сайта) — обращение обёрнуто, потому что доступ к localStorage в этих
 * случаях бросает исключение, а не возвращает null.
 */
export function guestEmail(): string {
    try {
        const raw = localStorage.getItem('guest-onboarding')
        if (!raw) return ''
        const parsed = JSON.parse(raw) as { state?: { email?: string } }
        return parsed.state?.email ?? ''
    } catch {
        return ''
    }
}
