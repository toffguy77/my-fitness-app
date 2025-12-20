/**
 * Утилиты для генерации инвайт-кодов
 */

/**
 * Генерирует случайный инвайт-код из 8 символов
 * Исключает похожие символы: 0, O, I, 1
 */
export function generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Исключены 0, O, I, 1
    let code = ''
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
}

/**
 * Создает уникальный инвайт-код, проверяя его в базе данных
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function createUniqueInviteCode(
    supabase: SupabaseClient,
    maxAttempts: number = 10
): Promise<string> {
    let code = generateInviteCode()
    let attempts = 0

    while (attempts < maxAttempts) {
        const { data, error } = await supabase
            .from('invite_codes')
            .select('id')
            .eq('code', code)
            .single()

        if (error && error.code === 'PGRST116') {
            // Код не найден - он уникален
            return code
        }

        if (!data) {
            // Код уникален
            return code
        }

        // Код существует, генерируем новый
        code = generateInviteCode()
        attempts++
    }

    throw new Error('Failed to generate unique invite code after multiple attempts')
}

